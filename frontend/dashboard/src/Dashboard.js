import React, { useState, useEffect } from 'react';
import './App.css';
import { FiGlobe, FiSettings, FiX, FiMoon, FiSun, FiChevronDown, FiChevronUp, FiLogOut, FiActivity, FiList, FiBarChart2, FiClock } from 'react-icons/fi';

function Dashboard({ user, onLogout }) {
  const [language, setLanguage] = useState('en');
  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);
  const [agentStats, setAgentStats] = useState({});
  const [agentsData, setAgentsData] = useState([]);
  const [mockLogs, setMockLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const agentsRes = await fetch('http://localhost:5000/api/agents/status');
        const agentsJson = await agentsRes.json();
        if (agentsJson.agents) {
          setAgentsData(agentsJson.agents);
        }

        const tasksRes = await fetch('http://localhost:5000/api/tasks');
        const tasksJson = await tasksRes.json();
        setActiveTasks(tasksJson);

        const logsRes = await fetch('http://localhost:5000/api/logs');
        const logsJson = await logsRes.json();
        setMockLogs(logsJson);

        const stats = {};
        if (agentsJson.agents) {
          agentsJson.agents.forEach(agent => {
            stats[agent.id] = {
              uptime: '99.8%',
              tasksCompleted: Math.floor(Math.random() * 2000) + 500,
              avgResponseTime: Math.floor(Math.random() * 5000) + 1000 + 'ms'
            };
          });
        }
        setAgentStats(stats);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
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

  if (loading) {
    return (
      <div className={`app ${darkMode ? 'dark' : 'light'}`}>
        <header className="header">
          <div className="header-content">
            <h1>{t.title}</h1>
            <p>Loading...</p>
          </div>
        </header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <p style={{ color: 'var(--accent-color)', fontSize: '1.2em' }}>⏳ Loading data...</p>
        </div>
      </div>
    );
  }

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
              Connected to Backend API on http://localhost:5000
            </p>
          </div>
        </div>
      )}

      <div className="advanced-dashboard">
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
                        <span className="label">{t.status}:</span>
                        <span className="value">{agent.status || 'Active'}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">Uptime:</span>
                        <span className="value">{agentStats[agent.id]?.uptime || '99.8%'}</span>
                      </div>
                      <div className="detail-line">
                        <span className="label">Tasks:</span>
                        <span className="value highlight">{agentStats[agent.id]?.tasksCompleted || 0}</span>
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
                  <span className="stat-value">{agentStats[agent.id]?.uptime || '99.8%'}</span>
                </div>
                <div className="stat-item">
                  <span>Tasks:</span>
                  <span className="stat-value">{agentStats[agent.id]?.tasksCompleted || 0}</span>
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