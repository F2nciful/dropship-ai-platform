const express = require('express');
const db = require('../database.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY id').all();
  res.json({ success: true, plans });
});

module.exports = router;
