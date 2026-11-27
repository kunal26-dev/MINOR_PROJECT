const assert = require('node:assert/strict');
const test = require('node:test');
const { createResetCredentials, hashResetToken } = require('./passwordReset');

test('password reset credentials only expose a single-use token and store its hash', () => {
  const credentials = createResetCredentials(new Date('2026-11-28T00:00:00.000Z'));

  assert.match(credentials.token, /^[a-f0-9]{64}$/);
  assert.equal(credentials.tokenHash, hashResetToken(credentials.token));
  assert.notEqual(credentials.tokenHash, credentials.token);
  assert.equal(credentials.expiresAt.toISOString(), '2026-11-28T00:15:00.000Z');
});

test('password reset token hashes are deterministic but differ for different tokens', () => {
  assert.equal(hashResetToken('token-one'), hashResetToken('token-one'));
  assert.notEqual(hashResetToken('token-one'), hashResetToken('token-two'));
});
