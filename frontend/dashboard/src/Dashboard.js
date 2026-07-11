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

const PREDEFINED_PLATFORMS = [
  { name: 'shopify', url: 'https://your-store.myshopify.com', label: 'Shopify' },
  { name: 'woocommerce', url: 'https://your-store.example.com', label: 'WooCommerce' },
  { name: 'etsy', url: 'https://www.etsy.com', label: 'Etsy' },
  { name: 'walmart', url: 'https://www.walmart.com', label: 'Walmart' },
];

const EMPTY_PLATFORM_FORM = { name: '', url: '', is_active: true, configText: '{}' };

const DEFAULT_SETTINGS = {
  displayName: '',
  email: '',
  theme: 'dark',
  accentColor: '#D4AF37',
  defaultPage: 'dashboard',
  autoRefreshInterval: 15,
  defaultPlatforms: ['aliexpress', 'amazon', 'ebay'],
  defaultMaxResults: 10,
};

const ACCENT_PRESETS = [
  { name: 'Gold', color: '#D4AF37' },
  { name: 'Rose', color: '#C97064' },
  { name: 'Emerald', color: '#2FA97C' },
  { name: 'Sapphire', color: '#4A7FD6' },
  { name: 'Violet', color: '#9B6BD6' },
  { name: 'Copper', color: '#B87333' },
];

const DEFAULT_PAGE_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'agents', label: 'Agents' },
  { value: 'research', label: 'Products Research' },
  { value: 'myproducts', label: 'My Products' },
  { value: 'analytics', label: 'Analytics' },
];

const AUTO_REFRESH_OPTIONS = [
  { value: 5, label: '5 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 0, label: 'Off' },
];

const NOTIF_ICONS = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'currency', label: 'Currency' },
  { key: 'platform', label: 'Platform' },
  { key: 'rating', label: 'Rating' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'seller_name', label: 'Seller' },
  { key: 'description', label: 'Description' },
  { key: 'created_at', label: 'Date Added' },
];

const KEYBOARD_SHORTCUTS = [
  { keys: 'Ctrl + K', description: 'Focus product search' },
  { keys: 'Ctrl + D', description: 'Go to Dashboard' },
  { keys: 'Ctrl + P', description: 'Go to My Products' },
  { keys: 'Esc', description: 'Close any open modal' },
  { keys: '?', description: 'Show this shortcuts panel' },
];

const MARGIN_OPTIONS = [
  { value: 50, strategy: 'budget', label: '50%' },
  { value: 100, strategy: 'mid', label: '100%' },
  { value: 150, strategy: 'premium', label: '150%' },
  { value: 200, strategy: 'aggressive', label: '200%' },
];

const STRATEGY_LABELS = { budget: 'Budget', mid: 'Mid-Range', premium: 'Premium', aggressive: 'Aggressive', custom: 'Custom' };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('dsh-settings') || 'null');
    return saved ? { ...DEFAULT_SETTINGS, ...saved } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function loadNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem('dsh-notifications') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// --- Accent color derivation: turns one hex into the small set of shades the
// design system needs (glow, on-accent text, contrast-safe text), so the
// color picker actually re-themes the app instead of just tinting one thing.
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function shadeColor(hex, percent) {
  const [r, g, b] = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  return rgbToHex([(t - r) * p + r, (t - g) * p + g, (t - b) * p + b]);
}

function deriveAccentVars(hex) {
  const rgb = hexToRgb(hex);
  const luminance = relativeLuminance(rgb);
  const onAccent = luminance > 0.45 ? '#141414' : '#FFFFFF';
  const textShade = luminance > 0.45 ? shadeColor(hex, -0.35) : hex;
  return {
    '--purple': hex,
    '--purple-glow': `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.35)`,
    '--purple-text': textShade,
    '--on-gold': onAccent,
  };
}

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
    retry: 'Retry',
    productAdded: 'Product added to database', addFailed: 'Failed to add product',
    selectPlatform: 'Select at least one platform', noProductsFound: 'No products found',
    reachFailed: 'Could not reach product research service',
    platformSettings: 'Platform Settings', addPlatform: 'Add Platform', importPredefined: 'Import Predefined',
    testConnection: 'Test', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel',
    platformName: 'Platform Name', platformUrl: 'Base URL', active: 'Active', builtIn: 'Built-in',
    custom: 'Custom', advancedConfig: 'Advanced Config (JSON)',
    platformAdded: 'Platform added', platformUpdated: 'Platform updated', platformDeleted: 'Platform deleted',
    platformSaveFailed: 'Failed to save platform', platformDeleteFailed: 'Failed to delete platform',
    platformActionFailed: 'Action failed — please try again',
    invalidConfigJson: 'Advanced config must be valid JSON',
    confirmDeletePlatform: 'Delete this platform? This cannot be undone.',
    noPlatformsTitle: 'No Platforms Yet', noPlatformsSub: 'Add a platform to start searching it',
    testing: 'Testing...',
    pause: 'Pause', resume: 'Resume', settings: 'Settings',
    selectAgentTitle: 'Select an Agent', selectAgentSub: 'Select an agent to view details'
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

const SkeletonAgentListItem = () => (
  <div className="dsh-agent-list-item">
    <SkelBlock w={40} h={40} radius={10} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SkelLine w="60%" h={14} />
      <SkelLine w={60} h={16} radius={999} />
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      <SkelBlock w={30} h={30} radius={8} />
      <SkelBlock w={30} h={30} radius={8} />
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

const StarRating = ({ rating, size }) => {
  const rounded = Math.round(rating || 0);
  return (
    <span className="dsh-star-rating" style={size ? { fontSize: size } : undefined}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`dsh-star ${i <= rounded ? 'dsh-star--filled' : ''}`}>★</span>
      ))}
      {rating != null && <span className="dsh-star-rating-value">{Number(rating).toFixed(1)}</span>}
    </span>
  );
};

const ProductDetailModal = ({
  product, onClose, onAddToShop, adding, closing,
  onAnalyze, analyzing, analysis, analysisError, onApplyDescription, onPriceThis,
}) => {
  if (!product) return null;
  const currency = product.currency || 'USD';

  return (
    <div className={`dsh-modal-back ${closing ? 'dsh-modal-back--closing' : ''}`} onClick={onClose}>
      <div className={`dsh-modal dsh-product-detail-modal ${closing ? 'dsh-modal--closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="dsh-product-detail-image">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <span>📦</span>
          )}
        </div>

        <div className="dsh-product-detail-badges">
          <span className="dsh-badge dsh-badge--off">{product.platform}</span>
          <span className={`dsh-badge ${product.in_stock === false ? 'dsh-badge--err' : 'dsh-badge--on'}`}>
            <span className="dsh-dot" />{product.in_stock === false ? 'Out of Stock' : 'In Stock'}
          </span>
        </div>

        <h3 className="dsh-product-detail-name">{product.name}</h3>
        {product.description && <p className="dsh-product-detail-desc">{product.description}</p>}
        {product.rating != null && <StarRating rating={product.rating} />}

        <div className="dsh-product-detail-grid">
          <div className="dsh-product-detail-stat">
            <span className="dsh-product-detail-stat-label">Price</span>
            <span className="dsh-product-detail-stat-value">
              {product.price != null ? `${currency} ${Number(product.price).toFixed(2)}` : '—'}
            </span>
          </div>
          <div className="dsh-product-detail-stat">
            <span className="dsh-product-detail-stat-label">Reviews</span>
            <span className="dsh-product-detail-stat-value">{product.reviews_count ?? '—'}</span>
          </div>
          <div className="dsh-product-detail-stat">
            <span className="dsh-product-detail-stat-label">Orders</span>
            <span className="dsh-product-detail-stat-value">{product.orders_count ?? '—'}</span>
          </div>
          <div className="dsh-product-detail-stat">
            <span className="dsh-product-detail-stat-label">Shipping</span>
            <span className="dsh-product-detail-stat-value">
              {product.shipping_price != null ? `${currency} ${Number(product.shipping_price).toFixed(2)}` : '—'}
            </span>
          </div>
          <div className="dsh-product-detail-stat">
            <span className="dsh-product-detail-stat-label">Seller</span>
            <span className="dsh-product-detail-stat-value">{product.seller_name || '—'}</span>
          </div>
          {product.url && (
            <div className="dsh-product-detail-stat">
              <span className="dsh-product-detail-stat-label">Source</span>
              <a className="dsh-product-detail-link" href={product.url} target="_blank" rel="noreferrer">View original ↗</a>
            </div>
          )}
        </div>

        {onAnalyze && (
          <div className="dsh-ai-section">
            {!analysis && !analyzing && (
              <button className="dsh-btn dsh-btn--ghost dsh-ai-btn" onClick={onAnalyze}>✨ AI Analysis</button>
            )}

            {analyzing && (
              <div className="dsh-ai-loading"><span className="dsh-spinner" /> Analyzing with AI...</div>
            )}

            {analysisError && !analyzing && !analysis && (
              <div className="dsh-ai-error">⚠️ {analysisError}</div>
            )}

            {analysis && !analyzing && (
              <div className="dsh-ai-result">
                <div className="dsh-ai-result-header">✨ AI Analysis</div>

                {analysis.description && (
                  <div className="dsh-ai-block">
                    <span className="dsh-ai-label">Suggested Description</span>
                    <p className="dsh-ai-desc">{analysis.description}</p>
                    {onApplyDescription && (
                      <button className="dsh-btn dsh-btn--ghost dsh-ai-apply-btn" onClick={onApplyDescription}>
                        ✓ Apply Description
                      </button>
                    )}
                  </div>
                )}

                <div className="dsh-ai-grid">
                  {analysis.suggested_price != null && (
                    <div className="dsh-ai-stat">
                      <span className="dsh-ai-label">Suggested Price</span>
                      <span className="dsh-ai-value">{currency} {Number(analysis.suggested_price).toFixed(2)}</span>
                    </div>
                  )}
                  {analysis.profit_margin_percent != null && (
                    <div className="dsh-ai-stat">
                      <span className="dsh-ai-label">Profit Margin</span>
                      <span className="dsh-ai-value">{Number(analysis.profit_margin_percent).toFixed(1)}%</span>
                    </div>
                  )}
                  {analysis.target_audience && (
                    <div className="dsh-ai-stat">
                      <span className="dsh-ai-label">Target Audience</span>
                      <span className="dsh-ai-value">{analysis.target_audience}</span>
                    </div>
                  )}
                </div>

                {analysis.keywords?.length > 0 && (
                  <div className="dsh-ai-keywords">
                    {analysis.keywords.map(k => <span key={k} className="dsh-badge dsh-badge--off">{k}</span>)}
                  </div>
                )}

                <button className="dsh-btn dsh-btn--ghost dsh-ai-btn" onClick={onAnalyze}>🔄 Re-analyze</button>
              </div>
            )}
          </div>
        )}

        <div className="dsh-settings-actions">
          {onAddToShop && (
            <button className="dsh-btn dsh-btn--primary" onClick={onAddToShop} disabled={adding || product._added}>
              {adding ? (<><span className="dsh-spinner" /> Adding...</>) : product._added ? '✓ Added' : '✓ Add to Shop'}
            </button>
          )}
          {onPriceThis && (
            <button className="dsh-btn dsh-btn--ghost" onClick={onPriceThis}>💰 Price This</button>
          )}
          <button className="dsh-btn dsh-btn--ghost" onClick={onClose} disabled={adding}>Close</button>
        </div>
      </div>
    </div>
  );
};

const PriceHistoryModal = ({ modal, loading, onClose }) => {
  if (!modal) return null;
  const { product, data, error } = modal;
  const entries = data?.entries || [];
  const currency = entries[0]?.currency || 'USD';
  const chartData = entries.map(e => ({
    date: new Date(e.recorded_at).toLocaleDateString(),
    price: e.price,
  }));
  const changePercent = data?.change_percent;
  const priceDropped = changePercent != null && changePercent < 0;
  const priceIncreased = changePercent != null && changePercent > 0;

  return (
    <div className="dsh-modal-back" onClick={onClose}>
      <div className="dsh-modal dsh-price-history-modal" onClick={e => e.stopPropagation()}>
        <h3>📈 Price History</h3>
        <p className="dsh-price-history-product" title={product.name}>{product.name}</p>

        {loading ? (
          <div className="dsh-ai-loading"><span className="dsh-spinner" /> Loading price history...</div>
        ) : error ? (
          <div className="dsh-ai-error">⚠️ {error}</div>
        ) : entries.length === 0 ? (
          <div className="dsh-empty-state" style={{ border: 'none', background: 'transparent', padding: '20px 0' }}>
            <div className="dsh-empty-icon">📈</div>
            <h3 className="dsh-empty-title">No Price Data</h3>
            <p className="dsh-empty-subtitle">No price history recorded for this product yet</p>
          </div>
        ) : (
          <>
            {changePercent != null && (
              <div className={`dsh-price-change ${priceDropped ? 'dsh-price-change--down' : priceIncreased ? 'dsh-price-change--up' : ''}`}>
                <span className="dsh-price-change-arrow">{priceDropped ? '↓' : priceIncreased ? '↑' : '→'}</span>
                <span>
                  {Math.abs(changePercent).toFixed(1)}% {priceDropped ? 'decrease' : priceIncreased ? 'increase' : 'change'} since first recorded
                </span>
              </div>
            )}

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="price" stroke="#D4AF37" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>

            <div className="dsh-price-history-summary">
              <div className="dsh-ai-stat">
                <span className="dsh-ai-label">First Price</span>
                <span className="dsh-ai-value">{currency} {Number(data.first_price).toFixed(2)}</span>
              </div>
              <div className="dsh-ai-stat">
                <span className="dsh-ai-label">Latest Price</span>
                <span className="dsh-ai-value">{currency} {Number(data.latest_price).toFixed(2)}</span>
              </div>
            </div>
          </>
        )}

        <div className="dsh-settings-actions">
          <button className="dsh-btn dsh-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const PricingHistoryModal = ({ modal, loading, onClose, onExport }) => {
  if (!modal) return null;
  const { product, data, error } = modal;
  const entries = data?.entries || [];
  const currency = product.currency || 'USD';
  const chartData = entries.map(e => ({
    date: new Date(e.created_at).toLocaleDateString(),
    cost: e.cost_price,
    suggested: e.suggested_price,
    applied: e.applied_price,
  }));

  return (
    <div className="dsh-modal-back" onClick={onClose}>
      <div className="dsh-modal dsh-pricing-history-modal" onClick={e => e.stopPropagation()}>
        <h3>💰 Pricing History</h3>
        <p className="dsh-price-history-product" title={product.name}>{product.name}</p>

        {loading ? (
          <div className="dsh-ai-loading"><span className="dsh-spinner" /> Loading pricing history...</div>
        ) : error ? (
          <div className="dsh-ai-error">⚠️ {error}</div>
        ) : entries.length === 0 ? (
          <div className="dsh-empty-state" style={{ border: 'none', background: 'transparent', padding: '20px 0' }}>
            <div className="dsh-empty-icon">💰</div>
            <h3 className="dsh-empty-title">No Pricing History</h3>
            <p className="dsh-empty-subtitle">Run a pricing analysis for this product to start building history</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cost" name="Cost" stroke="#9CA3AF" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="suggested" name="Suggested" stroke="#4A7FD6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="applied" name="Applied" stroke="#D4AF37" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>

            <div className="dsh-pricing-history-table-wrap">
              <table className="dsh-pricing-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Cost</th>
                    <th>Suggested</th>
                    <th>Applied</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map(e => (
                    <tr key={e.id}>
                      <td>{new Date(e.created_at).toLocaleDateString()}</td>
                      <td>{currency} {Number(e.cost_price).toFixed(2)}</td>
                      <td>{e.suggested_price != null ? `${currency} ${Number(e.suggested_price).toFixed(2)}` : '—'}</td>
                      <td>{e.applied_price != null ? `${currency} ${Number(e.applied_price).toFixed(2)}` : '—'}</td>
                      <td>{e.profit_margin != null ? `${Number(e.profit_margin).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="dsh-settings-actions">
          {entries.length > 0 && (
            <button className="dsh-btn dsh-btn--ghost" onClick={onExport}>⬇ Export</button>
          )}
          <button className="dsh-btn dsh-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

function Dashboard({ user, onLogout }) {
  const [appSettings, setAppSettings] = useState(loadSettings);
  const [settingsDraft, setSettingsDraft] = useState(appSettings);
  const [dark, setDark] = useState(() => localStorage.getItem('dsh-theme') !== 'light');
  const [lang, setLang] = useState('en');
  const [page, setPage] = useState(() => loadSettings().defaultPage || 'dashboard');
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [backendUp, setBackendUp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toastId = useRef(0);
  const researchInputRef = useRef(null);

  const [notifications, setNotifications] = useState(loadNotifications);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportForm, setExportForm] = useState({
    format: 'csv',
    columns: EXPORT_COLUMNS.map(c => c.key),
    dateFrom: '',
    dateTo: '',
  });
  const [reportModal, setReportModal] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [researchQuery, setResearchQuery] = useState('');
  const [researchPlatforms, setResearchPlatforms] = useState(() => {
    const defaults = loadSettings().defaultPlatforms || ['aliexpress', 'amazon', 'ebay'];
    return RESEARCH_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.id]: defaults.includes(p.id) }), {});
  });
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSearched, setResearchSearched] = useState(false);
  const [researchResults, setResearchResults] = useState([]);
  const [researchError, setResearchError] = useState(null);
  const [productModal, setProductModal] = useState(null);
  const [productModalClosing, setProductModalClosing] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiAnalysisError, setAiAnalysisError] = useState(null);

  const [priceHistoryModal, setPriceHistoryModal] = useState(null);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [myProducts, setMyProducts] = useState([]);
  const [myProductsTotal, setMyProductsTotal] = useState(0);
  const [myProductsLoading, setMyProductsLoading] = useState(true);
  const [myProductsSearch, setMyProductsSearch] = useState('');
  const [myProductsPageNum, setMyProductsPageNum] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);

  const [pricingSearch, setPricingSearch] = useState('');
  const [pricingSelectedProduct, setPricingSelectedProduct] = useState(null);
  const [pricingCostPrice, setPricingCostPrice] = useState('');
  const [pricingPlatform, setPricingPlatform] = useState('aliexpress');
  const [pricingMargin, setPricingMargin] = useState(100);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingResult, setPricingResult] = useState(null);
  const [pricingError, setPricingError] = useState(null);
  const [pricingApplying, setPricingApplying] = useState(false);
  const [pricingHistoryModal, setPricingHistoryModal] = useState(null);
  const [pricingHistoryLoading, setPricingHistoryLoading] = useState(false);

  const [platforms, setPlatforms] = useState([]);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [platformForm, setPlatformForm] = useState(EMPTY_PLATFORM_FORM);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [testingPlatformId, setTestingPlatformId] = useState(null);

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

  const addNotification = useCallback((type, message) => {
    setNotifications(prev => {
      const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, message, time: new Date().toISOString(), read: false }, ...prev].slice(0, 50);
      localStorage.setItem('dsh-notifications', JSON.stringify(next));
      return next;
    });
  }, []);

  const markNotificationRead = (id) => {
    setNotifications(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, read: true } : n));
      localStorage.setItem('dsh-notifications', JSON.stringify(next));
      return next;
    });
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      localStorage.setItem('dsh-notifications', JSON.stringify(next));
      return next;
    });
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    localStorage.setItem('dsh-notifications', JSON.stringify([]));
  };

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  useEffect(() => { if (page === 'usersettings') setSettingsDraft(appSettings); }, [page, appSettings]);

  const saveSettings = () => {
    setAppSettings(settingsDraft);
    localStorage.setItem('dsh-settings', JSON.stringify(settingsDraft));
    if (settingsDraft.theme !== (dark ? 'dark' : 'light')) {
      setDark(settingsDraft.theme === 'dark');
    }
    if (settingsDraft.autoRefreshInterval === 0) {
      setAutoRefresh(false);
    }
    showToast('Settings saved', 'success');
  };

  const resetSettingsDraft = () => {
    setSettingsDraft({ ...DEFAULT_SETTINGS });
    showToast('Defaults loaded — click Save to apply', 'info');
  };

  const fetchAll = useCallback(async (silent = true) => {
    if (!silent) setRefreshingAll(true);
    try {
      const [aRes, tRes, lRes, pRes] = await Promise.allSettled([
        fetch(`${API_URL}/agents`).then(r => r.json()),
        fetch(`${API_URL}/tasks`).then(r => r.json()),
        fetch(`${API_URL}/logs`).then(r => r.json()),
        fetch(`${RESEARCH_API_URL}/products?limit=200`).then(r => r.json()),
      ]);

      if (aRes.status === 'fulfilled') setAgents(normalizeList(aRes.value, 'agents'));
      if (tRes.status === 'fulfilled') setTasks(normalizeList(tRes.value, 'tasks'));
      if (lRes.status === 'fulfilled') setLogs(normalizeList(lRes.value, 'logs'));
      if (pRes.status === 'fulfilled') {
        setMyProducts(pRes.value.products || []);
        setMyProductsTotal(pRes.value.total || 0);
      }

      const anyOk = [aRes, tRes, lRes].some(r => r.status === 'fulfilled');
      setBackendUp(anyOk);
      if (!silent && anyOk) showToast(t.dataRefreshed, 'success');
    } catch {
      setBackendUp(false);
    } finally {
      setLoading(false);
      if (!silent) setRefreshingAll(false);
    }
  }, [showToast, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!autoRefresh || !appSettings.autoRefreshInterval) return;
    const iv = setInterval(() => fetchAll(true), appSettings.autoRefreshInterval * 1000);
    return () => clearInterval(iv);
  }, [autoRefresh, appSettings.autoRefreshInterval, fetchAll]);

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

  const activeResearchFilterCount = [
    priceMin !== '' || priceMax !== '',
    minRating > 0,
    inStockOnly,
    sortBy !== '',
  ].filter(Boolean).length;
  const hasActiveResearchFilters = activeResearchFilterCount > 0;

  const clearResearchFilters = () => {
    setPriceMin(''); setPriceMax(''); setMinRating(0); setSortBy(''); setInStockOnly(false);
  };

  const filteredResearchResults = researchResults.filter(p => {
    if (priceMin !== '' && (p.price == null || p.price < Number(priceMin))) return false;
    if (priceMax !== '' && (p.price == null || p.price > Number(priceMax))) return false;
    if (minRating > 0 && (p.rating == null || p.rating < minRating)) return false;
    if (inStockOnly && p.in_stock === false) return false;
    return true;
  });

  const sortedResearchResults = [...filteredResearchResults].sort((a, b) => {
    switch (sortBy) {
      case 'price_asc': return (a.price ?? Infinity) - (b.price ?? Infinity);
      case 'price_desc': return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      case 'rating_desc': return (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
      case 'orders_desc': return (b.orders_count ?? -Infinity) - (a.orders_count ?? -Infinity);
      case 'newest': default: return 0;
    }
  });

  const pricingSearchResults = pricingSearch.trim()
    ? myProducts.filter(p => {
        const q = pricingSearch.trim().toLowerCase();
        return (p.name || '').toLowerCase().includes(q) || (p.url || '').toLowerCase().includes(q);
      })
    : myProducts;

  const MY_PRODUCTS_PAGE_SIZE = 20;
  const filteredMyProducts = myProducts.filter(p => {
    if (!myProductsSearch.trim()) return true;
    const q = myProductsSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.platform || '').toLowerCase().includes(q);
  });
  const myProductsTotalPages = Math.max(1, Math.ceil(filteredMyProducts.length / MY_PRODUCTS_PAGE_SIZE));
  const myProductsPageClamped = Math.min(myProductsPageNum, myProductsTotalPages);
  const paginatedMyProducts = filteredMyProducts.slice(
    (myProductsPageClamped - 1) * MY_PRODUCTS_PAGE_SIZE,
    myProductsPageClamped * MY_PRODUCTS_PAGE_SIZE
  );
  const selectedProductCount = Object.keys(selectedProductIds).length;
  const allOnPageSelected = paginatedMyProducts.length > 0 && paginatedMyProducts.every(p => selectedProductIds[p.id]);

  const toggleSelectAllOnPage = () => {
    setSelectedProductIds(prev => {
      const next = { ...prev };
      paginatedMyProducts.forEach(p => {
        if (allOnPageSelected) delete next[p.id]; else next[p.id] = true;
      });
      return next;
    });
  };

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
        body: JSON.stringify({
          query: researchQuery.trim(),
          platforms,
          max_results: appSettings.defaultMaxResults,
          sort_by: sortBy || null,
          min_price: priceMin !== '' ? Number(priceMin) : null,
          max_price: priceMax !== '' ? Number(priceMax) : null,
          min_rating: minRating > 0 ? minRating : null,
          in_stock_only: inStockOnly,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      setResearchResults(results);
      if (results.length === 0) showToast(t.noProductsFound, 'info');
      const failedPlatforms = Object.keys(data.errors || {});
      if (failedPlatforms.length > 0) {
        addNotification('error', `Search failed on ${failedPlatforms.join(', ')}: ${data.errors[failedPlatforms[0]]}`);
      }
    } catch {
      setResearchError(t.reachFailed);
      setResearchResults([]);
      showToast(t.reachFailed, 'error');
      addNotification('error', `Product search failed for "${researchQuery.trim()}"`);
    } finally {
      setResearchLoading(false);
    }
  }, [researchQuery, researchPlatforms, showToast, t, appSettings.defaultMaxResults, addNotification, sortBy, priceMin, priceMax, minRating, inStockOnly]);

  const openProductModal = (product, mode) => {
    setAiAnalysis(null);
    setAiAnalysisError(null);
    setProductModal({ product, mode });
  };

  const closeProductModal = useCallback(() => {
    if (addingProduct) return;
    setProductModalClosing(true);
    setTimeout(() => {
      setProductModal(null);
      setProductModalClosing(false);
      setAiAnalysis(null);
      setAiAnalysisError(null);
    }, 200);
  }, [addingProduct]);

  const confirmAddToShop = useCallback(async () => {
    if (!productModal?.product) return;
    const p = productModal.product;
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
      addNotification('success', `Added "${p.name}" to your products`);
      if (p.in_stock === false) {
        addNotification('warning', `"${p.name}" is currently out of stock`);
      }
      setResearchResults(prev => prev.map(item => (item === p ? { ...item, _added: true } : item)));
      closeProductModal();
    } catch {
      showToast(t.addFailed, 'error');
    } finally {
      setAddingProduct(false);
    }
  }, [productModal, showToast, t, closeProductModal, addNotification]);

  const analyzeProductWithAi = useCallback(async () => {
    if (!productModal?.product) return;
    const p = productModal.product;
    setAiAnalyzing(true);
    setAiAnalysisError(null);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/analyze-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          price: p.price,
          currency: p.currency || 'USD',
          description: p.description,
          rating: p.rating,
          reviews_count: p.reviews_count,
          platform: p.platform,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) {
        setAiAnalysisError(data.message || 'AI analysis unavailable');
        showToast(data.message || 'AI analysis unavailable', 'warning');
      } else {
        setAiAnalysis(data);
      }
    } catch {
      setAiAnalysisError('Could not reach the AI analysis service');
      showToast('Could not reach the AI analysis service', 'error');
    } finally {
      setAiAnalyzing(false);
    }
  }, [productModal, showToast]);

  const openPriceHistory = useCallback(async (product) => {
    setPriceHistoryModal({ product, data: null, error: null });
    setPriceHistoryLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/product/${product.id}/price-history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPriceHistoryModal({ product, data, error: null });
    } catch {
      setPriceHistoryModal({ product, data: null, error: 'Could not load price history' });
      showToast('Could not load price history', 'error');
    } finally {
      setPriceHistoryLoading(false);
    }
  }, [showToast]);

  const fetchPlatforms = useCallback(async () => {
    setPlatformsLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/platforms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlatforms(Array.isArray(data) ? data : []);
    } catch {
      setPlatforms([]);
    } finally {
      setPlatformsLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlatforms(); }, [fetchPlatforms]);

  const openAddPlatform = () => {
    setPlatformForm(EMPTY_PLATFORM_FORM);
    setEditingPlatform('new');
  };

  const openEditPlatform = (p) => {
    setPlatformForm({
      name: p.name,
      url: p.url,
      is_active: p.is_active,
      configText: JSON.stringify(p.config || {}, null, 2),
    });
    setEditingPlatform(p);
  };

  const openPredefinedPlatform = (template) => {
    setPlatformForm({ name: template.name, url: template.url, is_active: false, configText: '{}' });
    setEditingPlatform('new');
  };

  const closePlatformModal = () => {
    if (savingPlatform) return;
    setEditingPlatform(null);
  };

  const savePlatform = useCallback(async () => {
    if (!platformForm.name.trim() || !platformForm.url.trim()) {
      showToast('Name and URL are required', 'warning');
      return;
    }

    let config;
    try {
      config = JSON.parse(platformForm.configText || '{}');
    } catch {
      showToast(t.invalidConfigJson, 'error');
      return;
    }

    const isNew = editingPlatform === 'new';
    setSavingPlatform(true);
    try {
      const res = await fetch(
        `${RESEARCH_API_URL}/platforms${isNew ? '' : `/${editingPlatform.id}`}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: platformForm.name.trim(),
            url: platformForm.url.trim(),
            is_active: platformForm.is_active,
            config,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      showToast(isNew ? t.platformAdded : t.platformUpdated, 'success');
      setEditingPlatform(null);
      fetchPlatforms();
    } catch (err) {
      showToast(typeof err.message === 'string' ? err.message : t.platformSaveFailed, 'error');
    } finally {
      setSavingPlatform(false);
    }
  }, [platformForm, editingPlatform, showToast, t, fetchPlatforms]);

  const deletePlatformHandler = useCallback(async (p) => {
    if (!window.confirm(t.confirmDeletePlatform)) return;
    try {
      const res = await fetch(`${RESEARCH_API_URL}/platforms/${p.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(t.platformDeleted, 'success');
      fetchPlatforms();
    } catch {
      showToast(t.platformDeleteFailed, 'error');
    }
  }, [showToast, t, fetchPlatforms]);

  const togglePlatformActive = useCallback(async (p) => {
    setPlatforms(prev => prev.map(x => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
    try {
      const res = await fetch(`${RESEARCH_API_URL}/platforms/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setPlatforms(prev => prev.map(x => (x.id === p.id ? { ...x, is_active: p.is_active } : x)));
      showToast(t.platformActionFailed, 'error');
    }
  }, [showToast, t]);

  const testPlatformHandler = useCallback(async (p) => {
    setTestingPlatformId(p.id);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/platforms/${p.id}/test`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      showToast(data.message, data.success ? 'success' : 'warning');
      if (!data.success) addNotification('error', `Scraping test failed for "${p.name}": ${data.message}`);
    } catch {
      showToast(t.platformActionFailed, 'error');
      addNotification('error', `Scraping test failed for "${p.name}"`);
    } finally {
      setTestingPlatformId(null);
    }
  }, [showToast, t, addNotification]);

  const fetchMyProducts = useCallback(async () => {
    setMyProductsLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/products?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMyProducts(data.products || []);
      setMyProductsTotal(data.total || 0);
    } catch {
      setMyProducts([]);
      showToast('Could not load saved products', 'error');
    } finally {
      setMyProductsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (page === 'myproducts' || page === 'pricing') fetchMyProducts(); }, [page, fetchMyProducts]);

  const applyAiDescription = useCallback(async () => {
    if (!productModal?.product || !aiAnalysis?.description) return;
    const description = aiAnalysis.description;

    if (productModal.mode === 'saved') {
      try {
        const res = await fetch(`${RESEARCH_API_URL}/product/${productModal.product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast('Description updated', 'success');
        setProductModal(prev => (prev ? { ...prev, product: { ...prev.product, description } } : prev));
        fetchMyProducts();
      } catch {
        showToast('Failed to update product', 'error');
      }
    } else {
      setProductModal(prev => (prev ? { ...prev, product: { ...prev.product, description } } : prev));
      showToast('Description applied — click Add to Shop to save it', 'success');
    }
  }, [productModal, aiAnalysis, showToast, fetchMyProducts]);

  const refreshAllPrices = useCallback(async () => {
    setRefreshingPrices(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/products/refresh-prices`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      showToast(`Refreshed ${data.updated_count} product(s)${data.failed_count ? `, ${data.failed_count} unchanged/failed` : ''}`, 'success');
      const changed = (data.results || []).filter(r => r.changed);
      if (changed.length === 1) {
        const r = changed[0];
        addNotification('info', `Price changed for "${r.name}": ${r.old_price ?? '—'} → ${r.new_price}`);
      } else if (changed.length > 1) {
        addNotification('info', `Prices changed for ${changed.length} product(s)`);
      }
      fetchMyProducts();
    } catch {
      showToast('Failed to refresh prices', 'error');
      addNotification('error', 'Price refresh failed');
    } finally {
      setRefreshingPrices(false);
    }
  }, [showToast, fetchMyProducts, addNotification]);

  const toggleProductSelected = (id) => {
    setSelectedProductIds(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  const deleteSavedProduct = useCallback(async (id) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setDeletingProductId(id);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/product/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Product deleted', 'success');
      setSelectedProductIds(prev => { const next = { ...prev }; delete next[id]; return next; });
      fetchMyProducts();
    } catch {
      showToast('Failed to delete product', 'error');
    } finally {
      setDeletingProductId(null);
    }
  }, [showToast, fetchMyProducts]);

  const bulkDeleteSelected = useCallback(async () => {
    const ids = Object.keys(selectedProductIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected product(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetch(`${RESEARCH_API_URL}/product/${id}`, { method: 'DELETE' }))
      );
      const failedCount = results.filter(r => r.status === 'rejected' || !r.value?.ok).length;
      if (failedCount > 0) {
        showToast(`Deleted ${ids.length - failedCount} of ${ids.length} — ${failedCount} failed`, 'warning');
      } else {
        showToast(`Deleted ${ids.length} product(s)`, 'success');
      }
      setSelectedProductIds({});
      fetchMyProducts();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedProductIds, showToast, fetchMyProducts]);

  const selectPricingProduct = (product) => {
    setPricingSelectedProduct(product);
    setPricingCostPrice(product.price != null ? String(product.price) : '');
    setPricingPlatform(product.platform || 'aliexpress');
    setPricingResult(null);
    setPricingError(null);
  };

  const clearPricingProduct = () => {
    setPricingSelectedProduct(null);
    setPricingCostPrice('');
    setPricingResult(null);
    setPricingError(null);
  };

  const goToPricingFor = (product) => {
    selectPricingProduct(product);
    setPage('pricing');
  };

  const analyzePricing = async () => {
    const costPriceNum = Number(pricingCostPrice);
    if (!pricingCostPrice || Number.isNaN(costPriceNum) || costPriceNum <= 0) {
      showToast('Enter a valid cost price', 'warning');
      return;
    }
    setPricingLoading(true);
    setPricingError(null);
    setPricingResult(null);
    const marginOption = MARGIN_OPTIONS.find(m => m.value === pricingMargin) || MARGIN_OPTIONS[1];

    // /api/pricing/analyze only supports a saved product's own stored price as the cost
    // basis; if the cost-price field still matches that stored price, use it directly —
    // otherwise (edited cost, or an ad-hoc unsaved product) use /suggest-price, which
    // accepts an explicit cost_price override.
    const usingStoredCost = pricingSelectedProduct && costPriceNum === Number(pricingSelectedProduct.price);
    const endpoint = usingStoredCost ? 'analyze' : 'suggest-price';
    const body = usingStoredCost
      ? { product_id: pricingSelectedProduct.id, strategy: marginOption.strategy, platform: pricingPlatform }
      : {
          product_id: pricingSelectedProduct?.id ?? null,
          product_name: pricingSelectedProduct?.name || pricingSearch.trim() || 'Unnamed product',
          cost_price: costPriceNum,
          platform: pricingPlatform,
          strategy: marginOption.strategy,
        };

    try {
      const res = await fetch(`${RESEARCH_API_URL}/pricing/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPricingResult(data);
    } catch (err) {
      setPricingError(err.message || 'Could not analyze pricing');
      showToast('Could not analyze pricing — check that the Pricing Agent is reachable', 'error');
    } finally {
      setPricingLoading(false);
    }
  };

  const applyPricingSuggestion = async () => {
    if (!pricingSelectedProduct || !pricingResult) return;
    setPricingApplying(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/pricing/bulk-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: pricingSelectedProduct.id, applied_price: pricingResult.suggested_price }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const itemResult = data.results?.[0];
      if (!itemResult?.success) throw new Error(itemResult?.message || 'Failed to apply price');

      showToast(`Price applied — $${pricingResult.suggested_price.toFixed(2)}`, 'success');
      addNotification('success', `Applied new price ${pricingSelectedProduct.currency || 'USD'} ${pricingResult.suggested_price.toFixed(2)} to "${pricingSelectedProduct.name}"`);
      setPricingSelectedProduct(prev => (prev ? { ...prev, price: pricingResult.suggested_price } : prev));
      fetchMyProducts();
    } catch (err) {
      showToast(err.message || 'Could not apply price', 'error');
    } finally {
      setPricingApplying(false);
    }
  };

  const saveForLater = () => {
    showToast('Suggestion saved to Pricing History for later use', 'success');
  };

  const openPricingHistoryModal = async (product) => {
    setPricingHistoryModal({ product, data: null, error: null });
    setPricingHistoryLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/pricing/history/${product.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPricingHistoryModal({ product, data, error: null });
    } catch {
      setPricingHistoryModal({ product, data: null, error: 'Could not load pricing history' });
      showToast('Could not load pricing history', 'error');
    } finally {
      setPricingHistoryLoading(false);
    }
  };

  const exportPricingHistory = () => {
    const entries = pricingHistoryModal?.data?.entries || [];
    if (entries.length === 0) {
      showToast('No pricing history to export', 'warning');
      return;
    }
    const rows = [
      ['Date', 'Cost Price', 'Suggested Price', 'Applied Price', 'Margin %', 'Strategy'],
      ...entries.map(e => [
        new Date(e.created_at).toLocaleString(),
        e.cost_price ?? '',
        e.suggested_price ?? '',
        e.applied_price ?? '',
        e.profit_margin ?? '',
        e.strategy ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob('﻿' + csv, 'text/csv', `pricing-history-${pricingHistoryModal.product.id}.csv`);
  };

  const generateReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/products?limit=200`);
      const data = res.ok ? await res.json() : { products: [], total: 0 };
      const products = data.products || [];
      const withPrice = products.filter(p => p.price != null);
      const avgPrice = withPrice.length > 0 ? withPrice.reduce((sum, p) => sum + p.price, 0) / withPrice.length : 0;
      const platformCounts = {};
      products.forEach(p => { platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1; });

      setReportModal({
        generatedAt: new Date().toISOString(),
        totalProducts: products.length,
        avgPrice,
        platformCounts,
        recentActivity: notifications.slice(0, 8),
      });
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setReportLoading(false);
    }
  }, [notifications, showToast]);

  const downloadBlob = (content, mimeType, filename) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runProductExport = () => {
    let rows = filteredMyProducts;
    if (exportForm.dateFrom) {
      const from = new Date(exportForm.dateFrom).getTime();
      rows = rows.filter(p => p.created_at && new Date(p.created_at).getTime() >= from);
    }
    if (exportForm.dateTo) {
      const to = new Date(exportForm.dateTo).getTime() + 86400000;
      rows = rows.filter(p => p.created_at && new Date(p.created_at).getTime() <= to);
    }
    if (rows.length === 0) {
      showToast('No products match the selected export options', 'warning');
      return;
    }

    const cols = EXPORT_COLUMNS.filter(c => exportForm.columns.includes(c.key));
    if (cols.length === 0) {
      showToast('Select at least one column to export', 'warning');
      return;
    }

    if (exportForm.format === 'json') {
      const data = rows.map(p => Object.fromEntries(cols.map(c => [c.key, p[c.key] ?? null])));
      downloadBlob(JSON.stringify(data, null, 2), 'application/json', 'my-products.json');
    } else {
      const csvRows = [cols.map(c => c.label), ...rows.map(p => cols.map(c => (c.key === 'in_stock' ? (p.in_stock ? 'Yes' : 'No') : p[c.key] ?? '')))];
      const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      downloadBlob('﻿' + csv, 'text/csv', 'my-products.csv');
    }

    showToast(`Exported ${rows.length} product(s)`, 'success');
    setExportModalOpen(false);
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
    { id: 'myproducts', icon: '🛍️', label: 'My Products' },
    { id: 'pricing', icon: '💰', label: 'Pricing' },
    { id: 'platforms', icon: '⚙️', label: t.platformSettings },
    { id: 'usersettings', icon: '⚙️', label: 'Settings' },
  ];

  const closeAnyModal = useCallback(() => {
    if (logoutConfirmOpen) { setLogoutConfirmOpen(false); return; }
    if (shortcutsModalOpen) { setShortcutsModalOpen(false); return; }
    if (notifCenterOpen) { setNotifCenterOpen(false); return; }
    if (exportModalOpen) { setExportModalOpen(false); return; }
    if (reportModal) { setReportModal(null); return; }
    if (priceHistoryModal) { setPriceHistoryModal(null); return; }
    if (pricingHistoryModal) { setPricingHistoryModal(null); return; }
    if (productModal) { closeProductModal(); return; }
    if (editingPlatform) { setEditingPlatform(null); return; }
    if (settingsAgent) { setSettingsAgent(null); return; }
  }, [logoutConfirmOpen, shortcutsModalOpen, notifCenterOpen, exportModalOpen, reportModal, priceHistoryModal, pricingHistoryModal, productModal, editingPlatform, settingsAgent, closeProductModal]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        closeAnyModal();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPage('research');
        setTimeout(() => researchInputRef.current?.focus(), 60);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setPage('dashboard');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPage('myproducts');
        return;
      }
      if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeAnyModal]);

  return (
    <div
      className={`dsh ${dark ? 'dsh--dark' : 'dsh--light'}`}
      dir="ltr"
      style={appSettings.accentColor !== DEFAULT_SETTINGS.accentColor ? deriveAccentVars(appSettings.accentColor) : undefined}
    >
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
            <button
              className="dsh-btn dsh-btn--ghost"
              onClick={() => fetchAll(false)}
              disabled={refreshingAll}
              title="Refresh all data"
            >
              {refreshingAll ? <span className="dsh-spinner" /> : '⟳'} {t.refresh}
            </button>

            <button
              className="dsh-icon-btn dsh-icon-btn--danger"
              onClick={() => setLogoutConfirmOpen(true)}
              title="Log out"
            >
              ✕
            </button>

            <div className="dsh-notif-wrap">
              <button
                className="dsh-notif-bell"
                onClick={() => setNotifCenterOpen(o => !o)}
                title="Notifications"
              >
                🔔
                {unreadNotifCount > 0 && <span className="dsh-notif-badge">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
              </button>

              {notifCenterOpen && (
                <>
                  <div className="dsh-notif-overlay" onClick={() => setNotifCenterOpen(false)} />
                  <div className="dsh-notif-panel">
                    <div className="dsh-notif-panel-header">
                      <span>Notifications</span>
                      <div className="dsh-notif-panel-actions">
                        <button onClick={markAllNotificationsRead} disabled={unreadNotifCount === 0}>Mark all read</button>
                        <button onClick={clearAllNotifications} disabled={notifications.length === 0}>Clear all</button>
                      </div>
                    </div>
                    <div className="dsh-notif-list">
                      {notifications.length === 0 ? (
                        <div className="dsh-notif-empty">No notifications yet</div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            className={`dsh-notif-item dsh-notif-item--${n.type} ${n.read ? '' : 'dsh-notif-item--unread'}`}
                            onClick={() => markNotificationRead(n.id)}
                          >
                            <span className="dsh-notif-icon">{NOTIF_ICONS[n.type] || 'ℹ'}</span>
                            <div className="dsh-notif-body">
                              <div className="dsh-notif-message">{n.message}</div>
                              <div className="dsh-notif-time">{formatRelativeTime(n.time)}</div>
                            </div>
                            {!n.read && <span className="dsh-notif-dot" />}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
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

            <div className="dsh-agents-layout">
              <div className="dsh-agents-list-panel">
                <div className="dsh-agents-list-scroll">
                  {loading ? (
                    [...Array(6)].map((_, i) => <SkeletonAgentListItem key={i} />)
                  ) : filteredAgents.length === 0 ? (
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
                    filteredAgents.map((a, i) => (
                      <div
                        key={a.id || i}
                        className={`dsh-agent-list-item ${selectedAgent?.id === a.id ? 'dsh-agent-list-item--selected' : ''} ${pausedAgents[a.id] ? 'dsh-agent-list-item--paused' : ''}`}
                        onClick={() => setSelectedAgent(a)}
                      >
                        <span className="dsh-agent-avatar dsh-agent-avatar--sm">{AGENT_ICONS[i % AGENT_ICONS.length]}</span>
                        <div className="dsh-agent-list-info">
                          <div className="dsh-agent-list-name">{a.name || a.agent_name || 'Agent'}</div>
                          <StatusBadge status={pausedAgents[a.id] ? 'paused' : a.status} />
                        </div>
                        <div className="dsh-agent-list-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="dsh-agent-btn dsh-agent-btn--pause dsh-agent-btn--icon"
                            title={pausedAgents[a.id] ? t.resume : t.pause}
                            onClick={() => togglePause(a.id)}
                          >
                            {pausedAgents[a.id] ? '▶' : '⏸'}
                          </button>
                          <button
                            className="dsh-agent-btn dsh-agent-btn--settings dsh-agent-btn--icon"
                            title={t.settings}
                            onClick={() => handleOpenSettings(a)}
                          >
                            ⚙
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="dsh-agents-detail-panel">
                <EmptyState icon="🤖" title={t.selectAgentTitle} subtitle={t.selectAgentSub} />
              </div>
            </div>
          </section>
        )}

        {page === 'research' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>📦 {t.productsResearch}</h2>
            </div>

            <div className="dsh-research-controls">
              <input
                ref={researchInputRef}
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

            <div className="dsh-filters-toggle-row">
              <button
                type="button"
                className={`dsh-filters-toggle ${filtersOpen ? 'dsh-filters-toggle--open' : ''}`}
                onClick={() => setFiltersOpen(o => !o)}
                aria-expanded={filtersOpen}
              >
                🎛 Filters
                {activeResearchFilterCount > 0 && (
                  <span className="dsh-filters-count-badge">{activeResearchFilterCount}</span>
                )}
                <span className="dsh-filters-chevron">{filtersOpen ? '▲' : '▼'}</span>
              </button>
            </div>

            {filtersOpen && (
              <div className="dsh-research-filters">
                <div className="dsh-filter-group">
                  <label>Sort By</label>
                  <select className="dsh-settings-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="">Default</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="orders_desc">Most Orders</option>
                    <option value="rating_desc">Best Rating</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
                <div className="dsh-filter-group">
                  <label>Price</label>
                  <input
                    type="number"
                    className="dsh-input dsh-filter-num"
                    placeholder="Min"
                    min="0"
                    value={priceMin}
                    onChange={e => setPriceMin(e.target.value)}
                  />
                  <span className="dsh-filter-dash">–</span>
                  <input
                    type="number"
                    className="dsh-input dsh-filter-num"
                    placeholder="Max"
                    min="0"
                    value={priceMax}
                    onChange={e => setPriceMax(e.target.value)}
                  />
                </div>
                <div className="dsh-filter-group">
                  <label>Min Rating</label>
                  <span className="dsh-star-rating dsh-star-selector">
                    {[1, 2, 3, 4, 5].map(i => (
                      <span
                        key={i}
                        className={`dsh-star ${i <= minRating ? 'dsh-star--filled' : ''}`}
                        onClick={() => setMinRating(i === minRating ? 0 : i)}
                      >★</span>
                    ))}
                  </span>
                </div>
                <div className="dsh-filter-group">
                  <label className="dsh-filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={e => setInStockOnly(e.target.checked)}
                    />
                    In Stock Only
                  </label>
                </div>
                <div className="dsh-filter-actions">
                  <button
                    className="dsh-btn dsh-btn--primary"
                    onClick={searchResearchProducts}
                    disabled={researchLoading || !researchQuery.trim()}
                    title="Re-run the search with these filters applied server-side"
                  >
                    ✓ Apply Filters
                  </button>
                  {hasActiveResearchFilters && (
                    <button className="dsh-btn dsh-btn--ghost" onClick={clearResearchFilters}>✕ Clear Filters</button>
                  )}
                </div>
              </div>
            )}

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
            ) : sortedResearchResults.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No Matches"
                subtitle="No products match the current filters"
                action={<button className="dsh-btn dsh-btn--ghost" onClick={clearResearchFilters}>✕ Clear Filters</button>}
              />
            ) : (
              <div className="dsh-grid">
                {sortedResearchResults.map((p, i) => (
                  <div
                    key={p.url || `${p.platform}-${i}`}
                    className="dsh-product-card"
                    onClick={() => openProductModal(p, 'research')}
                  >
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
                      onClick={(e) => { e.stopPropagation(); openProductModal(p, 'research'); }}
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

        {page === 'myproducts' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>🛍️ My Products</h2>
              <div className="dsh-tools">
                <input
                  className="dsh-input"
                  placeholder="Search saved products..."
                  value={myProductsSearch}
                  onChange={e => { setMyProductsSearch(e.target.value); setMyProductsPageNum(1); }}
                />
                {selectedProductCount > 0 && (
                  <button className="dsh-btn dsh-btn--ghost" onClick={bulkDeleteSelected} disabled={bulkDeleting}>
                    {bulkDeleting ? (<><span className="dsh-spinner" /> Deleting...</>) : `🗑 Delete (${selectedProductCount})`}
                  </button>
                )}
                <button
                  className="dsh-btn dsh-btn--ghost"
                  onClick={refreshAllPrices}
                  disabled={refreshingPrices || myProducts.length === 0}
                >
                  {refreshingPrices ? (<><span className="dsh-spinner" /> Refreshing...</>) : '💰 Refresh Prices'}
                </button>
                <button
                  className="dsh-btn dsh-btn--ghost"
                  onClick={() => setExportModalOpen(true)}
                  disabled={filteredMyProducts.length === 0}
                >
                  ⬇ Export
                </button>
              </div>
            </div>

            {myProductsLoading ? (
              <div className="dsh-list">{[0, 1, 2, 3].map(i => <SkeletonTaskRow key={i} />)}</div>
            ) : filteredMyProducts.length === 0 ? (
              myProductsSearch.trim() ? (
                <EmptyState
                  icon="🔍"
                  title={t.noResultsTitle}
                  subtitle="No saved products match your search"
                  action={<button className="dsh-btn dsh-btn--ghost" onClick={() => setMyProductsSearch('')}>{t.clearSearch}</button>}
                />
              ) : (
                <EmptyState
                  icon="🛍️"
                  title="No Saved Products"
                  subtitle="Products you add from Products Research will show up here"
                  action={<button className="dsh-btn dsh-btn--primary" onClick={() => setPage('research')}>📦 {t.productsResearch}</button>}
                />
              )
            ) : (
              <>
                <div className="dsh-products-table-wrap">
                  <table className="dsh-products-table">
                    <thead>
                      <tr>
                        <th className="dsh-products-th-check">
                          <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
                        </th>
                        <th></th>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Platform</th>
                        <th>Date Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMyProducts.map(p => (
                        <tr key={p.id} className={selectedProductIds[p.id] ? 'dsh-products-row--selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!selectedProductIds[p.id]}
                              onChange={() => toggleProductSelected(p.id)}
                            />
                          </td>
                          <td>
                            <div className="dsh-products-thumb">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} onError={e => { e.target.style.display = 'none'; }} />
                              ) : (
                                <span>📦</span>
                              )}
                            </div>
                          </td>
                          <td className="dsh-products-name-cell" title={p.name}>{p.name}</td>
                          <td>{p.price != null ? `${p.currency || 'USD'} ${Number(p.price).toFixed(2)}` : '—'}</td>
                          <td><span className="dsh-badge dsh-badge--off">{p.platform}</span></td>
                          <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                          <td>
                            <div className="dsh-products-actions">
                              <button
                                className="dsh-agent-btn dsh-agent-btn--settings dsh-agent-btn--icon"
                                title="View details"
                                onClick={() => openProductModal(p, 'saved')}
                              >
                                👁
                              </button>
                              <button
                                className="dsh-agent-btn dsh-agent-btn--settings dsh-agent-btn--icon"
                                title="Price History"
                                onClick={() => openPriceHistory(p)}
                              >
                                📈
                              </button>
                              <button
                                className="dsh-agent-btn dsh-agent-btn--settings dsh-agent-btn--icon"
                                title="Price This"
                                onClick={() => goToPricingFor(p)}
                              >
                                💰
                              </button>
                              <button
                                className="dsh-agent-btn dsh-agent-btn--pause dsh-agent-btn--icon"
                                title="Delete"
                                onClick={() => deleteSavedProduct(p.id)}
                                disabled={deletingProductId === p.id}
                              >
                                {deletingProductId === p.id ? <span className="dsh-spinner" /> : '🗑'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {myProductsTotalPages > 1 && (
                  <div className="dsh-pagination">
                    <button
                      className="dsh-btn dsh-btn--ghost"
                      disabled={myProductsPageClamped <= 1}
                      onClick={() => setMyProductsPageNum(p => Math.max(1, p - 1))}
                    >
                      ‹ Prev
                    </button>
                    <span className="dsh-pagination-info">
                      Page {myProductsPageClamped} of {myProductsTotalPages} · {myProductsTotal} total
                    </span>
                    <button
                      className="dsh-btn dsh-btn--ghost"
                      disabled={myProductsPageClamped >= myProductsTotalPages}
                      onClick={() => setMyProductsPageNum(p => Math.min(myProductsTotalPages, p + 1))}
                    >
                      Next ›
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {page === 'pricing' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>💰 Pricing</h2>
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setPage('myproducts')}>← Back to Products</button>
            </div>

            {!pricingSelectedProduct ? (
              <div className="dsh-pricing-selector">
                <input
                  className="dsh-input dsh-pricing-search-input"
                  placeholder="Enter product URL or name"
                  value={pricingSearch}
                  onChange={e => setPricingSearch(e.target.value)}
                />
                {pricingSearchResults.length === 0 ? (
                  <EmptyState
                    icon="🔍"
                    title="No Matching Products"
                    subtitle="No saved products match that search — you can still price it as a new item below"
                  />
                ) : (
                  <div className="dsh-pricing-product-list">
                    {pricingSearchResults.slice(0, 8).map(p => (
                      <div key={p.id} className="dsh-pricing-product-item" onClick={() => selectPricingProduct(p)}>
                        <div className="dsh-pricing-product-thumb">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} onError={e => { e.target.style.display = 'none'; }} />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>
                        <div className="dsh-pricing-product-info">
                          <div className="dsh-pricing-product-name" title={p.name}>{p.name}</div>
                          <div className="dsh-pricing-product-meta">
                            <span className="dsh-badge dsh-badge--off">{p.platform}</span>
                            <span>{p.price != null ? `${p.currency || 'USD'} ${Number(p.price).toFixed(2)}` : 'No price'}</span>
                          </div>
                        </div>
                        <span className="dsh-pricing-product-arrow">›</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="dsh-pricing-selected-card">
                <div className="dsh-pricing-selected-thumb">
                  {pricingSelectedProduct.image_url ? (
                    <img
                      src={pricingSelectedProduct.image_url}
                      alt={pricingSelectedProduct.name}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <span>📦</span>
                  )}
                </div>
                <div className="dsh-pricing-selected-info">
                  <div className="dsh-pricing-selected-name">{pricingSelectedProduct.name}</div>
                  <div className="dsh-pricing-selected-meta">
                    <span className="dsh-badge dsh-badge--off">{pricingSelectedProduct.platform}</span>
                    <span>
                      Current price: {pricingSelectedProduct.price != null
                        ? `${pricingSelectedProduct.currency || 'USD'} ${Number(pricingSelectedProduct.price).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="dsh-pricing-selected-actions">
                  <button className="dsh-btn dsh-btn--ghost" onClick={() => openPricingHistoryModal(pricingSelectedProduct)}>
                    📈 View Pricing History
                  </button>
                  <button className="dsh-btn dsh-btn--ghost" onClick={clearPricingProduct}>Change Product</button>
                </div>
              </div>
            )}

            <div className="dsh-pricing-inputs">
              <div className="dsh-pricing-field">
                <label>Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="dsh-input"
                  placeholder="0.00"
                  value={pricingCostPrice}
                  onChange={e => setPricingCostPrice(e.target.value)}
                />
              </div>

              <div className="dsh-pricing-field">
                <label>Platform</label>
                <div className="dsh-pill-toggle-group">
                  {RESEARCH_PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`dsh-pill-toggle ${pricingPlatform === p.id ? 'dsh-pill-toggle--active' : ''}`}
                      onClick={() => setPricingPlatform(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dsh-pricing-field">
                <label>Profit Margin %</label>
                <div className="dsh-pill-toggle-group">
                  {MARGIN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`dsh-pill-toggle dsh-margin-toggle-btn ${pricingMargin === opt.value ? 'dsh-pill-toggle--active' : ''}`}
                      onClick={() => setPricingMargin(opt.value)}
                    >
                      {opt.label}
                      <span className="dsh-margin-toggle-sub">{STRATEGY_LABELS[opt.strategy]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="dsh-btn dsh-btn--primary dsh-pricing-analyze-btn"
                onClick={analyzePricing}
                disabled={pricingLoading || !pricingCostPrice}
              >
                {pricingLoading ? (<><span className="dsh-spinner" /> Analyzing...</>) : '✨ Analyze & Get Suggestion'}
              </button>
            </div>

            {pricingError && !pricingLoading && (
              <div className="dsh-ai-error">⚠️ {pricingError}</div>
            )}

            {pricingResult && !pricingLoading && (
              <div className="dsh-pricing-results">
                <div className="dsh-pricing-compare">
                  <div className="dsh-pricing-compare-item">
                    <span className="dsh-pricing-compare-label">
                      {pricingSelectedProduct ? 'Current Price' : 'Cost Price'}
                    </span>
                    <span className="dsh-pricing-compare-value">
                      ${Number(pricingSelectedProduct?.price ?? pricingResult.cost_price).toFixed(2)}
                    </span>
                  </div>
                  <div className="dsh-pricing-compare-arrow">→</div>
                  <div className="dsh-pricing-compare-item dsh-pricing-compare-item--suggested">
                    <span className="dsh-pricing-compare-label">Suggested Price</span>
                    <span className="dsh-pricing-compare-value dsh-pricing-compare-value--gold">
                      ${Number(pricingResult.suggested_price).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="dsh-pricing-margin-display">
                  <span className="dsh-pricing-margin-label">Profit Margin</span>
                  <span className="dsh-pricing-margin-value">{Number(pricingResult.profit_margin_percent).toFixed(1)}%</span>
                </div>

                <div className="dsh-pricing-stats-grid">
                  <div className="dsh-pricing-stat">
                    <span className="dsh-pricing-stat-label">Recommended Range</span>
                    <span className="dsh-pricing-stat-value">
                      ${Number(pricingResult.price_range.min).toFixed(2)} – ${Number(pricingResult.price_range.max).toFixed(2)}
                    </span>
                  </div>
                  <div className="dsh-pricing-stat">
                    <span className="dsh-pricing-stat-label">Competitor Avg</span>
                    <span className="dsh-pricing-stat-value">
                      {pricingResult.competitor_prices.avg != null ? `$${Number(pricingResult.competitor_prices.avg).toFixed(2)}` : 'No data'}
                    </span>
                    {pricingResult.competitor_prices.avg != null && (
                      <span className="dsh-pricing-stat-sub">
                        ${Number(pricingResult.competitor_prices.min).toFixed(2)} – ${Number(pricingResult.competitor_prices.max).toFixed(2)}
                        {' · '}{pricingResult.competitor_prices.sample_size} similar
                      </span>
                    )}
                  </div>
                  <div className="dsh-pricing-stat">
                    <span className="dsh-pricing-stat-label">Strategy</span>
                    <span className={`dsh-strategy-badge dsh-strategy-badge--${pricingResult.strategy}`}>
                      {STRATEGY_LABELS[pricingResult.strategy] || pricingResult.strategy}
                    </span>
                  </div>
                </div>

                <div className="dsh-pricing-ai-box">
                  <div className="dsh-pricing-ai-box-header">✨ AI Recommendation</div>
                  <p>{pricingResult.ai_recommendation}</p>
                </div>

                {pricingResult.warnings.length > 0 && (
                  <div className="dsh-pricing-warnings">
                    {pricingResult.warnings.map((w, i) => (
                      <div key={i} className="dsh-pricing-warning-item">⚠️ {w}</div>
                    ))}
                  </div>
                )}

                <div className="dsh-pricing-actions">
                  <button
                    className="dsh-btn dsh-btn--primary"
                    onClick={applyPricingSuggestion}
                    disabled={!pricingSelectedProduct || pricingApplying}
                    title={!pricingSelectedProduct ? 'Select a saved product to apply a price' : undefined}
                  >
                    {pricingApplying ? (<><span className="dsh-spinner" /> Applying...</>) : '✓ Apply This Price'}
                  </button>
                  <button className="dsh-btn dsh-btn--ghost" onClick={saveForLater}>🔖 Save for Later</button>
                  <button className="dsh-btn dsh-btn--ghost" onClick={() => setPage('myproducts')}>← Back to Products</button>
                </div>
              </div>
            )}
          </section>
        )}

        {page === 'platforms' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>⚙️ {t.platformSettings}</h2>
              <div className="dsh-tools">
                <div className="dsh-platform-import">
                  {PREDEFINED_PLATFORMS.map(tpl => (
                    <button key={tpl.name} className="dsh-btn dsh-btn--ghost" onClick={() => openPredefinedPlatform(tpl)}>
                      + {tpl.label}
                    </button>
                  ))}
                </div>
                <button className="dsh-btn dsh-btn--primary" onClick={openAddPlatform}>+ {t.addPlatform}</button>
              </div>
            </div>

            {platformsLoading ? (
              <div className="dsh-list">{[0, 1, 2].map(i => <SkeletonTaskRow key={i} />)}</div>
            ) : platforms.length === 0 ? (
              <EmptyState
                icon="⚙️"
                title={t.noPlatformsTitle}
                subtitle={t.noPlatformsSub}
                action={<button className="dsh-btn dsh-btn--primary" onClick={openAddPlatform}>+ {t.addPlatform}</button>}
              />
            ) : (
              <div className="dsh-list">
                {platforms.map(p => (
                  <div key={p.id} className="dsh-platform-row">
                    <div className="dsh-platform-row-main">
                      <div className="dsh-platform-row-name">
                        {p.name}
                        <span className="dsh-badge dsh-badge--off">{p.scraper_type === 'built_in' ? t.builtIn : t.custom}</span>
                      </div>
                      <div className="dsh-row-sub">{p.url}</div>
                    </div>
                    <label className="dsh-toggle" title={t.active}>
                      <input type="checkbox" checked={p.is_active} onChange={() => togglePlatformActive(p)} />
                      <span className="dsh-toggle-slider" />
                    </label>
                    <div className="dsh-platform-row-actions">
                      <button
                        className="dsh-agent-btn dsh-agent-btn--settings"
                        onClick={() => testPlatformHandler(p)}
                        disabled={testingPlatformId === p.id}
                      >
                        {testingPlatformId === p.id ? (<><span className="dsh-spinner" /> {t.testing}</>) : `🧪 ${t.testConnection}`}
                      </button>
                      <button className="dsh-agent-btn dsh-agent-btn--settings" onClick={() => openEditPlatform(p)}>
                        ✎ {t.edit}
                      </button>
                      <button className="dsh-agent-btn dsh-agent-btn--pause" onClick={() => deletePlatformHandler(p)}>
                        🗑 {t.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'usersettings' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>⚙️ Settings</h2>
            </div>

            <div className="dsh-user-settings">
              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">👤 Profile</h3>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Display Name</div>
                  <input
                    className="dsh-input dsh-platform-form-input"
                    value={settingsDraft.displayName}
                    placeholder="Your name"
                    onChange={e => setSettingsDraft(s => ({ ...s, displayName: e.target.value }))}
                  />
                </div>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Email</div>
                  <input
                    type="email"
                    className="dsh-input dsh-platform-form-input"
                    value={settingsDraft.email}
                    placeholder="you@example.com"
                    onChange={e => setSettingsDraft(s => ({ ...s, email: e.target.value }))}
                  />
                </div>
              </div>

              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">🎨 Appearance</h3>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-item">
                    <div className="dsh-settings-item-text">
                      <div className="dsh-settings-item-name">Dark Mode</div>
                      <div className="dsh-settings-item-desc">Switch between dark and light theme</div>
                    </div>
                    <label className="dsh-toggle">
                      <input
                        type="checkbox"
                        checked={settingsDraft.theme === 'dark'}
                        onChange={e => setSettingsDraft(s => ({ ...s, theme: e.target.checked ? 'dark' : 'light' }))}
                      />
                      <span className="dsh-toggle-slider" />
                    </label>
                  </div>
                </div>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Accent Color</div>
                  <div className="dsh-accent-swatches">
                    {ACCENT_PRESETS.map(preset => (
                      <button
                        key={preset.color}
                        type="button"
                        className={`dsh-accent-swatch ${settingsDraft.accentColor === preset.color ? 'dsh-accent-swatch--active' : ''}`}
                        style={{ background: preset.color }}
                        title={preset.name}
                        onClick={() => setSettingsDraft(s => ({ ...s, accentColor: preset.color }))}
                      />
                    ))}
                    <input
                      type="color"
                      className="dsh-accent-custom"
                      value={settingsDraft.accentColor}
                      title="Custom color"
                      onChange={e => setSettingsDraft(s => ({ ...s, accentColor: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">📊 Dashboard</h3>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Default Page on Login</div>
                  <select
                    className="dsh-settings-select"
                    value={settingsDraft.defaultPage}
                    onChange={e => setSettingsDraft(s => ({ ...s, defaultPage: e.target.value }))}
                  >
                    {DEFAULT_PAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Auto-Refresh Interval</div>
                  <select
                    className="dsh-settings-select"
                    value={settingsDraft.autoRefreshInterval}
                    onChange={e => setSettingsDraft(s => ({ ...s, autoRefreshInterval: Number(e.target.value) }))}
                  >
                    {AUTO_REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">📦 Products</h3>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Default Search Platforms</div>
                  <div className="dsh-platform-checks">
                    {RESEARCH_PLATFORMS.map(p => (
                      <label key={p.id} className="dsh-platform-check">
                        <input
                          type="checkbox"
                          checked={settingsDraft.defaultPlatforms.includes(p.id)}
                          onChange={() => setSettingsDraft(s => ({
                            ...s,
                            defaultPlatforms: s.defaultPlatforms.includes(p.id)
                              ? s.defaultPlatforms.filter(x => x !== p.id)
                              : [...s.defaultPlatforms, p.id],
                          }))}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Default Max Results</div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="dsh-input dsh-filter-num"
                    value={settingsDraft.defaultMaxResults}
                    onChange={e => setSettingsDraft(s => ({
                      ...s,
                      defaultMaxResults: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                    }))}
                  />
                </div>
              </div>
            </div>

            <div className="dsh-settings-actions dsh-user-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={saveSettings}>✓ Save Settings</button>
              <button className="dsh-btn dsh-btn--ghost" onClick={resetSettingsDraft}>↺ Reset to Defaults</button>
            </div>
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
            <div className="dsh-section-head">
              <h2>📊 Performance Analytics</h2>
              <button className="dsh-btn dsh-btn--ghost" onClick={generateReport} disabled={reportLoading}>
                {reportLoading ? (<><span className="dsh-spinner" /> Generating...</>) : '📄 Generate Report'}
              </button>
            </div>

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

      {productModal && (
        <ProductDetailModal
          product={productModal.product}
          onClose={closeProductModal}
          onAddToShop={productModal.mode === 'research' ? confirmAddToShop : undefined}
          adding={addingProduct}
          closing={productModalClosing}
          onAnalyze={analyzeProductWithAi}
          analyzing={aiAnalyzing}
          analysis={aiAnalysis}
          analysisError={aiAnalysisError}
          onApplyDescription={aiAnalysis?.description ? applyAiDescription : undefined}
          onPriceThis={productModal.mode === 'saved' ? () => { closeProductModal(); goToPricingFor(productModal.product); } : undefined}
        />
      )}

      {priceHistoryModal && (
        <PriceHistoryModal
          modal={priceHistoryModal}
          loading={priceHistoryLoading}
          onClose={() => setPriceHistoryModal(null)}
        />
      )}

      {pricingHistoryModal && (
        <PricingHistoryModal
          modal={pricingHistoryModal}
          loading={pricingHistoryLoading}
          onClose={() => setPricingHistoryModal(null)}
          onExport={exportPricingHistory}
        />
      )}

      {editingPlatform && (
        <div className="dsh-modal-back" onClick={closePlatformModal}>
          <div className="dsh-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingPlatform === 'new' ? t.addPlatform : `${t.edit}: ${editingPlatform.name}`}</h3>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">{t.platformName}</div>
              <input
                className="dsh-input dsh-platform-form-input"
                value={platformForm.name}
                onChange={e => setPlatformForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">{t.platformUrl}</div>
              <input
                className="dsh-input dsh-platform-form-input"
                value={platformForm.url}
                onChange={e => setPlatformForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>

            <div className="dsh-settings-section">
              <div className="dsh-settings-item">
                <div className="dsh-settings-item-text">
                  <div className="dsh-settings-item-name">{t.active}</div>
                  <div className="dsh-settings-item-desc">Only active platforms are searched</div>
                </div>
                <label className="dsh-toggle">
                  <input
                    type="checkbox"
                    checked={platformForm.is_active}
                    onChange={e => setPlatformForm(f => ({ ...f, is_active: e.target.checked }))}
                  />
                  <span className="dsh-toggle-slider" />
                </label>
              </div>
            </div>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">{t.advancedConfig}</div>
              <textarea
                className="dsh-input dsh-platform-config-textarea"
                spellCheck={false}
                value={platformForm.configText}
                onChange={e => setPlatformForm(f => ({ ...f, configText: e.target.value }))}
              />
            </div>

            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={savePlatform} disabled={savingPlatform}>
                {savingPlatform ? (<><span className="dsh-spinner" /> Saving...</>) : `✓ ${t.save}`}
              </button>
              <button className="dsh-btn dsh-btn--ghost" onClick={closePlatformModal} disabled={savingPlatform}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportModalOpen && (
        <div className="dsh-modal-back" onClick={() => setExportModalOpen(false)}>
          <div className="dsh-modal dsh-export-modal" onClick={e => e.stopPropagation()}>
            <h3>⬇ Export Products</h3>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">Format</div>
              <div className="dsh-export-format-picker">
                {['csv', 'json'].map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    className={`dsh-btn ${exportForm.format === fmt ? 'dsh-btn--primary' : 'dsh-btn--ghost'}`}
                    onClick={() => setExportForm(f => ({ ...f, format: fmt }))}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">Columns</div>
              <div className="dsh-export-columns">
                {EXPORT_COLUMNS.map(col => (
                  <label key={col.key} className="dsh-platform-check">
                    <input
                      type="checkbox"
                      checked={exportForm.columns.includes(col.key)}
                      onChange={() => setExportForm(f => ({
                        ...f,
                        columns: f.columns.includes(col.key)
                          ? f.columns.filter(k => k !== col.key)
                          : [...f.columns, col.key],
                      }))}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="dsh-settings-section">
              <div className="dsh-settings-label">Date Added Range (optional)</div>
              <div className="dsh-export-date-range">
                <input
                  type="date"
                  className="dsh-input"
                  value={exportForm.dateFrom}
                  onChange={e => setExportForm(f => ({ ...f, dateFrom: e.target.value }))}
                />
                <span className="dsh-filter-dash">to</span>
                <input
                  type="date"
                  className="dsh-input"
                  value={exportForm.dateTo}
                  onChange={e => setExportForm(f => ({ ...f, dateTo: e.target.value }))}
                />
              </div>
            </div>

            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={runProductExport}>⬇ Export</button>
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setExportModalOpen(false)}>{t.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {reportModal && (
        <div className="dsh-modal-back" onClick={() => setReportModal(null)}>
          <div className="dsh-modal dsh-report-modal" onClick={e => e.stopPropagation()}>
            <div className="dsh-report-printable">
              <div className="dsh-report-header">
                <div className="dsh-report-title">
                  <span className="dsh-logo-mark">◆</span> Nexus Performance Report
                </div>
                <div className="dsh-report-date">Generated {new Date(reportModal.generatedAt).toLocaleString()}</div>
              </div>

              <div className="dsh-report-stats">
                <div className="dsh-report-stat">
                  <span className="dsh-ai-label">Total Products</span>
                  <span className="dsh-ai-value">{reportModal.totalProducts}</span>
                </div>
                <div className="dsh-report-stat">
                  <span className="dsh-ai-label">Average Price</span>
                  <span className="dsh-ai-value">${reportModal.avgPrice.toFixed(2)}</span>
                </div>
                <div className="dsh-report-stat">
                  <span className="dsh-ai-label">Platforms Used</span>
                  <span className="dsh-ai-value">{Object.keys(reportModal.platformCounts).length}</span>
                </div>
              </div>

              <h4 className="dsh-report-section-title">Platform Distribution</h4>
              {Object.keys(reportModal.platformCounts).length === 0 ? (
                <p className="dsh-product-detail-desc">No saved products yet.</p>
              ) : (
                <div className="dsh-report-platform-list">
                  {Object.entries(reportModal.platformCounts).map(([platform, count]) => (
                    <div key={platform} className="dsh-report-platform-row">
                      <span className="dsh-report-platform-name">{platform}</span>
                      <div className="dsh-report-platform-bar">
                        <div
                          className="dsh-report-platform-bar-fill"
                          style={{ width: `${(count / reportModal.totalProducts) * 100}%` }}
                        />
                      </div>
                      <span className="dsh-report-platform-count">{count}</span>
                    </div>
                  ))}
                </div>
              )}

              <h4 className="dsh-report-section-title">Recent Activity</h4>
              {reportModal.recentActivity.length === 0 ? (
                <p className="dsh-product-detail-desc">No recent activity recorded.</p>
              ) : (
                <div className="dsh-report-activity-list">
                  {reportModal.recentActivity.map(n => (
                    <div key={n.id} className="dsh-report-activity-row">
                      <span>{NOTIF_ICONS[n.type] || 'ℹ'}</span>
                      <span className="dsh-report-activity-message">{n.message}</span>
                      <span className="dsh-report-activity-time">{formatRelativeTime(n.time)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dsh-settings-actions dsh-report-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={() => window.print()}>🖨 Print</button>
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setReportModal(null)}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {shortcutsModalOpen && (
        <div className="dsh-modal-back" onClick={() => setShortcutsModalOpen(false)}>
          <div className="dsh-modal dsh-shortcuts-modal" onClick={e => e.stopPropagation()}>
            <h3>⌨️ Keyboard Shortcuts</h3>
            <div className="dsh-shortcuts-list">
              {KEYBOARD_SHORTCUTS.map(s => (
                <div key={s.keys} className="dsh-shortcut-row">
                  <kbd className="dsh-shortcut-keys">{s.keys}</kbd>
                  <span>{s.description}</span>
                </div>
              ))}
            </div>
            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setShortcutsModalOpen(false)}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {logoutConfirmOpen && (
        <div className="dsh-modal-back" onClick={() => setLogoutConfirmOpen(false)}>
          <div className="dsh-modal dsh-logout-modal" onClick={e => e.stopPropagation()}>
            <h3>⏻ Log Out</h3>
            <p className="dsh-logout-text">Are you sure you want to log out of Nexus?</p>
            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setLogoutConfirmOpen(false)}>Cancel</button>
              <button className="dsh-btn dsh-btn--danger" onClick={onLogout}>⏻ Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;