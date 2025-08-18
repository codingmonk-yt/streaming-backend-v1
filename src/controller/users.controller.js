const User = require('../models/User');

// GET /api/secure/me
async function me(req, res) {
  // req.user set by auth middleware from JWT
  return res.json({
    id: req.user.sub,
    email: req.user.email,
    role: req.user.role,
  });
}

// GET /api/secure/users (super-admin only)
async function list(req, res) {
  const users = await User.find({}, { email: 1, createdAt: 1 }).sort({ createdAt: -1 });
  return res.json(users);
}

module.exports = { me, list };
