const nodemailer = require('nodemailer');

const isEmailConfigured = (env = process.env) => {
  const port = Number(env.SMTP_PORT);
  return Boolean(
    env.SMTP_HOST &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.SMTP_FROM
  );
};

const sendPasswordResetEmail = async ({ email, name, resetUrl }, env = process.env) => {
  const missing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
    .filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Password recovery email is missing configuration: ${missing.join(', ')}`);
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number');
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Reset your StudySpace password',
    text: `Hello ${name},\n\nUse this secure link to reset your StudySpace password. It expires in 15 minutes and can only be used once:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  });
};

module.exports = { isEmailConfigured, sendPasswordResetEmail };
