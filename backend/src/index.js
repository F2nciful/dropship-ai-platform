const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const agentsRoutes = require('./routes/agents');

// Routes
app.use('/api/agents', agentsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: '✅ Server is running',
    timestamp: new Date(),
    agents: 11
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🤖 AI Dropshipping Platform API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      agents: '/api/agents',
      agentStatus: '/api/agents/status'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: err.message 
  });
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 11 AI Agents ready`);
  console.log(`📡 API endpoints:`);
  console.log(`   - Health: http://localhost:${PORT}/api/health`);
  console.log(`   - Agents: http://localhost:${PORT}/api/agents/status`);
});