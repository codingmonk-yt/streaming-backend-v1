const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../util/password');
const { signAccessToken, signRefreshToken, verifyRefresh } = require('../util/jwt');

function buildTokens(sub, email, role) {
  const payload = { sub, email, role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  return { accessToken, refreshToken };
}

// POST /api/auth/register
// Creates a regular user in DB
async function register(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already exists' });

    const passwordHash = await hashPassword(password);
    const user = await User.create({ email: email.toLowerCase(), passwordHash });

    const { accessToken, refreshToken } = buildTokens(user._id.toString(), user.email, 'user');
    return res.status(201).json({
      user: { id: user._id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/login
// Super-admin if env creds match; else DB user => role user
async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const saEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
    const saPass = process.env.SUPER_ADMIN_PASSWORD || 'admin@123';

    if (email.toLowerCase() === saEmail && password === saPass) {
      const { accessToken, refreshToken } = buildTokens('super-admin', email.toLowerCase(), 'super-admin');
      return res.json({
        user: { id: 'super-admin', email: email.toLowerCase() },
        accessToken,
        refreshToken,
      });
    }
        // 
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const { accessToken, refreshToken } = buildTokens(user._id.toString(), user.email, 'user');
    return res.json({
      user: { id: user._id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/refresh
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ message: 'Missing refreshToken' });

    const decoded = verifyRefresh(refreshToken);
    // For super-admin (synthetic subject)
    if (decoded.role === 'super-admin' && decoded.sub === 'super-admin') {
      const { accessToken, refreshToken: newRefresh } = buildTokens('super-admin', decoded.email, 'super-admin');
      return res.json({ accessToken, refreshToken: newRefresh });
    }

    // For regular users, no isActive check (by request), just reissue
    const { accessToken, refreshToken: newRefresh } = buildTokens(decoded.sub, decoded.email, 'user');
    return res.json({ accessToken, refreshToken: newRefresh });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

module.exports = { register, login, refresh };
