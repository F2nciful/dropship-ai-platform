import React, { useState, useEffect } from 'react';
import './App.css';
import { FiGlobe, FiSettings, FiX, FiMoon, FiSun, FiChevronDown, FiChevronUp, FiLogOut, FiActivity, FiList, FiBarChart2, FiClock } from 'react-icons/fi';

function Dashboard({ user, onLogout }) {
  const [language, setLanguage] = useState('en');
  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [selectedAgentLogs, setSelectedAgentLogs] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);
  const [agentStats, setAgentStats] = useState({});

  const translations = {
    en: {
      title: 'AI Agents Monitor',
      subtitle: 'Advanced Monitoring & Control',
      status: 'Active',
      goal: 'Goal',
      lastTask: 'Last Task',
      results: 'Results',
      settings: 'Appearance Settings',
      logout: 'Logout',
      tabs: {
        agents: 'Agents',
        tasks: 'Tasks',
        logs: 'Logs',
        stats: 'Statistics'
      }
    },
    ar: {
      title: 'مراقبة وكلاء AI',
      subtitle: 'المراقبة والتحكم المتقدم',
      status: 'نشط',
      goal: 'الهدف',
      lastTask: 'آخر مهمة',
      results: 'النتائج',
      settings: 'إعدادات المظهر',
      logout: 'تسجيل الخروج',
      tabs: {
        agents: 'الوكلاء',
        tasks: 'المهام',
        logs: 'السجلات',
        stats: 'الإحصائيات'
      }
    }
  };

  const t = translations[language];

  const agentsData = [
    { id: 1, name: "Product Research", role: "Product Research Specialist", goal: "Find trending products", lastTask: "Searching products", results: "5 new products found", uptime: '99.8%', tasksCompleted: 1247 },
    { id: 2, name: "Shopify Manager", role: "Shopify Store Manager", goal: "Manage Shopify store", lastTask: "Adding products", results: "3 products added", uptime: '99.9%', tasksCompleted: 856 },
    { id: 3, name: "Marketing & Ads", role: "Marketing Specialist", goal: "Create campaigns", lastTask: "Creating campaigns", results: "2 campaigns created", uptime: '98.5%', tasksCompleted: 432 },
    { id: 4, name: "Customer Service", role: "Customer Service Manager", goal: "Support customers", lastTask: "Answering queries", results: "14 issues resolved", uptime: '99.7%', tasksCompleted: 2156 },
    { id: 5, name: "Order Management", role: "Order Manager", goal: "Manage orders", lastTask: "Processing orders", results: "10 orders shipped", uptime: '99.9%', tasksCompleted: 1893 },
    { id: 6, name: "Competitor Analysis", role: "Competitor Analyst", goal: "Monitor competitors", lastTask: "Analyzing competitors", results: "15 changes found", uptime: '97.2%', tasksCompleted: 567 },
    { id: 7, name: "Inventory Management", role: "Inventory Manager", goal: "Maintain inventory", lastTask: "Checking stock", results: "3 products to order", uptime: '99.6%', tasksCompleted: 1034 },
    { id: 8, name: "Platform Sync", role: "Sync Manager", goal: "Sync platforms", lastTask: "Syncing products", results: "100% synced", uptime: '99.9%', tasksCompleted: 2341 },
    { id: 9, name: "Analytics", role: "Analytics Specialist", goal: "Analyze data", lastTask: "Creating report", results: "ROI: 245%", uptime: '99.4%', tasksCompleted: 789 },
    { id: 10, name: "Content Creator", role: "Content Creator", goal: "Create content", lastTask: "Writing descriptions", results: "Conversion: 3.5%", uptime: '98.9%', tasksCompleted: 645 },
    { id: 11, name: "Supplier Manager", role: "Supplier Manager", goal: "Manage suppliers", lastTask: "Negotiating", results: "12% savings", uptime: '99.1%', tasksCompleted: 456 },
  ];

  const mockTasks = [
    { id: 1, agent: 'Product Research', task: 'Search trending products', status: 'running', progress: 65 },
    { id: 2, agent: 'Marketing & Ads', task: 'Create Facebook campaign', status: 'running', progress: 40 },
    { id: 3, agent: 'Shopify Manager', task: 'Update product prices', status: 'completed', progress: 100 },
    { id: 4, agent: 'Customer Service', task: 'Process support tickets', status: 'running', progress: 75 },
    { id: 5, agent: 'Order Management', task: 'Ship pending orders', status: 'completed', progress: 100 },
  ];

  const mockLogs = [
    { time: '14:23:45', agent: 'Product Research', message: 'Found 5 trending products', level: 'success' },
    { time: '14:22:10', agent: 'Marketing & Ads', message: 'Campaign created successfully', level: 'success' },
    { time: '14:21:33', agent: 'Customer Service', message: 'Resolved 3 support tickets', level: 'success' },
    { time: '14:20:15', agent: 'Shopify Manager', message: 'Prices updated for 12 products', level: 'success' },
    { time: '14:19:42', agent: 'Order Management', message: 'Error: One shipment failed', level: 'error' },
    { time: '14:18:20', agent: 'Analytics', message: 'Daily report generated', level: 'success' },
  ];

  useEffect(() => {
    // Simulate real-time stats
    const stats = {};
    agentsData.forEach(agent => {
      stats[agent.id] = {
        uptime: agent.uptime,
        tasksCompleted: agent.tasksCompleted,
        avgResponseTime: Math.floor(Math.random() * 5000) + 1000 + 'ms'
      };
    });
    setAgentStats(stats);
    setActiveTasks(mockTasks);
  }, []);

  const getTaskStatusColor = (status) => {
    switch(status) {
      case 'running': return '#00ff41';
      case 'completed': return '#4ecdc4';
      case 'failed': return '#ff4444';
      default: return '#888';
    }
  };

  const getLogLevelColor = (level) => {
    switch(level) {
      case 'success': return '#00ff41';
      case 'error': return '#ff4444';
      case 'warning': return '#ffaa00';
      default: return '#888';
    }
  };

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <div className="header-content">
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <span className="user-info">👤 {user.name}</span>
        </div>
        <div className="header-controls">
          <div className="language-selector">
            <FiGlobe size={18} />
            <button
              className={language === 'en' ? 'active' : ''}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
            <button
              className={language === 'ar' ? 'active' : ''}
              onClick={() => setLanguage('ar')}
            >
              AR
            </button>
          </div>
          <button
            className="theme-btn"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {darkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <FiSettings size={20} />
          </button>
          <button
            className="logout-btn"
            onClick={onLogout}
            title="Logout"
          >
            <FiLogOut size={20} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-content">
            <div className="settings-header">
              <h3>{t.settings}</h3>
              <button className="close-settings" onClick={() => setShowSettings(false)}>
                <FiX size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: 0 }}>
              Theme settings available. Use Dark/Light mode button.
            </p>
          </div>
        </div>
      )}

      <div className="advanced-dashboard">
        
        {/* AGENTS SECTION */}
        <div className="dashboard-section agents-section">
          <div className="section-header">
            <FiActivity size={20} />
            <h2>{t.tabs.agents}</h2>
          </div>
          <div className="cameras-container">
            {agentsData.map((agent) => (
              <div
                key={agent.id}
                className="camera-card"
                onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
              >
                <div className="camera-header">
                  <div className="camera-label">
                    <span className="camera-name">{agent.name}</span>
                    <span className="camera-id">CAM {String(agent.id).padStart(2, '0')}</span>
                  </div>
                  <span className="live-indicator">● LIVE</span>
                </div>

                <div className="camera-body">
                  <div className="camera-view">
                    <p className="role-display">{agent.role}</p>
                  </div>

                  {expandedAgent === agent.id && (
                    <div className="camera-details">
                      <div className="detail-line">
                        <span className="label">{t.goal}:</span>
                        <span className="value">{agent.goal}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">{t.lastTask}:</span>
                        <span className="value">{agent.lastTask}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">{t.results}:</span>
                        <span className="value highlight">{agent.results}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">Uptime:</span>
                        <span className="value">{agent.uptime}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">Tasks Completed:</span>
                        <span className="value">{agent.tasksCompleted}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="camera-footer">
                  <div className="status-info">
                    <span className="status-badge">✅ {t.status}</span>
                  </div>
                  <button
                    className="expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedAgent(expandedAgent === agent.id ? null : agent.id);
                    }}
                  >
                    {expandedAgent === agent.id ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TASKS SECTION */}
        <div className="dashboard-section tasks-section">
          <div className="section-header">
            <FiList size={20} />
            <h2>{t.tabs.tasks}</h2>
          </div>
          <div className="tasks-list">
            {activeTasks.map((task) => (
              <div key={task.id} className="task-item">
                <div className="task-info">
                  <div className="task-header">
                    <span className="task-name">{task.agent}</span>
                    <span 
                      className="task-status"
                      style={{ color: getTaskStatusColor(task.status) }}
                    >
                      {task.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="task-description">{task.task}</p>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${task.progress}%`,
                      backgroundColor: getTaskStatusColor(task.status)
                    }}
                  />
                </div>
                <span className="progress-text">{task.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* LOGS SECTION */}
        <div className="dashboard-section logs-section">
          <div className="section-header">
            <FiClock size={20} />
            <h2>{t.tabs.logs}</h2>
          </div>
          <div className="logs-list">
            {mockLogs.map((log, idx) => (
              <div key={idx} className="log-item">
                <span 
                  className="log-level"
                  style={{ color: getLogLevelColor(log.level) }}
                >
                  ●
                </span>
                <span className="log-time">{log.time}</span>
                <span className="log-agent">{log.agent}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* STATS SECTION */}
        <div className="dashboard-section stats-section">
          <div className="section-header">
            <FiBarChart2 size={20} />
            <h2>{t.tabs.stats}</h2>
          </div>
          <div className="stats-grid">
            {agentsData.slice(0, 4).map((agent) => (
              <div key={agent.id} className="stat-card">
                <h4>{agent.name}</h4>
                <div className="stat-item">
                  <span>Uptime:</span>
                  <span className="stat-value">{agent.uptime}</span>
                </div>
                <div className="stat-item">
                  <span>Tasks:</span>
                  <span className="stat-value">{agent.tasksCompleted}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;