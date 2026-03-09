const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const { sendOTP: sendOTPEmail } = require('../utils/mailer');
const router = Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/request-otp
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'Email not registered' });

  // Expire previous OTPs
  db.prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0').run(email.toLowerCase());

  const code = '123456'; // Default OTP for easy login
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email.toLowerCase(), code, expires_at);

  // Try sending email, but always show OTP on screen as fallback
  let emailSent = false;
  try {
    const smtpUser = db.prepare("SELECT value FROM settings WHERE key = 'smtp_pass'").get();
    if (smtpUser?.value) {
      await sendOTPEmail(email, code);
      emailSent = true;
    }
  } catch (e) {
    console.error('OTP email failed (showing on screen):', e.message);
  }

  // Always include OTP in response — frontend shows it on screen
  res.json({ message: emailSent ? 'OTP sent to email' : 'OTP generated', otp_code: code });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  const db = getDb();
  const verifyOtp = db.transaction(() => {
    const otp = db.prepare("SELECT * FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now', 'localtime') ORDER BY id DESC LIMIT 1").get(email.toLowerCase(), code);
    if (!otp) return null;
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);
    return otp;
  });

  const otp = verifyOtp();
  if (!otp) return res.status(401).json({ error: 'Invalid or expired OTP' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'User not found' });

  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', auth, (req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
