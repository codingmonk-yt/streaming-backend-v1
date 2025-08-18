const router = require('express').Router();
const { register, login, refresh } = require('../controller/auth.controller');
const validateEmail = require('../middlewares/validateEmail'); // <-- import

router.post('/register', validateEmail, register);
router.post('/login', validateEmail, login);
router.post('/refresh', refresh);

module.exports = router;
