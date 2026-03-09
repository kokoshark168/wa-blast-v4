const { Router } = require('express');
const { getDb } = require('../db/init');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', auth, upload.single('file'), auditLog('media.upload'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = getDb();
  const result = db.prepare('INSERT INTO media (filename, original_name, mime_type, size, path) VALUES (?,?,?,?,?)').run(
    req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path
  );
  res.status(201).json(db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/', auth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM media ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

router.delete('/:id', auth, auditLog('media.delete'), (req, res) => {
  const db = getDb();
  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(media.path); } catch (e) { /* file may not exist */ }
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
