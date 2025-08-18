const { verifyAccess } = require('../util/jwt');

function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing token' });
    const decoded = verifyAccess(token);
    // decoded: { sub, email, role, iat, exp }
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function authorize(...allowed) {
  return (req, res, next) => {
    if (!req.user?.role || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
