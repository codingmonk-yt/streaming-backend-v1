const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const ctrl = require('../controller/providers.controller');

// If you want providers to be public, remove `authenticate` from each route.

router.post('/', authenticate, ctrl.createProvider);
router.get('/', authenticate, ctrl.listProviders);
router.get('/:id', authenticate, ctrl.getProvider);
router.patch('/:id', authenticate, ctrl.updateProvider);
router.delete('/:id', authenticate, ctrl.deleteProvider);

module.exports = router;
