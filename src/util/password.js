const bcrypt = require('bcrypt');

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS );

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
