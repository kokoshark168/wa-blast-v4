const { Router } = require('express');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

const crud = buildCrud('phone_groups', { allowedFields: ['name','description'] });

router.get('/', auth, crud.getAll);
router.get('/:id', auth, crud.getById);
router.post('/', auth, auditLog('phone_groups.create'), crud.create);
router.patch('/:id', auth, auditLog('phone_groups.update'), crud.update);
router.delete('/:id', auth, auditLog('phone_groups.delete'), crud.remove);

module.exports = router;
