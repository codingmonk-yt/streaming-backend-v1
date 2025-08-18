const router = require('express').Router();
const { register, login, refresh } = require('../controller/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);

module.exports = router;
