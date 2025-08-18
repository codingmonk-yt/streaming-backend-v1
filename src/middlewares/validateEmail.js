// src/middlewares/validateEmail.js
function validateEmail(req, res, next) {
  const { email } = req.body || {};
  // Basic RFC5322 regex for email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: 'Valid email required' });
  }
  next();
}

module.exports = validateEmail;
