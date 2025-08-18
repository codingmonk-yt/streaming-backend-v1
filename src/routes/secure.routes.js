const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { me, list } = require('../controller/users.controller');

// Any authenticated user
router.get('/me', authenticate, me);

// Super-admin only example
router.get('/users', authenticate, authorize('super-admin'), list);

module.exports = router;
