const crypto = require('crypto');

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createResetCredentials = (now = new Date()) => {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  };
};

module.exports = { hashResetToken, createResetCredentials };
