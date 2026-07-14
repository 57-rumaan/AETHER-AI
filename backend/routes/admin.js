const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const modelsPath = path.join(__dirname, '../config/models.json');

// The admin password is NEVER in this file or in the frontend code.
// It lives in .env as ADMIN_PASSWORD_HASH (a bcrypt hash — see README.md
// for the one-line command that generates it). Nothing readable sits in
// the app for someone to find by opening dev tools or decompiling an APK.
const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  const token = req.cookies?.adminSession || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'not logged in' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'session expired' });
  }
}

// POST /api/admin/login  { password }
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const ok = password && (await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH || ''));
  if (!ok) return res.status(401).json({ error: 'wrong password' });
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('adminSession', token, { httpOnly: true, sameSite: 'lax' }).json({ ok: true });
});

// ---- everything below requires a valid admin session ----
router.use(requireAdmin);

router.get('/models', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(modelsPath, 'utf-8')));
});

router.post('/models', (req, res) => {
  // Body: full models.json shape — provider added/removed, model enabled/disabled,
  // custom name set, per-model rules set. Frontend admin.html builds this object.
  fs.writeFileSync(modelsPath, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  // Wire this up to your real user table once you add a database.
  res.json({ note: 'Connect this to your users database to show signups, login history, and per-user chat/usage stats.' });
});

router.post('/rules', (req, res) => {
  const config = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
  config.globalRules = req.body.globalRules || '';
  fs.writeFileSync(modelsPath, JSON.stringify(config, null, 2));
  res.json({ ok: true });
});

module.exports = router;
