const express = require('express');
const router = express.Router();

// Mock agents data
const agents = [
  { id: 1, name: "Product Research", status: "✅ Running", role: "Product Research Specialist" },
  { id: 2, name: "Shopify Manager", status: "✅ Running", role: "Shopify Store Manager" },
  { id: 3, name: "Marketing & Ads", status: "✅ Running", role: "Marketing & Ads Specialist" },
  { id: 4, name: "Customer Service", status: "✅ Running", role: "Customer Service Manager" },
  { id: 5, name: "Order Management", status: "✅ Running", role: "Order Manager" },
  { id: 6, name: "Competitor Analysis", status: "✅ Running", role: "Competitor Analyst" },
  { id: 7, name: "Inventory Management", status: "✅ Running", role: "Inventory Manager" },
  { id: 8, name: "Platform Sync", status: "✅ Running", role: "Platform Synchronization Manager" },
  { id: 9, name: "Analytics", status: "✅ Running", role: "Analytics Specialist" },
  { id: 10, name: "Content Creator", status: "✅ Running", role: "Content Creator" },
  { id: 11, name: "Supplier Manager", status: "✅ Running", role: "Supplier Relationship Manager" }
];

// Get all agents status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: agents,
    timestamp: new Date()
  });
});

// Get specific agent details
router.get('/:agentId', (req, res) => {
  const agent = agents.find(a => a.id === parseInt(req.params.agentId));
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }
  res.json({ success: true, data: agent });
});

// Start a task for an agent
router.post('/:agentId/task', (req, res) => {
  const agent = agents.find(a => a.id === parseInt(req.params.agentId));
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  const task = {
    agentId: agent.id,
    agentName: agent.name,
    taskData: req.body,
    status: 'started',
    createdAt: new Date()
  };

  res.json({ success: true, data: task, message: 'Task started' });
});

// Get agent task history
router.get('/:agentId/history', (req, res) => {
  const agent = agents.find(a => a.id === parseInt(req.params.agentId));
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  const history = [
    { task: 'Search trending products', status: 'completed', timestamp: new Date() },
    { task: 'Analyze market trends', status: 'completed', timestamp: new Date() },
    { task: 'Calculate profit margins', status: 'completed', timestamp: new Date() }
  ];

  res.json({ success: true, data: history });
});

module.exports = router;