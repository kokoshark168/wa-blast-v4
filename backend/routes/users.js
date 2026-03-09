const { Router } = require('express');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const auditLog = require('../middleware/auditLog');
const router = Router();

const crud = buildCrud('users', { allowedFields: ['phone','email','name','role'] });

router.get('/', auth, crud.getAll);
router.get('/:id', auth, crud.getById);
router.post('/', auth, adminOnly, auditLog('users.create'), crud.create);
router.patch('/:id', auth, adminOnly, auditLog('users.update'), crud.update);
router.put('/:id', auth, adminOnly, auditLog('users.update'), crud.update);
router.delete('/:id', auth, adminOnly, auditLog('users.delete'), crud.remove);

module.exports = router;
