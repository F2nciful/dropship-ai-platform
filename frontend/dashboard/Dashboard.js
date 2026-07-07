import React, { useState } from 'react';
import './App.css';
import { FiGlobe, FiSettings, FiX, FiMoon, FiSun, FiChevronDown, FiChevronUp, FiLogOut } from 'react-icons/fi';

function Dashboard({ user, onLogout }) {
  const [language, setLanguage] = useState('en');
  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState(null);

  const translations = {
    en: {
      title: 'AI Agents Monitor',
      subtitle: 'Security Cameras View - 11 AI Agents',
      status: 'Active',
      goal: 'Goal',
      lastTask: 'Last Task',
      results: 'Results',
      settings: 'Appearance Settings',
      logout: 'Logout'
    },
    ar: {
      title: 'مراقبة وكلاء AI',
      subtitle: 'عرض كاميرات المراقبة - 11 وكيل AI',
      status: 'نشط',
      goal: 'الهدف',
      lastTask: 'آخر مهمة',
      results: 'النتائج',
      settings: 'إعدادات المظهر',
      logout: 'تسجيل الخروج'
    }
  };

  const t = translations[language];

  const agentsData = [
    { id: 1, name: "Product Research", role: "Product Research Specialist", goal: "Find trending products", lastTask: "Searching products", results: "5 new products found" },
    { id: 2, name: "Shopify Manager", role: "Shopify Store Manager", goal: "Manage Shopify store", lastTask: "Adding products", results: "3 products added" },
    { id: 3, name: "Marketing & Ads", role: "Marketing Specialist", goal: "Create campaigns", lastTask: "Creating campaigns", results: "2 campaigns created" },
    { id: 4, name: "Customer Service", role: "Customer Service Manager", goal: "Support customers", lastTask: "Answering queries", results: "14 issues resolved" },
    { id: 5, name: "Order Management", role: "Order Manager", goal: "Manage orders", lastTask: "Processing orders", results: "10 orders shipped" },
    { id: 6, name: "Competitor Analysis", role: "Competitor Analyst", goal: "Monitor competitors", lastTask: "Analyzing competitors", results: "15 changes found" },
    { id: 7, name: "Inventory Management", role: "Inventory Manager", goal: "Maintain inventory", lastTask: "Checking stock", results: "3 products to order" },
    { id: 8, name: "Platform Sync", role: "Sync Manager", goal: "Sync platforms", lastTask: "Syncing products", results: "100% synced" },
    { id: 9, name: "Analytics", role: "Analytics Specialist", goal: "Analyze data", lastTask: "Creating report", results: "ROI: 245%" },
    { id: 10, name: "Content Creator", role: "Content Creator", goal: "Create content", lastTask: "Writing descriptions", results: "Conversion: 3.5%" },
    { id: 11, name: "Supplier Manager", role: "Supplier Manager", goal: "Manage suppliers", lastTask: "Negotiating", results: "12% savings" },
  ];

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
  );
}

export default Dashboard;