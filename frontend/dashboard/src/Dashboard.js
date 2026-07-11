import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const API_URL = 'http://localhost:5000/api';
const RESEARCH_API_URL = 'http://127.0.0.1:8000/api';

const RESEARCH_PLATFORMS = [
  { id: 'aliexpress', label: 'AliExpress' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'ebay', label: 'eBay' },
];

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
    coordinating: 'Coordinating', tasksRunning: 'Tasks Running', uptime: 'Uptime',
    noAgentsTitle: 'No Agents Found', noAgentsSub: 'Looks like there are no agents running right now',
    noResultsTitle: 'No Results', noResultsSub: "We couldn't find any agents matching your search",
    noTasksTitle: 'No Tasks', noTasksSub: 'All clear! No tasks scheduled at the moment',
    noLogsTitle: 'No Activity', noLogsSub: 'Your activity log is empty',
    noDataTitle: 'No Data Available', noDataSub: 'Data is loading or unavailable',
    clearSearch: 'Clear Search',
    productsResearch: 'Products Research', researchPlaceholder: 'Search products...',
    searchBtn: 'Search', addToShop: 'Add to Shop', inStock: 'In Stock', outOfStock: 'Out of Stock',
    noProductsTitle: 'No Products Found', noProductsSub: "We couldn't find any products matching your search",
    searchPromptTitle: 'Search for Products',
    searchPromptSub: 'Search AliExpress, Amazon, and eBay to find products for your store',
    searchFailedTitle: 'Search Failed',
    searchFailedSub: 'Could not reach the product research service. Make sure the backend is running on port 8000.',
    retry: 'Retry', addProductTitle: 'Add to Shop', confirmAdd: 'Add to Database',
    productAdded: 'Product added to database', addFailed: 'Failed to add product',
    selectPlatform: 'Select at least one platform', noProductsFound: 'No products found',
    reachFailed: 'Could not reach product research service'
  }
};

const AGENT_ICONS = ['🔍', '📦', '💰', '📣', '🛒', '📊', '✉️', '🤖', '🎯', '⚙️', '🧠', '🚀'];

const normalizeList = (data, key) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  if (data && Array.isArray(data.data)) return data.data;
  return [];
};

const SkelLine = ({ w, h, radius }) => (
  <div className="dsh-skel-base dsh-skel-line" style={{ width: w, height: h, borderRadius: radius }} />
);

const SkelBlock = ({ w, h, radius, flex }) => (
  <div className="dsh-skel-base dsh-skel-block" style={{ width: w, height: h, borderRadius: radius, flex }} />
);

const SkeletonStat = () => (
  <div className="dsh-stat">
    <SkelBlock w={44} h={44} radius="50%" />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SkelLine w="55%" h={22} />
      <SkelLine w="80%" h={11} />
    </div>
  </div>
);

const SkeletonManagerHero = () => (
  <div className="dsh-manager-hero dsh-manager-hero--skeleton">
    <div className="dsh-manager-content">
      <div className="dsh-manager-header">
        <SkelBlock w={70} h={70} radius={14} />
        <div className="dsh-manager-info" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkelLine w={180} h={20} />
          <SkelLine w={120} h={12} />
        </div>
        <SkelLine w={70} h={24} radius={999} />
      </div>
      <div className="dsh-manager-stats">
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkelLine w="70%" h={10} />
            <SkelLine w="50%" h={22} />
          </div>
        ))}
      </div>
      <div className="dsh-manager-actions">
        {[0, 1, 2].map(i => <SkelBlock key={i} w={110} h={40} radius={10} />)}
      </div>
    </div>
  </div>
);

const SkeletonAgentCard = () => (
  <div className="dsh-agent">
    <div className="dsh-agent-top">
      <SkelBlock w={48} h={48} radius={12} />
      <SkelLine w={60} h={20} radius={999} />
    </div>
    <div style={{ marginBottom: 10 }}><SkelLine w="70%" h={16} /></div>
    <div style={{ marginBottom: 16 }}><SkelLine w="50%" h={12} /></div>
    <div style={{ display: 'flex', gap: 8 }}>
      <SkelBlock flex={1} h={32} radius={8} />
      <SkelBlock flex={1} h={32} radius={8} />
    </div>
  </div>
);

const SkeletonTaskRow = () => (
  <div className="dsh-row">
    <div className="dsh-row-main" style={{ gap: 8 }}>
      <SkelLine w="40%" h={14} />
      <SkelLine w="65%" h={11} />
    </div>
    <SkelLine w={70} h={22} radius={999} />
  </div>
);

const SkeletonChart = () => (
  <div className="dsh-analytics-card">
    <div style={{ marginBottom: 16 }}><SkelLine w="40%" h={16} /></div>
    <div style={{ height: 300, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 4px 4px' }}>
      {[45, 70, 55, 85, 60, 40, 75].map((h, i) => (
        <SkelBlock key={i} flex={1} h={`${h}%`} radius="6px 6px 0 0" />
      ))}
    </div>
  </div>
);

const SkeletonProductCard = () => (
  <div className="dsh-product-card">
    <SkelBlock w="100%" h={140} radius={12} />
    <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
      <SkelLine w={70} h={18} radius={999} />
      <SkelLine w={60} h={18} radius={999} />
    </div>
    <div style={{ marginBottom: 10 }}><SkelLine w="85%" h={16} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <SkelLine w={60} h={14} />
      <SkelLine w={50} h={14} />
    </div>
    <SkelBlock w="100%" h={36} radius={8} />
  </div>
);

const EmptyState = ({ icon, title, subtitle, action }) => (
  <div className="dsh-empty-state">
    <div className="dsh-empty-icon">{icon}</div>
    <h3 className="dsh-empty-title">{title}</h3>
    <p className="dsh-empty-subtitle">{subtitle}</p>
    {action && <div className="dsh-empty-action">{action}</div>}
  </div>
);

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

  const [researchQuery, setResearchQuery] = useState('');
  const [researchPlatforms, setResearchPlatforms] = useState({ aliexpress: true, amazon: true, ebay: true });
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSearched, setResearchSearched] = useState(false);
  const [researchResults, setResearchResults] = useState([]);
  const [researchError, setResearchError] = useState(null);
  const [selectedResearchProduct, setSelectedResearchProduct] = useState(null);
  const [addingProduct, setAddingProduct] = useState(false);

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
  const [visibleAgents, setVisibleAgents] = useState(() => {
  const saved = localStorage.getItem('visibleAgents');
  return saved ? JSON.parse(saved) : {};
});

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
    if (saved) {
      try {
        setVisibleAgents(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading visible agents:', e);
        localStorage.removeItem('visibleAgents');
      }
    }
  }, []);

  const agentStatus = (a) => (a.status || 'offline').toLowerCase();
  const activeCount = agents.filter(a => ['online', 'active', 'running', 'busy'].includes(agentStatus(a))).length;
  const managerAgent = agents.find(a => a.type === 'manager');
  const workerAgents = agents.filter(a => a.type !== 'manager');
  const doneTasks = tasks.filter(x => (x.status || '').toLowerCase() === 'completed').length;
  const runningTasks = tasks.filter(x => (x.status || '').toLowerCase() === 'running').length;
  const pendingTasks = tasks.filter(x => (x.status || '').toLowerCase() === 'pending').length;
  const taskDistribution = [
    { name: 'Completed', value: doneTasks, color: '#E8C766' },
    { name: 'Running', value: runningTasks, color: '#C68E17' },
    { name: 'Pending', value: pendingTasks, color: '#9CA3AF' },
  ];

  const agentStatusDistribution = [
    { name: 'Online', value: workerAgents.filter(a => agentStatus(a) === 'online').length, color: '#E8C766' },
    { name: 'Offline', value: workerAgents.filter(a => agentStatus(a) === 'offline').length, color: '#ef4444' },
    { name: 'Busy', value: workerAgents.filter(a => agentStatus(a) === 'busy').length, color: '#C68E17' },
  ];

  const AGENT_TYPE_COLORS = {
    research: '#D4AF37', pricing: '#E8C766', inventory: '#9CA3AF', marketing: '#f97316',
    social: '#ec4899', payment: '#eab308', supplier: '#14b8a6', analytics: '#6366f1',
    support: '#ef4444', email: '#06b6d4', shipping: '#a855f7',
  };
  const agentTypeDistribution = Object.keys(AGENT_TYPE_COLORS).map(type => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: workerAgents.filter(a => (a.type || '').toLowerCase() === type).length,
    color: AGENT_TYPE_COLORS[type],
  })).filter(entry => entry.value > 0);

  const hasPieData = (arr) => arr.some(d => d.value > 0);

  const filteredAgents = workerAgents.filter(a => {
    const name = (a.name || a.agent_name || '').toLowerCase();
    const isVisible = visibleAgents[a.id] === true;
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

  const searchResearchProducts = useCallback(async () => {
    if (!researchQuery.trim()) return;
    const platforms = RESEARCH_PLATFORMS.filter(p => researchPlatforms[p.id]).map(p => p.id);
    if (platforms.length === 0) {
      showToast(t.selectPlatform, 'warning');
      return;
    }

    setResearchLoading(true);
    setResearchError(null);
    setResearchSearched(true);

    try {
      const res = await fetch(`${RESEARCH_API_URL}/search-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: researchQuery.trim(), platforms, max_results: 12 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      setResearchResults(results);
      if (results.length === 0) showToast(t.noProductsFound, 'info');
    } catch {
      setResearchError(t.reachFailed);
      setResearchResults([]);
      showToast(t.reachFailed, 'error');
    } finally {
      setResearchLoading(false);
    }
  }, [researchQuery, researchPlatforms, showToast, t]);

  const confirmAddToShop = useCallback(async () => {
    if (!selectedResearchProduct) return;
    const p = selectedResearchProduct;
    setAddingProduct(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/add-to-database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          price: p.price,
          currency: p.currency || 'USD',
          image_url: p.image_url,
          url: p.url,
          description: p.description,
          rating: p.rating,
          reviews_count: p.reviews_count,
          orders_count: p.orders_count,
          shipping_price: p.shipping_price,
          seller_name: p.seller_name,
          in_stock: p.in_stock !== false,
          platform: p.platform,
          raw_data: p.raw_data || {},
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(t.productAdded, 'success');
      setResearchResults(prev => prev.map(item => (item === p ? { ...item, _added: true } : item)));
      setSelectedResearchProduct(null);
    } catch {
      showToast(t.addFailed, 'error');
    } finally {
      setAddingProduct(false);
    }
  }, [selectedResearchProduct, showToast, t]);

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

const toggleAgentVisibility = useCallback((agentId) => {
  setVisibleAgents(prev => {
    const updated = { ...prev };
    if (updated[agentId]) {
      delete updated[agentId];
    } else {
      updated[agentId] = true;
    }
    return updated;
  });
}, []);

 const selectAllAgents = useCallback(() => {
  if (agents.length === 0) {
    showToast('No agents available', 'warning');
    return;
  }
  const all = {};
  agents.forEach(a => {
    if (a.type !== 'manager') {
      all[a.id] = true;
    }
  });
  setVisibleAgents(all);
  showToast('All agents selected', 'success');
}, [agents, showToast]);

const deselectAllAgents = useCallback(() => {
  setVisibleAgents({});
  showToast('All agents deselected', 'info');
}, [showToast]);
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
    { id: 'research', icon: '📦', label: t.productsResearch },
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
          <span className="dsh-logo-text">Nexus</span>
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
  checked={visibleAgents[agent.id] === true}
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
          {loading ? (
            [0, 1, 2, 3].map(i => <SkeletonStat key={i} />)
          ) : (
            <>
              <div className="dsh-stat dsh-stat--purple">
                <span className="dsh-stat-icon">🤖</span>
                <div>
                  <div className="dsh-stat-num">{agents.length}</div>
                  <div className="dsh-stat-label">{t.totalAgents}</div>
                </div>
              </div>
              <div className="dsh-stat dsh-stat--green">
                <span className="dsh-stat-icon">⚡</span>
                <div>
                  <div className="dsh-stat-num">{activeCount}</div>
                  <div className="dsh-stat-label">{t.activeAgents}</div>
                </div>
              </div>
              <div className="dsh-stat dsh-stat--blue">
                <span className="dsh-stat-icon">📋</span>
                <div>
                  <div className="dsh-stat-num">{tasks.length}</div>
                  <div className="dsh-stat-label">{t.totalTasks}</div>
                </div>
              </div>
              <div className="dsh-stat dsh-stat--gold">
                <span className="dsh-stat-icon">✅</span>
                <div>
                  <div className="dsh-stat-num">{doneTasks}</div>
                  <div className="dsh-stat-label">{t.completedTasks}</div>
                </div>
              </div>
            </>
          )}
        </section>

        {(page === 'dashboard') && (
          <section className="dsh-section">
            {loading ? <SkeletonManagerHero /> : managerAgent && (
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
          </section>
        )}

        {(page === 'agents') && (
          <section className="dsh-section">
            {loading ? <SkeletonManagerHero /> : managerAgent && (
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

            {loading ? <div className="dsh-grid">{[...Array(6)].map((_, i) => <SkeletonAgentCard key={i} />)}</div> : filteredAgents.length === 0 ? (
              agentSearch.trim() ? (
                <EmptyState
                  icon="🔍"
                  title={t.noResultsTitle}
                  subtitle={t.noResultsSub}
                  action={<button className="dsh-btn dsh-btn--ghost" onClick={() => setAgentSearch('')}>{t.clearSearch}</button>}
                />
              ) : (
                <EmptyState
                  icon="🤖"
                  title={t.noAgentsTitle}
                  subtitle={t.noAgentsSub}
                  action={<button className="dsh-btn dsh-btn--primary" onClick={() => fetchAll(false)}>⟳ {t.refresh}</button>}
                />
              )
            ) : (
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

        {page === 'research' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>📦 {t.productsResearch}</h2>
            </div>

            <div className="dsh-research-controls">
              <input
                className="dsh-input dsh-research-input"
                placeholder={t.researchPlaceholder}
                value={researchQuery}
                onChange={e => setResearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchResearchProducts(); }}
              />
              <div className="dsh-platform-checks">
                {RESEARCH_PLATFORMS.map(p => (
                  <label key={p.id} className="dsh-platform-check">
                    <input
                      type="checkbox"
                      checked={!!researchPlatforms[p.id]}
                      onChange={() => setResearchPlatforms(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              <button
                className="dsh-btn dsh-btn--primary"
                onClick={searchResearchProducts}
                disabled={researchLoading || !researchQuery.trim()}
              >
                {researchLoading ? (<><span className="dsh-spinner" /> Searching...</>) : `🔍 ${t.searchBtn}`}
              </button>
            </div>

            {researchLoading ? (
              <div className="dsh-grid">{[0, 1, 2, 3, 4, 5].map(i => <SkeletonProductCard key={i} />)}</div>
            ) : researchError ? (
              <EmptyState
                icon="⚠️"
                title={t.searchFailedTitle}
                subtitle={t.searchFailedSub}
                action={<button className="dsh-btn dsh-btn--primary" onClick={searchResearchProducts}>⟳ {t.retry}</button>}
              />
            ) : !researchSearched ? (
              <EmptyState icon="📦" title={t.searchPromptTitle} subtitle={t.searchPromptSub} />
            ) : researchResults.length === 0 ? (
              <EmptyState icon="🔍" title={t.noProductsTitle} subtitle={t.noProductsSub} />
            ) : (
              <div className="dsh-grid">
                {researchResults.map((p, i) => (
                  <div key={p.url || `${p.platform}-${i}`} className="dsh-product-card">
                    <div className="dsh-product-image">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <span>📦</span>
                      )}
                    </div>
                    <div className="dsh-product-badges">
                      <span className="dsh-badge dsh-badge--off">{p.platform}</span>
                      <span className={`dsh-badge ${p.in_stock === false ? 'dsh-badge--err' : 'dsh-badge--on'}`}>
                        <span className="dsh-dot" />{p.in_stock === false ? t.outOfStock : t.inStock}
                      </span>
                    </div>
                    <h3 className="dsh-product-name" title={p.name}>{p.name}</h3>
                    <div className="dsh-product-meta">
                      <span className="dsh-product-price">
                        {p.price != null ? `${p.currency || 'USD'} ${Number(p.price).toFixed(2)}` : '—'}
                      </span>
                      {p.rating != null && (
                        <span className="dsh-product-rating">
                          ⭐ {Number(p.rating).toFixed(1)}{p.reviews_count ? ` (${p.reviews_count})` : ''}
                        </span>
                      )}
                    </div>
                    <button
                      className="dsh-btn dsh-btn--primary dsh-product-add-btn"
                      onClick={() => setSelectedResearchProduct(p)}
                      disabled={p._added}
                    >
                      {p._added ? '✓ Added' : `+ ${t.addToShop}`}
                    </button>
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
            {loading ? (
              <div className="dsh-list">{[0, 1, 2, 3, 4].map(i => <SkeletonTaskRow key={i} />)}</div>
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                icon="✅"
                title={t.noTasksTitle}
                subtitle={t.noTasksSub}
                action={<button className="dsh-btn dsh-btn--ghost" onClick={() => fetchAll(false)}>⟳ {t.refresh}</button>}
              />
            ) : (
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
            {logs.length === 0 ? (
              <EmptyState icon="📭" title={t.noLogsTitle} subtitle={t.noLogsSub} />
            ) : (
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
              {loading ? [0, 1, 2, 3, 4].map(i => <SkeletonChart key={i} />) : (
              <>
              <div className="dsh-analytics-card">
                <h3>Weekly Performance</h3>
                {analyticsData.weeklyPerformance.length === 0 ? (
                  <EmptyState icon="📊" title={t.noDataTitle} subtitle={t.noDataSub} />
                ) : (
                <ResponsiveContainer width="100%" height={300}>
  <BarChart data={analyticsData.weeklyPerformance}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="day" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Bar dataKey="efficiency" fill="#D4AF37" name="Efficiency (%)" />
    <Bar dataKey="success" fill="#E8C766" name="Success Rate (%)" />
  </BarChart>
</ResponsiveContainer>
                )}
              </div>

              <div className="dsh-analytics-card">
                <h3>Agent Performance</h3>
                {analyticsData.agentStats.length === 0 ? (
                  <EmptyState icon="📊" title={t.noDataTitle} subtitle={t.noDataSub} />
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData.agentStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="success" stroke="#E8C766" name="Success Rate (%)" />
                    <Line type="monotone" dataKey="tasks" stroke="#D4AF37" name="Tasks" />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>

              <div className="dsh-analytics-card">
                <h3>Tasks Distribution</h3>
                {!hasPieData(taskDistribution) ? (
                  <EmptyState icon="📊" title={t.noDataTitle} subtitle={t.noDataSub} />
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={taskDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {taskDistribution.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>

              <div className="dsh-analytics-card">
                <h3>Agents Status Distribution</h3>
                {!hasPieData(agentStatusDistribution) ? (
                  <EmptyState icon="📊" title={t.noDataTitle} subtitle={t.noDataSub} />
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={agentStatusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {agentStatusDistribution.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>

              <div className="dsh-analytics-card">
                <h3>Agents by Type</h3>
                {agentTypeDistribution.length === 0 ? (
                  <EmptyState icon="📊" title={t.noDataTitle} subtitle={t.noDataSub} />
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={agentTypeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {agentTypeDistribution.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
              </>
              )}
            </div>

            <div className="dsh-analytics-summary">
              <div className="dsh-summary-card dsh-summary-card--purple">
                <div className="dsh-summary-ring" style={{ '--pct': 86 }}>
                  <span className="dsh-summary-ring-icon">⚡</span>
                </div>
                <div className="dsh-summary-label">Avg Efficiency</div>
                <div className="dsh-summary-value">86.3%</div>
                <div className="dsh-summary-desc">Overall agent efficiency this week</div>
              </div>

              <div className="dsh-summary-card dsh-summary-card--green">
                <div className="dsh-summary-ring" style={{ '--pct': 95 }}>
                  <span className="dsh-summary-ring-icon">✅</span>
                </div>
                <div className="dsh-summary-label">Success Rate</div>
                <div className="dsh-summary-value">95.3%</div>
                <div className="dsh-summary-desc">Tasks completed without errors</div>
              </div>

              <div className="dsh-summary-card dsh-summary-card--blue">
                <div className="dsh-summary-trend dsh-summary-trend--up">▲ 8.2%</div>
                <div className="dsh-summary-icon-badge">🎯</div>
                <div className="dsh-summary-label">Tasks Today</div>
                <div className="dsh-summary-value">847</div>
                <div className="dsh-summary-desc">vs. yesterday</div>
              </div>

              <div className="dsh-summary-card dsh-summary-card--orange">
                <div className="dsh-summary-icon-badge">⏱️</div>
                <div className="dsh-summary-label">Avg Response</div>
                <div className="dsh-summary-value">2.4s</div>
                <div className="dsh-summary-desc">2,400ms average latency</div>
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

      {selectedResearchProduct && (
        <div className="dsh-modal-back" onClick={() => !addingProduct && setSelectedResearchProduct(null)}>
          <div className="dsh-modal dsh-product-modal" onClick={e => e.stopPropagation()}>
            <h3>{t.addProductTitle}</h3>
            <div className="dsh-product-modal-body">
              <div className="dsh-product-modal-image">
                {selectedResearchProduct.image_url ? (
                  <img src={selectedResearchProduct.image_url} alt={selectedResearchProduct.name} onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <span>📦</span>
                )}
              </div>
              <div className="dsh-product-modal-info">
                <h4>{selectedResearchProduct.name}</h4>
                <div className="dsh-modal-rows">
                  <div><b>Price:</b> {selectedResearchProduct.price != null ? `${selectedResearchProduct.currency || 'USD'} ${Number(selectedResearchProduct.price).toFixed(2)}` : '—'}</div>
                  <div><b>Rating:</b> {selectedResearchProduct.rating != null ? `⭐ ${Number(selectedResearchProduct.rating).toFixed(1)}` : '—'}</div>
                  <div><b>Reviews:</b> {selectedResearchProduct.reviews_count ?? '—'}</div>
                  <div><b>{t.status}:</b> <span className="dsh-badge dsh-badge--off">{selectedResearchProduct.platform}</span></div>
                  <div><b>Stock:</b> <StatusBadge status={selectedResearchProduct.in_stock === false ? 'offline' : 'online'} /></div>
                  {selectedResearchProduct.seller_name && <div><b>Seller:</b> {selectedResearchProduct.seller_name}</div>}
                  {selectedResearchProduct.shipping_price != null && (
                    <div><b>Shipping:</b> {selectedResearchProduct.currency || 'USD'} {Number(selectedResearchProduct.shipping_price).toFixed(2)}</div>
                  )}
                  {selectedResearchProduct.url && (
                    <div><b>Link:</b> <a href={selectedResearchProduct.url} target="_blank" rel="noreferrer">View on {selectedResearchProduct.platform}</a></div>
                  )}
                </div>
              </div>
            </div>
            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={confirmAddToShop} disabled={addingProduct}>
                {addingProduct ? (<><span className="dsh-spinner" /> Adding...</>) : `✓ ${t.confirmAdd}`}
              </button>
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setSelectedResearchProduct(null)} disabled={addingProduct}>
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;