const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Swap this in-memory array for a real database (Firebase, Supabase, MongoDB...)
// before going live — it resets every time the server restarts.
const users = [];

router.post('/signup', async (req, res) => {
  const { identifier, password } = req.body; // identifier = email or phone
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password required' });
  if (users.find(u => u.identifier === identifier)) return res.status(409).json({ error: 'account already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ id: Date.now().toString(), identifier, passwordHash, createdAt: new Date().toISOString() });
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  const user = users.find(u => u.identifier === identifier);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax' }).json({ ok: true });
});

// Google / Facebook login: use their official OAuth flow (Firebase Auth is the
// fastest free way to get both working — see README.md "Auth options").
router.post('/oauth/:provider', (req, res) => {
  res.status(501).json({ error: `${req.params.provider} OAuth not wired up yet — see README.md` });
});

module.exports = router;
