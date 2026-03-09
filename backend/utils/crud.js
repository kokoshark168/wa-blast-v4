// Generic CRUD helper factory
const { getDb } = require('../db/init');

function buildCrud(table, { allowedFields = [], searchFields = [] } = {}) {
  return {
    getAll(req, res) {
      try {
        const db = getDb();
        const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
        res.json({ data: rows, total: rows.length });
      } catch (e) {
        console.error(`CRUD getAll ${table}:`, e.message);
        res.status(500).json({ error: 'Database error' });
      }
    },
    getById(req, res) {
      try {
        const db = getDb();
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
      } catch (e) {
        console.error(`CRUD getById ${table}:`, e.message);
        res.status(500).json({ error: 'Database error' });
      }
    },
    create(req, res) {
      try {
        const db = getDb();
        const fields = allowedFields.filter(f => req.body[f] !== undefined);
        if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
        const vals = fields.map(f => req.body[f]);
        const sql = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`;
        const result = db.prepare(sql).run(...vals);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
        res.status(201).json(row);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Duplicate entry' });
        }
        console.error(`CRUD create ${table}:`, e.message);
        res.status(500).json({ error: 'Database error' });
      }
    },
    update(req, res) {
      try {
        const db = getDb();
        const fields = allowedFields.filter(f => req.body[f] !== undefined);
        if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
        const sets = fields.map(f => `${f} = ?`).join(', ');
        const vals = fields.map(f => req.body[f]);
        db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals, req.params.id);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Duplicate entry' });
        }
        console.error(`CRUD update ${table}:`, e.message);
        res.status(500).json({ error: 'Database error' });
      }
    },
    remove(req, res) {
      try {
        const db = getDb();
        const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
        if (!result.changes) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
      } catch (e) {
        console.error(`CRUD remove ${table}:`, e.message);
        res.status(500).json({ error: 'Database error' });
      }
    }
  };
}

module.exports = { buildCrud };
