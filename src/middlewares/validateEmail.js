function validateEmail(req, res, next) {
  const { email } = req.body || {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: 'Valid email required' });
  }
  next();
}
module.exports = validateEmail;