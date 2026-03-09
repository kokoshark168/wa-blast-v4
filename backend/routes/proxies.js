const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { requireFields } = require('../utils/validate');
const router = Router();

const crud = buildCrud('proxies', { allowedFields: ['host','port','username','password','type','status','assigned_count'] });

router.get('/', auth, crud.getAll);
router.get('/:id', auth, crud.getById);

// Create with duplicate check
router.post('/', auth, auditLog('proxies.create'), (req, res, next) => {
  const err = requireFields(req.body, ['host', 'port']);
  if (err) return res.status(400).json({ error: err });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM proxies WHERE host = ? AND port = ?').get(req.body.host, req.body.port);
  if (existing) return res.status(409).json({ error: 'Proxy with same host:port already exists' });
  next();
}, crud.create);

router.patch('/:id', auth, auditLog('proxies.update'), crud.update);
router.put('/:id', auth, auditLog('proxies.update'), crud.update);
router.delete('/:id', auth, auditLog('proxies.delete'), crud.remove);

module.exports = router;
