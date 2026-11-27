const assert = require('node:assert/strict');
const test = require('node:test');
const { isEmailConfigured } = require('./email');

test('password recovery requires complete SMTP configuration', () => {
  const config = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'studyspace',
    SMTP_PASS: 'private-test-value',
    SMTP_FROM: 'StudySpace <no-reply@example.com>',
  };

  assert.equal(isEmailConfigured(config), true);
  assert.equal(isEmailConfigured({ ...config, SMTP_PASS: '' }), false);
  assert.equal(isEmailConfigured({ ...config, SMTP_PORT: 'invalid' }), false);
});
