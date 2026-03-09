const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { requireFields, isValidPhone, isValidCsv } = require('../utils/validate');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const router = Router();

// Multer config for CSV/Excel uploads
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads', 'imports'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and Excel files are allowed'));
  }
});

const crud = buildCrud('contact_lists', { allowedFields: ['name','count'] });

router.get('/', auth, crud.getAll);
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM contact_lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  list.contacts = db.prepare('SELECT * FROM contacts WHERE list_id = ?').all(req.params.id);
  res.json(list);
});

router.post('/', auth, auditLog('contact_lists.create'), (req, res, next) => {
  const err = requireFields(req.body, ['name']);
  if (err) return res.status(400).json({ error: err });
  next();
}, crud.create);

router.patch('/:id', auth, auditLog('contact_lists.update'), crud.update);
router.delete('/:id', auth, auditLog('contact_lists.delete'), crud.remove);

// Upload CSV: phone,name,var1,var2...
router.post('/:id/upload', auth, auditLog('contact_lists.upload'), (req, res) => {
  const { parse } = require('csv-parse/sync');
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv field required' });
  if (!isValidCsv(csv)) return res.status(400).json({ error: 'Invalid CSV format' });

  try {
    const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.status(400).json({ error: 'CSV has no data rows' });

    // Check that phone column exists
    if (!records[0].hasOwnProperty('phone')) {
      return res.status(400).json({ error: 'CSV must have a "phone" column' });
    }

    // Validate phone numbers
    const invalid = records.filter(r => r.phone && !isValidPhone(r.phone));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid phone numbers: ${invalid.slice(0, 5).map(r => r.phone).join(', ')}${invalid.length > 5 ? '...' : ''}` });
    }

    const db = getDb();
    const list = db.prepare('SELECT id FROM contact_lists WHERE id = ?').get(req.params.id);
    if (!list) return res.status(404).json({ error: 'Contact list not found' });

    const stmt = db.prepare('INSERT INTO contacts (list_id, phone, name, vars) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const r of records) {
        if (!r.phone) continue;
        const { phone, name, ...vars } = r;
        stmt.run(req.params.id, phone, name || null, JSON.stringify(vars));
      }
    });
    tx();
    db.prepare('UPDATE contact_lists SET count = (SELECT COUNT(*) FROM contacts WHERE list_id = ?) WHERE id = ?').run(req.params.id, req.params.id);
    res.json({ imported: records.length });
  } catch (e) {
    res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }
});

// === CSV/Excel File Import ===
function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^0-9+]/g, '');
  // Remove leading + for processing
  if (p.startsWith('+')) p = p.slice(1);
  // Indonesian numbers: 08xxx -> 628xxx
  if (p.startsWith('0')) p = '62' + p.slice(1);
  // If short (no country code), assume Indonesia
  if (p.length >= 9 && p.length <= 12 && !p.startsWith('62')) p = '62' + p;
  return p || null;
}

router.post('/:id/import', auth, auditLog('contact_lists.import'), upload.single('file'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id FROM contact_lists WHERE id = ?').get(req.params.id);
  if (!list) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch(e) {}
    return res.status(404).json({ error: 'Contact list not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'File is required (CSV or Excel)' });

  try {
    let records = [];
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.csv') {
      const { parse } = require('csv-parse/sync');
      const content = fs.readFileSync(req.file.path, 'utf8');
      records = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } else {
      // Excel
      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    if (!records.length) return res.status(400).json({ error: 'File has no data rows' });

    // Detect phone column (phone_number, phone, number, nomor, hp)
    const firstRow = records[0];
    const phoneCol = Object.keys(firstRow).find(k =>
      /^(phone_number|phone|number|nomor|hp|no_hp|no_telp)$/i.test(k.trim())
    );
    if (!phoneCol) return res.status(400).json({ error: 'No phone column found. Use: phone_number, phone, or number' });

    const nameCol = Object.keys(firstRow).find(k => /^(name|nama)$/i.test(k.trim()));
    const tagsCol = Object.keys(firstRow).find(k => /^(tags|tag|label)$/i.test(k.trim()));

    // Get existing phones for dedup
    const existingPhones = new Set(
      db.prepare('SELECT phone FROM contacts WHERE list_id = ?').all(req.params.id).map(c => c.phone)
    );

    let imported = 0, skipped = 0, duplicates = 0, invalid = 0;
    const seen = new Set();

    const stmt = db.prepare('INSERT INTO contacts (list_id, phone, name, vars) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const row of records) {
        const rawPhone = String(row[phoneCol] || '').trim();
        if (!rawPhone) { skipped++; continue; }

        const phone = normalizePhone(rawPhone);
        if (!phone || phone.length < 10 || phone.length > 15) { invalid++; continue; }

        // Dedup within file
        if (seen.has(phone)) { duplicates++; continue; }
        seen.add(phone);

        // Dedup against existing
        if (existingPhones.has(phone)) { duplicates++; continue; }

        const name = nameCol ? String(row[nameCol] || '').trim() : null;
        const tags = tagsCol ? String(row[tagsCol] || '').trim() : null;
        const vars = {};
        if (tags) vars.tags = tags;
        // Include any extra columns
        for (const [k, v] of Object.entries(row)) {
          if (k !== phoneCol && k !== nameCol && k !== tagsCol && v) vars[k] = String(v).trim();
        }

        stmt.run(req.params.id, phone, name || null, JSON.stringify(vars));
        imported++;
      }
    });
    tx();

    // Update count
    db.prepare('UPDATE contact_lists SET count = (SELECT COUNT(*) FROM contacts WHERE list_id = ?) WHERE id = ?').run(req.params.id, req.params.id);

    res.json({ imported, skipped, duplicates, invalid, total: records.length });
  } catch (e) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch(e2) {}
    res.status(400).json({ error: 'Import failed: ' + e.message });
  }
});

module.exports = router;
