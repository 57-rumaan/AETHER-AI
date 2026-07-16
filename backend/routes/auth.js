const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { loadModelConfig, saveModelConfig } = require('../config/store');

router.post('/signup', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password required' });
  try {
    const config = await loadModelConfig();
    const users = config.users || [];
    if (users.find(u => u.identifier === identifier)) {
      return res.status(409).json({ error: 'account already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    users.push({ id: Date.now().toString(), identifier, passwordHash, createdAt: new Date().toISOString() });
    config.users = users;
    await saveModelConfig(config);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create account — storage error.' });
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password required' });
  try {
    const config = await loadModelConfig();
    const users = config.users || [];
    const user = users.find(u => u.identifier === identifier);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax' }).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in — storage error.' });
  }
});

router.post('/oauth/:provider', (req, res) => {
  res.status(501).json({ error: `${req.params.provider} OAuth not wired up yet.` });
});

module.exports = router;
