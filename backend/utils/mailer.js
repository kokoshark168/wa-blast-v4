const nodemailer = require('nodemailer');
const { getDb } = require('../db/init');

function getSmtpSetting(key, fallback) {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value || fallback;
  } catch {
    return fallback;
  }
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || getSmtpSetting('smtp_host', 'smtp.gmail.com'),
    port: parseInt(process.env.SMTP_PORT || getSmtpSetting('smtp_port', '587')),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || getSmtpSetting('smtp_user', ''),
      pass: process.env.SMTP_PASS || getSmtpSetting('smtp_pass', ''),
    },
  });
}

async function sendOTP(email, code) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || getSmtpSetting('smtp_from', '"WA Blast Backoffice" <noreply@example.com>');
  await transporter.sendMail({
    from,
    to: email,
    subject: 'Your Login OTP Code',
    html: `<div style="font-family:sans-serif;padding:20px"><h2>WA Blast Backoffice</h2><p>Your OTP code is:</p><h1 style="color:#10b981;font-size:36px;letter-spacing:8px">${code}</h1><p>This code expires in 5 minutes.</p><p style="color:#666">If you didn't request this, please ignore this email.</p></div>`,
  });
}

module.exports = { sendOTP };
