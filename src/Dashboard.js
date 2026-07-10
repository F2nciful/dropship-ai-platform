import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';

const API_URL = 'http://localhost:5000/api';

const T = {
  en: {
    dashboard: 'Dashboard', agents: 'Agents', tasks: 'Tasks', logs: 'Logs',
    totalAgents: 'Total Agents', activeAgents: 'Active Agents', totalTasks: 'Total Tasks',
    completedTasks: 'Completed', searchAgents: 'Search agents...', searchTasks: 'Search tasks...',
    all: 'All', online: 'Online', offline: 'Offline', busy: 'Busy', running: 'Running',
    completed: 'Completed', failed: 'Failed', pending: 'Pending', lastActivity: 'Last activity',
    noAgents: 'No agents found', noTasks: 'No tasks found', noLogs: 'No logs yet',
    refresh: 'Refresh', autoRefresh: 'Auto refresh', welcome: 'Welcome back',
    overview: 'Here is your platform overview', dataRefreshed: 'Data refreshed',
    connectionError: 'Cannot reach backend', agentsShowing: 'agents showing',
    darkMode: 'Dark mode', language: 'Language', exportCSV: 'Export CSV',
    details: 'Details', close: 'Close', status: 'Status', type: 'Type',
    created: 'Created', message: 'Message', time: 'Time', backendOnline: 'Backend Online',
    backendOffline: 'Backend Offline', logout: 'Logout', manager: 'Manager Agent',
    coordinating: 'Coordinating', tasksRunning: 'Tasks Running', uptime: 'Uptime'
  }
};

const AGENT_ICONS = ['🔍', '📦', '💰', '📣', '🛒', '📊', '✉️', '🤖', '🎯', '⚙️', '🧠', '🚀'];

const normalizeList = (data, key) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  if (data && Array.isArray(data.data)) return data.data;
  return [];
};

function Dashboard({ user, onLogout }) {
  const [dark, setDark] = useState(() => localStorage.getItem('dsh-theme') !== 'light');
  const [lang, setLang] = useState('en');
  const [page, setPage] = useState('dashboard');
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [backendUp, setBackendUp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [agentSearch, setAgentSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toastId = useRef(0);

  const [profits, setProfits] = useState({ 
    daily: 2450.50, 
    weekly: 14200, 
    growth: 23,
    target: 3000
  });
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', message: '✓ 12 products updated successfully', time: '14:32' },
    { id: 2, type: 'warning', message: '⚠ 3 items low on inventory', time: '14:25' },
    { id: 3, type: 'info', message: 'ℹ Manager coordinated 5 agents', time: '14:10' },
  ]);
  const [activities, setActivities] = useState([
    { id: 1, agent: '📣 Marketing', action: 'Launched campaign for premium products', time: '14:35' },
    { id: 2, agent: '💰 Pricing', action: 'Optimized pricing on 12 items', time: '14:32' },
    { id: 3, agent: '📦 Inventory', action: 'Restocked 5 items below threshold', time: '14:28' },
    { id: 4, agent: '👨‍💼 Manager', action: 'Synchronized all agent operations', time: '14:25' },
  ]);

  const [pausedAgents, setPausedAgents] = useState({});
  const [settingsAgent, setSettingsAgent] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('overview');
  const [visibleAgents, setVisibleAgents] = useState({});

  const [analyticsData, setAnalyticsData] = useState({
    weeklyPerformance: [
      { day: 'Mon', efficiency: 85, tasks: 12, success: 95 },
      { day: 'Tue', efficiency: 88, tasks: 15, success: 97 },
      { day: 'Wed', efficiency: 82, tasks: 10, success: 92 },
      { day: 'Thu', efficiency: 90, tasks: 18, success: 98 },
      { day: 'Fri', efficiency: 91, tasks: 20, success: 99 },
      { day: 'Sat', efficiency: 78, tasks: 8, success: 90 },
      { day: 'Sun', efficiency: 75, tasks: 5, success: 88 },
    ],
    agentStats: [
      { name: 'Product Research', tasks: 145, success: 97, avgTime: '2.3s' },
      { name: 'Pricing AI', tasks: 234, success: 99, avgTime: '1.8s' },
      { name: 'Inventory Checker', tasks: 156, success: 95, avgTime: '3.1s' },
      { name: 'Marketing Agent', tasks: 189, success: 98, avgTime: '2.5s' },
    ]
  });

  const t = T.en;

  const showToast = useCallback((msg, type = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3500);
  }, []);

  const fetchAll = useCallback(async (silent = true) => {
    try {
      const [aRes, tRes, lRes] = await Promise.allSettled([
        fetch(`${API_URL}/agents`).then(r => r.json()),
        fetch(`${API_URL}/tasks`).then(r => r.json()),
        fetch(`${API_URL}/logs`).then(r => r.json()),
      ]);

      if (aRes.status === 'fulfilled') setAgents(normalizeList(aRes.value, 'agents'));
      if (tRes.status === 'fulfilled') setTasks(normalizeList(tRes.value, 'tasks'));
      if (lRes.status === 'fulfilled') setLogs(normalizeList(lRes.value, 'logs'));

      const anyOk = [aRes, tRes, lRes].some(r => r.status === 'fulfilled');
      setBackendUp(anyOk);
      if (!silent && anyOk) showToast(t.dataRefreshed, 'success');
    } catch {
      setBackendUp(false);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => fetchAll(true), 15000);
    return () => clearInterval(iv);
  }, [autoRefresh, fetchAll]);

  useEffect(() => { localStorage.setItem('dsh-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => {
    localStorage.setItem('visibleAgents', JSON.stringify(visibleAgents));
  }, [visibleAgents]);

  useEffect(() => {
    const saved = localStorage.getItem('visibleAgents');
    if (saved) setVisibleAgents(JSON.parse(saved));
  }, []);

  const agentStatus = (a) => (a.status || 'offline').toLowerCase();
  const activeCount = agents.filter(a => ['online', 'active', 'running', 'busy'].includes(agentStatus(a))).length;
  const managerAgent = agents.find(a => a.type === 'manager');
  const workerAgents = agents.filter(a => a.type !== 'manager');
  const doneTasks = tasks.filter(x => (x.status || '').toLowerCase() === 'completed').length;

  const filteredAgents = workerAgents.filter(a => {
    const name = (a.name || a.agent_name || '').toLowerCase();
    const isVisible = visibleAgents[a.id] !== false;
    return name.includes(agentSearch.toLowerCase()) && isVisible;
  });

  const filteredTasks = tasks.filter(x => {
    const title = (x.title || x.name || '').toLowerCase();
    return title.includes(taskSearch.toLowerCase());
  });

  const exportCSV = () => {
    const rows = [['Name', 'Status', 'Type'], ...agents.map(a => [a.name || '', a.status || '', a.type || ''])];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agents.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePause = (agentId) => {
    setPausedAgents(prev => ({
      ...prev,
      [agentId]: !prev[agentId]
    }));
    showToast(pausedAgents[agentId] ? 'Agent resumed' : 'Agent paused', 'info');
  };

  const handleOpenSettings = (agent) => {
    setSettingsAgent(agent);
  };

  const handleSaveSettings = () => {
    showToast('Settings saved successfully', 'success');
    setSettingsAgent(null);
  };

  const toggleAgentVisibility = (agentId) => {
    setVisibleAgents(prev => ({
      ...prev,
      [agentId]: !prev[agentId]
    }));
  };

  const selectAllAgents = () => {
    const all = {};
    workerAgents.forEach(a => { all[a.id] = true; });
    setVisibleAgents(all);
    showToast('All agents selected', 'success');
  };

  const deselectAllAgents = () => {
    setVisibleAgents({});
    showToast('All agents deselected', 'info');
  };

  const StatusBadge = ({ status }) => {
    const st = (status || 'offline').toLowerCase();
    let cls = 'dsh-badge--off';
    if (['online', 'active'].includes(st)) cls = 'dsh-badge--on';
    else if (st === 'busy') cls = 'dsh-badge--busy';
    else if (st === 'completed') cls = 'dsh-badge--on';
    else if (st === 'failed') cls = 'dsh-badge--err';
    else if (st === 'paused') cls = 'dsh-badge--busy';
    return <span className={`dsh-badge ${cls}`}><span className="dsh-dot" />{t[st] || st}</span>;
  };

  const NAV = [
    { id: 'dashboard', icon: '◈', label: t.dashboard },
    { id: 'agents', icon: '🤖', label: t.agents },
    { id: 'tasks', icon: '☑', label: t.tasks },
    { id: 'logs', icon: '≣', label: t.logs },
    { id: 'analytics', icon: '📊', label: 'Analytics' },
  ];

  return (
    <div className={`dsh ${dark ? 'dsh--dark' : 'dsh--light'}`} dir="ltr">
      <div className="dsh-toasts">
        {toasts.map(x => (
          <div key={x.id} className={`dsh-toast dsh-toast--${x.type}`}>
            {x.type === 'success' ? '✓' : x.type === 'error' ? '✕' : 'ℹ'} {x.msg}
          </div>
        ))}
      </div>

      <button className="dsh-burger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>

      <aside className={`dsh-side ${sidebarOpen ? 'dsh-side--open' : ''}`}>
        <div className="dsh-logo">
          <span className="dsh-logo-mark">◆</span>
          <span className="dsh-logo-text">Dropship<b>AI</b></span>
        </div>

        <div className="dsh-profit-ticker">
          <div className="dsh-profit-label">💰 Daily Revenue</div>
          <div className="dsh-profit-value">${profits.daily.toFixed(2)}</div>
          <div className="dsh-profit-trend">📈 ${profits.weekly.toLocaleString()} this week • Target: ${profits.target}</div>
        </div>

        <nav className="dsh-nav">
          {NAV.map(n => (
            <button key={n.id} className={`dsh-nav-item ${page === n.id ? 'dsh-nav-item--active' : ''}`} onClick={() => { setPage(n.id); setSidebarOpen(false); }}>
              <span className="dsh-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="dsh-tabs">
          <button className={`dsh-tab ${sidebarTab === 'overview' ? 'dsh-tab--active' : ''}`} onClick={() => setSidebarTab('overview')}>
            📊 Overview
          </button>
          <button className={`dsh-tab ${sidebarTab === 'alerts' ? 'dsh-tab--active' : ''}`} onClick={() => setSidebarTab('alerts')}>
            🔔 Alerts
          </button>
          <button className={`dsh-tab ${sidebarTab === 'settings' ? 'dsh-tab--active' : ''}`} onClick={() => setSidebarTab('settings')}>
            ⚙️ Settings
          </button>
        </div>

        {sidebarTab === 'overview' && (
          <div className="dsh-side-stats">
            <div className="dsh-side-stat">
              <span className="dsh-side-stat-label">🤖 All Agents</span>
              <span className="dsh-side-stat-value">{agents.length}</span>
            </div>
            <div className="dsh-side-stat">
              <span className="dsh-side-stat-label">⚡ Working</span>
              <span className="dsh-side-stat-value">{activeCount}</span>
            </div>
          </div>
        )}

        {sidebarTab === 'alerts' && (
          <>
            <div className="dsh-alert-center">
              <div className="dsh-alert-header">
                <span>🔔 System Alerts</span>
                <div className="dsh-alert-badge">{alerts.length}</div>
              </div>
              <div className="dsh-alert-list">
                {alerts.map(alert => (
                  <div key={alert.id} className="dsh-alert-item">
                    <div className={`dsh-alert-dot dsh-alert-dot--${alert.type}`} />
                    <div className="dsh-alert-text">{alert.message}</div>
                    <div className="dsh-alert-time">{alert.time}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="dsh-activity-feed">
              <div className="dsh-activity-header">
                <div className="dsh-activity-dot" />
                Real-time Activity
              </div>
              <div className="dsh-activity-list">
                {activities.map(act => (
                  <div key={act.id} className="dsh-activity-item">
                    <div className="dsh-activity-agent">{act.agent}</div>
                    <div className="dsh-activity-action">{act.action}</div>
                    <div className="dsh-activity-time">{act.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {sidebarTab === 'settings' && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>
              Manage Agents
            </div>
            <div className="dsh-agent-list">
              {workerAgents.map(agent => (
                <div key={agent.id} className="dsh-agent-item">
                  <input 
                    type="checkbox" 
                    id={`agent-${agent.id}`}
                    checked={visibleAgents[agent.id] !== false}
                    onChange={() => toggleAgentVisibility(agent.id)}
                  />
                  <label htmlFor={`agent-${agent.id}`}>{agent.name}</label>
                </div>
              ))}
            </div>
            <button className="dsh-agent-controls-btn" onClick={selectAllAgents}>
              ✓ Select All
            </button>
            <button className="dsh-agent-controls-btn" onClick={deselectAllAgents}>
              ✕ Clear All
            </button>
          </div>
        )}

        <div className="dsh-side-footer">
          <div className={`dsh-conn ${backendUp ? 'dsh-conn--up' : 'dsh-conn--down'}`}>
            <span className="dsh-dot" />
            {backendUp ? t.backendOnline : t.backendOffline}
          </div>
          <div className="dsh-side-controls">
            <button className="dsh-ctl" onClick={() => setDark(!dark)}>{dark ? '☀️' : '🌙'}</button>
            <button className="dsh-ctl dsh-ctl--danger" onClick={onLogout}>⏻</button>
          </div>
        </div>
      </aside>

      <main className="dsh-main">
        <header className="dsh-header">
          <div>
            <h1 className="dsh-title">{t.welcome} 👋</h1>
            <p className="dsh-sub">{t.overview}</p>
          </div>
          <div className="dsh-header-actions">
            <label className="dsh-switch">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              <span className="dsh-switch-slider" />
            </label>
            <button className="dsh-btn dsh-btn--ghost" onClick={() => fetchAll(false)}>⟳ {t.refresh}</button>
          </div>
        </header>

        <section className="dsh-stats">
          <div className="dsh-stat dsh-stat--purple">
            <span className="dsh-stat-icon">🤖</span>
            <div>
              <div className="dsh-stat-num">{loading ? '…' : agents.length}</div>
              <div className="dsh-stat-label">{t.totalAgents}</div>
            </div>
          </div>
          <div className="dsh-stat dsh-stat--green">
            <span className="dsh-stat-icon">⚡</span>
            <div>
              <div className="dsh-stat-num">{loading ? '…' : activeCount}</div>
              <div className="dsh-stat-label">{t.activeAgents}</div>
            </div>
          </div>
          <div className="dsh-stat dsh-stat--blue">
            <span className="dsh-stat-icon">📋</span>
            <div>
              <div className="dsh-stat-num">{loading ? '…' : tasks.length}</div>
              <div className="dsh-stat-label">{t.totalTasks}</div>
            </div>
          </div>
          <div className="dsh-stat dsh-stat--gold">
            <span className="dsh-stat-icon">✅</span>
            <div>
              <div className="dsh-stat-num">{loading ? '…' : doneTasks}</div>
              <div className="dsh-stat-label">{t.completedTasks}</div>
            </div>
          </div>
        </section>

        {(page === 'dashboard' || page === 'agents') && (
          <section className="dsh-section">
            {managerAgent && (
              <div className="dsh-manager-hero">
                <div className="dsh-manager-content">
                  <div className="dsh-manager-header">
                    <div className="dsh-manager-icon">👨‍💼</div>
                    <div className="dsh-manager-info">
                      <h2 className="dsh-manager-name">{managerAgent.name}</h2>
                      <p className="dsh-manager-role">{managerAgent.role || t.manager}</p>
                    </div>
                    <StatusBadge status={managerAgent.status} />
                  </div>
                  <div className="dsh-manager-stats">
                    <div className="dsh-manager-stat">
                      <span className="dsh-manager-stat-label">{t.coordinating}</span>
                      <span className="dsh-manager-stat-value">{managerAgent.coordinating || 11}</span>
                    </div>
                    <div className="dsh-manager-stat">
                      <span className="dsh-manager-stat-label">{t.tasksRunning}</span>
                      <span className="dsh-manager-stat-value">{managerAgent.tasks_running || 5}</span>
                    </div>
                    <div className="dsh-manager-stat">
                      <span className="dsh-manager-stat-label">{t.uptime}</span>
                      <span className="dsh-manager-stat-value">{managerAgent.uptime || '99.8%'}</span>
                    </div>
                  </div>
                  <div className="dsh-manager-actions">
                    <button className="dsh-btn dsh-btn--primary">▶ {t.details}</button>
                    <button className="dsh-btn dsh-btn--ghost">⏸ Pause</button>
                    <button className="dsh-btn dsh-btn--ghost">⚙ Settings</button>
                  </div>
                </div>
              </div>
            )}

            <div className="dsh-section-head">
              <h2>{t.agents}</h2>
              <div className="dsh-tools">
                <input className="dsh-input" placeholder={t.searchAgents} value={agentSearch} onChange={e => setAgentSearch(e.target.value)} />
                <button className="dsh-btn dsh-btn--ghost" onClick={exportCSV}>⬇ {t.exportCSV}</button>
              </div>
            </div>

            {loading ? <div className="dsh-grid">{[...Array(6)].map((_, i) => <div key={i} className="dsh-skel" />)}</div> : filteredAgents.length === 0 ? <div className="dsh-empty">🤖 {t.noAgents}</div> : (
              <div className="dsh-grid">
                {filteredAgents.map((a, i) => (
                  <div key={a.id || i} className={`dsh-agent ${pausedAgents[a.id] ? 'dsh-agent--paused' : ''}`} onClick={() => setSelectedAgent(a)}>
                    <div className="dsh-agent-top">
                      <span className="dsh-agent-avatar">{AGENT_ICONS[i % AGENT_ICONS.length]}</span>
                      <StatusBadge status={pausedAgents[a.id] ? 'paused' : a.status} />
                    </div>
                    <h3 className="dsh-agent-name">{a.name || a.agent_name || 'Agent'}</h3>
                    <p className="dsh-agent-role">{a.type || a.role || '—'}</p>
                    <div className="dsh-agent-controls" onClick={(e) => e.stopPropagation()}>
                      <button className="dsh-agent-btn dsh-agent-btn--pause" onClick={() => togglePause(a.id)}>
                        {pausedAgents[a.id] ? '▶ Resume' : '⏸ Pause'}
                      </button>
                      <button className="dsh-agent-btn dsh-agent-btn--settings" onClick={() => handleOpenSettings(a)}>
                        ⚙ Settings
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'tasks' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>{t.tasks}</h2>
              <input className="dsh-input" placeholder={t.searchTasks} value={taskSearch} onChange={e => setTaskSearch(e.target.value)} />
            </div>
            {filteredTasks.length === 0 ? <div className="dsh-empty">📋 {t.noTasks}</div> : (
              <div className="dsh-list">
                {filteredTasks.map((x, i) => (
                  <div key={x.id || i} className="dsh-row">
                    <div className="dsh-row-main">
                      <strong>{x.title || x.name || 'Task'}</strong>
                      <span className="dsh-row-sub">{x.description || ''}</span>
                    </div>
                    <StatusBadge status={x.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'logs' && (
          <section className="dsh-section">
            <h2>{t.logs}</h2>
            {logs.length === 0 ? <div className="dsh-empty">≣ {t.noLogs}</div> : (
              <div className="dsh-logs">
                {logs.map((x, i) => <div key={x.id || i} className={`dsh-log dsh-log--${x.level || 'info'}`}><span className="dsh-log-lvl">{(x.level || 'INFO').toUpperCase()}</span><span className="dsh-log-msg">{x.message || x.msg || ''}</span></div>)}
              </div>
            )}
          </section>
        )}

        {page === 'analytics' && (
          <section className="dsh-section">
            <h2>📊 Performance Analytics</h2>
            
            <div className="dsh-analytics-grid">
              <div className="dsh-analytics-card">
                <h3>Weekly Performance</h3>
                <div className="dsh-chart">
                  {analyticsData.weeklyPerformance.map(day => (
                    <div key={day.day} className="dsh-chart-bar" style={{ height: `${day.efficiency}%` }} title={`${day.day}: ${day.efficiency}%`}>
                      <span className="dsh-chart-label">{day.day}</span>
                    </div>
                  ))}
                </div>
                <div className="dsh-chart-legend">Efficiency Rate (%)</div>
              </div>

              <div className="dsh-analytics-card">
                <h3>Agent Performance</h3>
                <div className="dsh-agent-stats">
                  {analyticsData.agentStats.map(agent => (
                    <div key={agent.name} className="dsh-agent-stat">
                      <div className="dsh-agent-stat-header">
                        <span className="dsh-agent-stat-name">{agent.name}</span>
                        <span className="dsh-agent-stat-success">{agent.success}%</span>
                      </div>
                      <div className="dsh-progress-bar">
                        <div className="dsh-progress-fill" style={{ width: `${agent.success}%` }} />
                      </div>
                      <div className="dsh-agent-stat-meta">
                        <span>{agent.tasks} tasks</span>
                        <span>{agent.avgTime} avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dsh-analytics-summary">
              <div className="dsh-summary-card">
                <div className="dsh-summary-icon">⚡</div>
                <div className="dsh-summary-content">
                  <div className="dsh-summary-label">Avg Efficiency</div>
                  <div className="dsh-summary-value">86.3%</div>
                </div>
              </div>
              <div className="dsh-summary-card">
                <div className="dsh-summary-icon">✅</div>
                <div className="dsh-summary-content">
                  <div className="dsh-summary-label">Success Rate</div>
                  <div className="dsh-summary-value">95.3%</div>
                </div>
              </div>
              <div className="dsh-summary-card">
                <div className="dsh-summary-icon">🎯</div>
                <div className="dsh-summary-content">
                  <div className="dsh-summary-label">Tasks Today</div>
                  <div className="dsh-summary-value">847</div>
                </div>
              </div>
              <div className="dsh-summary-card">
                <div className="dsh-summary-icon">⏱️</div>
                <div className="dsh-summary-content">
                  <div className="dsh-summary-label">Avg Response</div>
                  <div className="dsh-summary-value">2.4s</div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {selectedAgent && (
        <div className="dsh-modal-back" onClick={() => setSelectedAgent(null)}>
          <div className="dsh-modal" onClick={e => e.stopPropagation()}>
            <h3>{selectedAgent.name || 'Agent'}</h3>
            <div className="dsh-modal-rows">
              <div><b>{t.status}:</b> <StatusBadge status={selectedAgent.status} /></div>
              <div><b>{t.type}:</b> {selectedAgent.type || '—'}</div>
            </div>
            <button className="dsh-btn dsh-btn--primary" onClick={() => setSelectedAgent(null)}>{t.close}</button>
          </div>
        </div>
      )}

      {settingsAgent && (
        <div className="dsh-modal-back" onClick={() => setSettingsAgent(null)}>
          <div className="dsh-modal" onClick={e => e.stopPropagation()}>
            <div className="dsh-settings-modal">
              <h3>⚙ Configure: {settingsAgent.name}</h3>
              
              <div className="dsh-settings-section">
                <div className="dsh-settings-label">Operation Mode</div>
                <div className="dsh-settings-item">
                  <div className="dsh-settings-item-text">
                    <div className="dsh-settings-item-name">Auto Mode</div>
                    <div className="dsh-settings-item-desc">Enable automatic operations</div>
                  </div>
                  <label className="dsh-toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="dsh-toggle-slider" />
                  </label>
                </div>
                <div className="dsh-settings-item">
                  <div className="dsh-settings-item-text">
                    <div className="dsh-settings-item-name">Smart Alerts</div>
                    <div className="dsh-settings-item-desc">Receive notifications for actions</div>
                  </div>
                  <label className="dsh-toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="dsh-toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="dsh-settings-section">
                <div className="dsh-settings-label">Priority Level</div>
                <select className="dsh-settings-select">
                  <option>Low</option>
                  <option selected>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>

              <div className="dsh-settings-actions">
                <button className="dsh-btn dsh-btn--primary" onClick={handleSaveSettings}>
                  ✓ Save
                </button>
                <button className="dsh-btn dsh-btn--ghost" onClick={() => setSettingsAgent(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;