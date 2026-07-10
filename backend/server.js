const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Backend OK' });
});

// Agents
app.get('/api/agents', (req, res) => {
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

// Tasks
app.get('/api/tasks', (req, res) => {
  const tasks = [
    { id: 1, title: 'Find products', status: 'completed' },
    { id: 2, title: 'Update prices', status: 'running' },
    { id: 3, title: 'Check inventory', status: 'pending' },
  ];
  res.json({ ok: true, tasks });
});

// Logs
app.get('/api/logs', (req, res) => {
  const logs = [
    { id: 1, message: 'Agent started', type: 'info' },
    { id: 2, message: 'Products found', type: 'success' },
  ];
  res.json({ ok: true, logs });
});

// Agents Engine
const agentsEngine = require('./agentsEngine');
app.use('/api/engine', agentsEngine.router);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🤖 Agents: http://localhost:${PORT}/api/agents`);
  console.log(`📋 Tasks: http://localhost:${PORT}/api/tasks`);
  console.log(`📜 Logs: http://localhost:${PORT}/api/logs`);
});