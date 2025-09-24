const jwt = require('jsonwebtoken');

const ALG = 'HS256';
const DEFAULT_EXP_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret() {
  const s = process.env.JWT_SECRET || 'dev-secret-change-me';
  return s;
}

function sign(payload, { expiresIn } = {}) {
  return jwt.sign(payload, getSecret(), {
    algorithm: ALG,
    expiresIn: expiresIn || DEFAULT_EXP_SECONDS,
  });
}

function verify(token) {
  try {
    return jwt.verify(token, getSecret(), { algorithms: [ALG] });
  } catch (e) {
    return null;
  }
}

module.exports = { sign, verify };
