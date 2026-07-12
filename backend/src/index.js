const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const db = require('./database.js');
const { initDatabase } = db;
const { requireAuth } = require('./middleware/auth.js');
const logger = require('./utils/logger.js');

const app = express();

app.use(helmet());

// Comma-separated allowlist (mirrors the FastAPI side's cors_origins_list pattern) —
// supports multiple origins in production while defaulting to the local dev frontend.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim());
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe requires the raw (unparsed) request body to verify webhook signatures, so this
// route is mounted with express.raw() ahead of the app-wide express.json() below.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/billing.js').webhookHandler
);

app.use(express.json());

// Initialize Database
initDatabase();

// Brute-force protection on auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, try again later' },
});
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);

// Auth routes (register/login) must be mounted before the global auth gate below,
// since they're how a user gets a token in the first place.
app.use('/api/users', require('./routes/users.js'));

// Everything else requires a valid JWT — Stripe's webhook has no user JWT, so it's whitelisted too.
const PUBLIC_PATHS = ['/api/health', '/api/users/register', '/api/users/login', '/api/billing/webhook'];
app.use((req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  return requireAuth(req, res, next);
});

app.use('/api/plans', require('./routes/plans.js'));
app.use('/api/user', require('./routes/user.js'));
app.use('/api/admin', require('./routes/admin.js'));
app.use('/api/webhooks', require('./routes/webhooks.js'));
app.use('/api/notifications', require('./routes/notifications.js'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Server is running', agents: 12 });
});

// Agents - GET /api/agents
app.get('/api/agents', (req, res) => {
  const agents = [
    { 
      id: 0, name: 'Manager', status: 'active', type: 'manager',
      role: 'System Coordinator', description: 'Orchestrates all agent operations',
      coordinating: 11, tasks_running: 5, uptime: '99.8%', icon: '👨‍💼',
      efficiency: '98.5%', success_rate: '99.2%', avg_response_time: '245ms'
    },
    { id: 1, name: 'Product Research', status: 'online', type: 'research', role: 'Product Analysis', agent_name: 'Product Research' },
    { id: 2, name: 'Pricing AI', status: 'online', type: 'pricing', role: 'Price Optimization', agent_name: 'Pricing AI' },
    { id: 3, name: 'Inventory Checker', status: 'busy', type: 'inventory', role: 'Stock Management', agent_name: 'Inventory Checker' },
    { id: 4, name: 'Marketing Agent', status: 'online', type: 'marketing', role: 'Campaign Manager', agent_name: 'Marketing Agent' },
    { id: 5, name: 'Social Media Bot', status: 'online', type: 'social', role: 'Content Creation', agent_name: 'Social Media Bot' },
    { id: 6, name: 'Payment Processor', status: 'online', type: 'payment', role: 'Transaction Handler', agent_name: 'Payment Processor' },
    { id: 7, name: 'Supplier Manager', status: 'busy', type: 'supplier', role: 'Vendor Relations', agent_name: 'Supplier Manager' },
    { id: 8, name: 'Analytics Dashboard', status: 'online', type: 'analytics', role: 'Data Analysis', agent_name: 'Analytics Dashboard' },
    { id: 9, name: 'Customer Support', status: 'online', type: 'support', role: 'Help Center', agent_name: 'Customer Support' },
    { id: 10, name: 'Email Campaign', status: 'online', type: 'email', role: 'Newsletter', agent_name: 'Email Campaign' },
    { id: 11, name: 'Shipping Agent', status: 'offline', type: 'shipping', role: 'Logistics', agent_name: 'Shipping Agent' },
  ];
  res.json({ agents });
});

// Tasks - GET /api/tasks
app.get('/api/tasks', (req, res) => {
  const tasks = [
    { id: 1, title: 'Update pricing', status: 'completed', description: 'Price sync', name: 'Update pricing' },
    { id: 2, title: 'Check inventory', status: 'running', description: 'Stock check', name: 'Check inventory' },
    { id: 3, title: 'Email campaign', status: 'pending', description: 'Newsletter', name: 'Email campaign' },
  ];
  res.json({ tasks });
});

// Logs - GET /api/logs
app.get('/api/logs', (req, res) => {
  const logs = [
    { id: 1, level: 'info', message: 'Agent started', timestamp: '14:35', msg: 'Agent started' },
    { id: 2, level: 'success', message: 'Task completed', timestamp: '14:32', msg: 'Task completed' },
    { id: 3, level: 'warning', message: 'Low stock alert', timestamp: '14:28', msg: 'Low stock alert' },
  ];
  res.json({ logs });
});

// POST - Create Agent
app.post('/api/agents', (req, res) => {
  const { name, status, type } = req.body;
  res.json({ success: true, message: 'Agent created', agent: { id: Date.now(), name, status, type } });
});

// PUT - Update Agent
app.put('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  res.json({ success: true, message: 'Agent updated', id, status });
});

// DELETE - Delete Agent
app.delete('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  res.json({ success: true, message: 'Agent deleted', id });
});

// Centralized error handler — must be the last app.use(). Logs full details always, but
// only returns the stack trace to the client outside production.
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { path: req.path, error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info('12 AI Agents ready (1 Manager + 11 Workers)');
});