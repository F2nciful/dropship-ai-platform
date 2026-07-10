const express = require('express');
const router = express.Router();

// GET /api/agents
router.get('/', (req, res) => {
  const agents = [
    { id: 1, name: 'Product Research', status: 'online', type: 'research' },
    { id: 2, name: 'Pricing AI', status: 'online', type: 'pricing' },
    { id: 3, name: 'Inventory Checker', status: 'busy', type: 'inventory' },
    { id: 4, name: 'Marketing Agent', status: 'online', type: 'marketing' },
    { id: 5, name: 'Social Media Bot', status: 'offline', type: 'social' },
    { id: 6, name: 'Email Campaign', status: 'online', type: 'email' },
    { id: 7, name: 'Customer Support', status: 'busy', type: 'support' },
    { id: 8, name: 'Analytics Dashboard', status: 'online', type: 'analytics' },
    { id: 9, name: 'Supplier Manager', status: 'online', type: 'supplier' },
    { id: 10, name: 'Payment Processor', status: 'online', type: 'payment' },
    { id: 11, name: 'Shipping Agent', status: 'online', type: 'shipping' },
  ];
  res.json({ ok: true, agents });
});

// GET /api/agents/status
router.get('/status', (req, res) => {
  const agents = [
    { id: 1, name: 'Product Research', status: 'online', type: 'research' },
    { id: 2, name: 'Pricing AI', status: 'online', type: 'pricing' },
    { id: 3, name: 'Inventory Checker', status: 'busy', type: 'inventory' },
    { id: 4, name: 'Marketing Agent', status: 'online', type: 'marketing' },
    { id: 5, name: 'Social Media Bot', status: 'offline', type: 'social' },
    { id: 6, name: 'Email Campaign', status: 'online', type: 'email' },
    { id: 7, name: 'Customer Support', status: 'busy', type: 'support' },
    { id: 8, name: 'Analytics Dashboard', status: 'online', type: 'analytics' },
    { id: 9, name: 'Supplier Manager', status: 'online', type: 'supplier' },
    { id: 10, name: 'Payment Processor', status: 'online', type: 'payment' },
    { id: 11, name: 'Shipping Agent', status: 'online', type: 'shipping' },
  ];
  res.json({ ok: true, agents, count: agents.length });
});

module.exports = router;