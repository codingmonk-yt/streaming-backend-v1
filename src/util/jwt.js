const jwt = require('jsonwebtoken');

function signAccessToken(payload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN ;
  return jwt.sign(payload, secret, { expiresIn });
}

function signRefreshToken(payload) {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyAccess(token) {
  const secret = process.env.JWT_SECRET;
  return jwt.verify(token, secret);
}

function verifyRefresh(token) {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  return jwt.verify(token, secret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccess,
  verifyRefresh,
};
