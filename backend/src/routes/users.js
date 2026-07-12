const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-in-production';

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email);
    
    if (user) {
      return res.status(409).json({ success: false, message: 'User exists' });
    }

    // Every new user registers as a plain, non-admin account — is_admin defaults to 0 and
    // is never set here or anywhere else in the app; the only way to grant admin access is
    // a direct database edit (see database.js's is_admin backfill comment for the one-time
    // migration that preserved pre-existing admin accounts from the old role-based scheme).
    const hashedPassword = await bcryptjs.hash(password, 10);
    const insert = db.prepare('INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)');
    const result = insert.run(name, email, hashedPassword, new Date().toISOString());

    const token = jwt.sign({ userId: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: { id: result.lastInsertRowid, name, email, is_admin: false },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const match = await bcryptjs.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, is_admin: Boolean(user.is_admin) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Current user (session validation) — the frontend calls this on app load to confirm a
// stored token is still valid and to refresh role/plan after an admin change.
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;