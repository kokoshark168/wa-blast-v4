const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const breeding = require('../engine/breeding');
const router = Router();

const crud = buildCrud('breeding_sessions', { allowedFields: ['name','status','frequency_minutes','pairs','number_ids','message_templates'] });

router.get('/', auth, crud.getAll);
router.get('/:id', auth, crud.getById);
function stringifyArrays(req, res, next) {
  for (const key of ['number_ids', 'message_templates', 'pairs']) {
    if (Array.isArray(req.body[key])) req.body[key] = JSON.stringify(req.body[key]);
  }
  next();
}
router.post('/', auth, auditLog('breeding.create'), stringifyArrays, crud.create);
router.patch('/:id', auth, auditLog('breeding.update'), stringifyArrays, crud.update);
router.put('/:id', auth, auditLog('breeding.update'), stringifyArrays, crud.update);
router.delete('/:id', auth, auditLog('breeding.delete'), crud.remove);

router.post('/:id/start', auth, auditLog('breeding.start'), async (req, res) => {
  try {
    await breeding.startBreeding(Number(req.params.id));
    res.json({ message: 'Breeding session started' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/stop', auth, auditLog('breeding.stop'), (req, res) => {
  try {
    breeding.stopBreeding(Number(req.params.id));
    res.json({ message: 'Breeding session stopped' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
