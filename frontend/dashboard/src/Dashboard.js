import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { authFetch } from './api';

const API_URL = 'http://localhost:5000/api';
const RESEARCH_API_URL = 'http://127.0.0.1:8000/api';

const RESEARCH_PLATFORMS = [
  { id: 'aliexpress', label: 'AliExpress' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'ebay', label: 'eBay' },
];

// Built-in platforms are checked by default in "Specific Stores" mode; any other
// registered platform (custom ones like Alibaba/Etsy/Others a user adds via the
// Platforms page) shows up unchecked/optional.
const DEFAULT_CHECKED_PLATFORMS = ['aliexpress', 'amazon', 'ebay'];
const PLATFORM_LABELS = RESEARCH_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.id]: p.label }), {});
const platformLabel = (name) => PLATFORM_LABELS[name] || (name.charAt(0).toUpperCase() + name.slice(1));

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
  defaultMaxResults: 200,
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
  { value: 'research', label: 'Products Research' },
  { value: 'products', label: 'Product Management' },
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
  { key: 'supplier_price', label: 'Supplier Price' },
  { key: 'selling_price', label: 'Selling Price' },
  { key: 'currency', label: 'Currency' },
  { key: 'platform', label: 'Platform' },
  { key: 'category', label: 'Category' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'stock_status', label: 'Stock Status' },
  { key: 'status', label: 'Status' },
  { key: 'rating', label: 'Rating' },
  { key: 'updated_at', label: 'Last Updated' },
];

const KEYBOARD_SHORTCUTS = [
  { keys: 'Ctrl + K', description: 'Focus product search' },
  { keys: 'Ctrl + D', description: 'Go to Dashboard' },
  { keys: 'Ctrl + P', description: 'Go to Product Management' },
  { keys: 'Esc', description: 'Close any open modal' },
  { keys: '?', description: 'Show this shortcuts panel' },
];

const STRATEGY_LABELS = { budget: 'Budget', mid: 'Mid-Range', premium: 'Premium', aggressive: 'Aggressive', custom: 'Custom' };

const INVENTORY_STATUS_LABELS = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock',
  overstocked: 'Overstocked',
};

const INVENTORY_STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'in-stock', label: 'In Stock' },
  { value: 'low-stock', label: 'Low Stock' },
  { value: 'out-of-stock', label: 'Out of Stock' },
  { value: 'overstocked', label: 'Overstocked' },
];

const STOCK_UPDATE_REASONS = ['restock', 'sale', 'correction', 'damaged', 'return'];

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
    backendOffline: 'Backend Offline', logout: 'Logout', manager: 'Manager',
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

// Shared plan-comparison card grid — used by both the "limit reached" upgrade modal and the
// standalone "Compare Plans" modal, so pricing/first-month-discount presentation only lives
// in one place.
const PlanCards = ({ plans, currentPlanKey, onSelect }) => (
  <div className="dsh-plans-grid">
    {plans.map(p => {
      const isCurrent = p.key === currentPlanKey;
      return (
        <div key={p.key} className={`dsh-plan-card ${isCurrent ? 'dsh-plan-card--current' : ''}`}>
          <div className="dsh-plan-card-name">{p.name}</div>
          {p.monthly_price > 0 ? (
            <div className="dsh-plan-card-price">${p.monthly_price.toFixed(2)}<small>/mo</small></div>
          ) : (
            <div className="dsh-plan-card-price">Free</div>
          )}
          {p.first_month_price > 0 && p.first_month_price < p.monthly_price && (
            <div className="dsh-plan-card-first-month">${p.first_month_price.toFixed(2)} first month!</div>
          )}
          <div className="dsh-plan-card-desc">{p.description}</div>
          <div className="dsh-plan-card-limit">
            {p.max_products_per_month === null ? 'Unlimited' : p.max_products_per_month} products/month
          </div>
          {!isCurrent && (
            <button className="dsh-btn dsh-btn--primary" onClick={() => onSelect(p.key)}>
              {p.monthly_price > 0 ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
            </button>
          )}
          {isCurrent && <span className="dsh-badge">Current plan</span>}
        </div>
      );
    })}
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

const ProductDetailModal = ({ product, onClose, onAnalyzeAndSave, analyzing, closing }) => {
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

        <div className="dsh-settings-actions">
          <button className="dsh-btn dsh-btn--primary" onClick={onAnalyzeAndSave} disabled={analyzing}>
            {analyzing ? (<><span className="dsh-spinner" /> Analyzing (pricing + inventory + marketing)...</>) : '✨ Analyze & Save'}
          </button>
          <button className="dsh-btn dsh-btn--ghost" onClick={onClose} disabled={analyzing}>Close</button>
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
  const [, setLogs] = useState([]);
  const [backendUp, setBackendUp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  const [billingPlans, setBillingPlans] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminHealth, setAdminHealth] = useState(null);
  const [adminLogs, setAdminLogs] = useState([]);
  const [notifBellOpen, setNotifBellOpen] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toastId = useRef(0);
  const researchInputRef = useRef(null);

  const [notifications, setNotifications] = useState(loadNotifications);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // ── Product Management: raw multi-platform search (left panel "Search New" sub-mode) ──
  const [researchQuery, setResearchQuery] = useState('');
  // 'all' = search every active registered platform ("search entire web"); 'custom' = only
  // the checked stores below. Both are remembered in localStorage as a user preference.
  const [researchScope, setResearchScope] = useState(() => localStorage.getItem('dsh-research-scope') || 'all');
  const [researchPlatforms, setResearchPlatforms] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dsh-research-platforms') || 'null');
      if (saved && typeof saved === 'object') return saved;
    } catch { /* fall through to defaults */ }
    const defaults = loadSettings().defaultPlatforms || DEFAULT_CHECKED_PLATFORMS;
    return RESEARCH_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.id]: defaults.includes(p.id) }), {});
  });
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSearched, setResearchSearched] = useState(false);
  const [researchResults, setResearchResults] = useState([]);
  const [researchError, setResearchError] = useState(null);
  // Per-platform errors from the last search response (e.g. "amazon: Platform is inactive") —
  // surfaced inline instead of a generic "No Products Found" when they're the reason for 0 results.
  const [researchApiErrors, setResearchApiErrors] = useState({});
  const [researchPage, setResearchPage] = useState(1);
  const [researchPageSize, setResearchPageSize] = useState(50);
  const [researchTotalPages, setResearchTotalPages] = useState(1);
  const [researchTotalResults, setResearchTotalResults] = useState(0);
  const [researchPageInput, setResearchPageInput] = useState('1');
  const [productModal, setProductModal] = useState(null);
  const [productModalClosing, setProductModalClosing] = useState(false);
  const [analyzingProduct, setAnalyzingProduct] = useState(false);

  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Product Management: left panel — saved products ──
  const [leftPanelMode, setLeftPanelMode] = useState('saved');
  const [savedProducts, setSavedProducts] = useState([]);
  const [savedProductsTotal, setSavedProductsTotal] = useState(0);
  const [savedProductsLoading, setSavedProductsLoading] = useState(true);
  const [savedSearchText, setSavedSearchText] = useState('');
  const [savedStatusFilter, setSavedStatusFilter] = useState('');
  const [savedStockStatusFilter, setSavedStockStatusFilter] = useState('');
  const [savedCategoryFilter, setSavedCategoryFilter] = useState('');
  const [savedSortBy, setSavedSortBy] = useState('');
  const [savedSortDir, setSavedSortDir] = useState('desc');
  const [selectedProductIds, setSelectedProductIds] = useState({});
  const [bulkActionRunning, setBulkActionRunning] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);

  // ── Product Management: right panel — selected product + tabs ──
  const [selectedManagedProduct, setSelectedManagedProduct] = useState(null);
  const [selectedProductLoading, setSelectedProductLoading] = useState(false);
  const [managementTab, setManagementTab] = useState('details');
  const [detailsForm, setDetailsForm] = useState({ name: '', description: '', category: '', status: 'active', reorderLevel: '' });
  const [savingDetails, setSavingDetails] = useState(false);

  const [pricingEditPrice, setPricingEditPrice] = useState('');
  const [pricingStrategySelection, setPricingStrategySelection] = useState('mid');
  const [savingPricing, setSavingPricing] = useState(false);

  const [inventoryDelta, setInventoryDelta] = useState('');
  const [inventoryReason, setInventoryReason] = useState('restock');
  const [savingInventoryChange, setSavingInventoryChange] = useState(false);

  const [tabRecommendation, setTabRecommendation] = useState(null);
  const [tabRecommendationLoading, setTabRecommendationLoading] = useState(false);

  const [bulkStockModalOpen, setBulkStockModalOpen] = useState(false);
  const [bulkStockDelta, setBulkStockDelta] = useState('');
  const [bulkStockReason, setBulkStockReason] = useState('correction');
  const [bulkStockSaving, setBulkStockSaving] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState('active');
  const [bulkPricingStrategy, setBulkPricingStrategy] = useState('mid');

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportForm, setExportForm] = useState({
    format: 'csv', columns: EXPORT_COLUMNS.map(c => c.key), dateFrom: '', dateTo: '',
  });

  // ── Shopify Sync ──
  const [shopifyStatus, setShopifyStatus] = useState(null);
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [shopifyStats, setShopifyStats] = useState(null);
  const [shopifySyncLog, setShopifySyncLog] = useState([]);
  const [shopifySyncing, setShopifySyncing] = useState(false);
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [schedulerLog, setSchedulerLog] = useState([]);
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [schedulerForm, setSchedulerForm] = useState({
    interval_hours: 24, seed_keywords: '', platforms: { aliexpress: true, amazon: true, ebay: true },
    pricing_strategy: 'mid', margin_threshold: 30, max_candidates_per_keyword: 3, category_blacklist: '',
  });

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

  // Gates a search/analyze action behind the user's monthly plan limit. Returns true if the
  // action may proceed (and has already been counted); on a 403 LIMIT_REACHED, re-fetches
  // /user/usage for display data and opens the upgrade modal instead.
  const checkAndIncrementUsage = useCallback(async (actionType) => {
    try {
      await authFetch(API_URL, '/user/usage/increment', { method: 'POST', body: JSON.stringify({ actionType }) });
      return true;
    } catch {
      const status = await authFetch(API_URL, '/user/usage').catch(() => null);
      setUsageInfo(status);
      authFetch(API_URL, '/plans').then(d => setBillingPlans(d.plans || [])).catch(() => {});
      setUpgradeModalOpen(true);
      return false;
    }
  }, []);

  // Self-service plan switch — determines and records the correct charge ($5 first month,
  // full price after) server-side; no real payment is processed until Stripe has real keys
  // (matches the rest of this app's payment scaffold), so this always resolves immediately
  // rather than redirecting anywhere.
  const changePlan = useCallback(async (planKey) => {
    try {
      const data = await authFetch(API_URL, '/user/change-plan', {
        method: 'POST',
        body: JSON.stringify({ planKey }),
      });
      showToast(data.message, data.chargeAmount > 0 ? 'info' : 'success');
      const status = await authFetch(API_URL, '/user/usage').catch(() => null);
      setUsageInfo(status);
      setUpgradeModalOpen(false);
      setPlansModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Could not change plan', 'error');
    }
  }, [showToast]);

  useEffect(() => { if (page === 'usersettings') setSettingsDraft(appSettings); }, [page, appSettings]);

  useEffect(() => {
    if (page !== 'usersettings') return;
    authFetch(API_URL, '/user/usage').then(setUsageInfo).catch(() => {});
    authFetch(API_URL, '/plans').then(d => setBillingPlans(d.plans || [])).catch(() => {});
    authFetch(API_URL, '/webhooks').then(d => setWebhooks(d.webhooks || [])).catch(() => {});
  }, [page]);

  const loadAdminData = useCallback(() => {
    authFetch(API_URL, '/admin/users').then(d => setAdminUsers(d.users || [])).catch(() => {});
    authFetch(API_URL, '/admin/stats').then(setAdminStats).catch(() => {});
    authFetch(API_URL, '/admin/health').then(setAdminHealth).catch(() => {});
    authFetch(API_URL, '/admin/logs').then(d => setAdminLogs(d.logs || [])).catch(() => {});
    authFetch(API_URL, '/plans').then(d => setBillingPlans(d.plans || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (page !== 'admin') return;
    loadAdminData();
  }, [page, loadAdminData]);

  const addWebhook = useCallback(async () => {
    if (!newWebhookUrl.trim()) return;
    try {
      await authFetch(API_URL, '/webhooks', { method: 'POST', body: JSON.stringify({ url: newWebhookUrl.trim() }) });
      const d = await authFetch(API_URL, '/webhooks');
      setWebhooks(d.webhooks || []);
      setNewWebhookUrl('');
      showToast('Webhook registered', 'success');
    } catch (err) {
      showToast(err.message || 'Could not register webhook', 'error');
    }
  }, [newWebhookUrl, showToast]);

  const deleteWebhook = useCallback(async (id) => {
    try {
      await authFetch(API_URL, `/webhooks/${id}`, { method: 'DELETE' });
      setWebhooks(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      showToast(err.message || 'Could not delete webhook', 'error');
    }
  }, [showToast]);

  const adminSetUserPlan = useCallback(async (userId, planKey) => {
    try {
      await authFetch(API_URL, `/admin/users/${userId}/plan`, { method: 'PUT', body: JSON.stringify({ planKey }) });
      showToast('Plan updated', 'success');
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Could not update plan', 'error');
    }
  }, [showToast, loadAdminData]);

  const adminDeleteUser = useCallback(async (userId) => {
    try {
      await authFetch(API_URL, `/admin/users/${userId}`, { method: 'DELETE' });
      showToast('User deleted', 'success');
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Could not delete user', 'error');
    }
  }, [showToast, loadAdminData]);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      localStorage.setItem('dsh-notifications', JSON.stringify(next));
      return next;
    });
  }, []);

  const unreadNotifCount = notifications.filter(n => !n.read).length;

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
      const [aRes, tRes, lRes] = await Promise.allSettled([
        authFetch(API_URL, '/agents'),
        authFetch(API_URL, '/tasks'),
        authFetch(API_URL, '/logs'),
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

  // Cross-service bridge: the FastAPI competitor tracker can't push into React state
  // directly, so this polls its alerts endpoint the same way fetchAll polls the Express
  // mock endpoints, surfaces each new alert into the existing notification bell, then
  // immediately acks it so it doesn't reappear on the next cycle.
  //
  // seenAlertIds guards against double-notifying the same alert: the ack round-trip isn't
  // instantaneous, so a fast poll (or React StrictMode's dev-only double-effect-invoke) can
  // fetch the same still-unacknowledged alert twice before the first ack lands.
  const seenAlertIds = useRef(new Set());
  useEffect(() => {
    const pollCompetitorAlerts = async () => {
      try {
        const alerts = await fetch(`${RESEARCH_API_URL}/competitor/alerts`).then(r => r.json());
        const freshAlerts = alerts.filter(a => !seenAlertIds.current.has(a.id));
        freshAlerts.forEach(a => {
          seenAlertIds.current.add(a.id);
          addNotification(
            'warning',
            `Competitor price ${a.change_percent > 0 ? 'increased' : 'dropped'} ${Math.abs(a.change_percent)}% (product #${a.product_id})`
          );
        });
        await Promise.all(freshAlerts.map(a => fetch(`${RESEARCH_API_URL}/competitor/alerts/${a.id}/ack`, { method: 'POST' })));
      } catch {
        // FastAPI unreachable — silently skip this cycle, same tolerance as fetchAll.
      }
    };
    pollCompetitorAlerts();
    const iv = setInterval(pollCompetitorAlerts, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [addNotification]);

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

  const selectedProductCount = Object.keys(selectedProductIds).length;
  const allSavedSelected = savedProducts.length > 0 && savedProducts.every(p => selectedProductIds[p.id]);

  const toggleSelectAllSaved = () => {
    setSelectedProductIds(prev => {
      const next = { ...prev };
      savedProducts.forEach(p => {
        if (allSavedSelected) delete next[p.id]; else next[p.id] = true;
      });
      return next;
    });
  };

  const savedCategories = [...new Set(savedProducts.map(p => p.category).filter(Boolean))];

  // Checkbox options for "Specific Stores" mode: every active registered platform (built-in
  // AliExpress/Amazon/eBay plus any custom store — Alibaba, Etsy, others — the user has added
  // via the Platforms page), falling back to the 3 built-ins before that list has loaded.
  const researchStoreOptions = platforms.length > 0
    ? platforms.filter(p => p.is_active).map(p => ({ id: p.name, label: platformLabel(p.name) }))
    : RESEARCH_PLATFORMS;

  const runResearchSearch = useCallback(async (pageToFetch, pageSizeToUse) => {
    if (!researchQuery.trim()) return;
    const storeOptions = platforms.length > 0
      ? platforms.filter(p => p.is_active).map(p => p.name)
      : RESEARCH_PLATFORMS.map(p => p.id);
    const selectedPlatforms = storeOptions.filter(name => researchPlatforms[name]);
    if (researchScope === 'custom' && selectedPlatforms.length === 0) {
      showToast(t.selectPlatform, 'warning');
      return;
    }
    if (!(await checkAndIncrementUsage('search'))) return;

    setResearchLoading(true);
    setResearchError(null);
    setResearchApiErrors({});
    setResearchSearched(true);

    const requestBody = {
      query: researchQuery.trim(),
      search_scope: researchScope,
      platforms: selectedPlatforms,
      max_results: appSettings.defaultMaxResults,
      page: pageToFetch,
      page_size: pageSizeToUse,
      sort_by: sortBy || null,
      min_price: priceMin !== '' ? Number(priceMin) : null,
      max_price: priceMax !== '' ? Number(priceMax) : null,
      min_rating: minRating > 0 ? minRating : null,
      in_stock_only: inStockOnly,
    };

    try {
      const res = await fetch(`${RESEARCH_API_URL}/search-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          detail = errBody.detail || detail;
        } catch { /* response body wasn't JSON */ }
        console.error('[Products Research] search-products failed', { status: res.status, detail, requestBody });
        throw new Error(detail);
      }
      const data = await res.json();
      const results = data.results || [];
      const errors = data.errors || {};
      setResearchResults(results);
      setResearchApiErrors(errors);
      setResearchPage(data.current_page || 1);
      setResearchTotalPages(data.total_pages || 1);
      setResearchTotalResults(data.total_results || 0);
      setResearchPageInput(String(data.current_page || 1));
      if (Object.keys(errors).length > 0) {
        console.warn('[Products Research] per-platform search errors', errors);
      }
      if (results.length === 0) showToast(t.noProductsFound, 'info');
      const failedPlatforms = Object.keys(errors);
      if (failedPlatforms.length > 0) {
        addNotification('error', `Search failed on ${failedPlatforms.join(', ')}: ${errors[failedPlatforms[0]]}`);
      }
    } catch (err) {
      console.error('[Products Research] search-products request threw', err, { requestBody });
      setResearchError(err.message || t.reachFailed);
      setResearchResults([]);
      setResearchTotalPages(1);
      setResearchTotalResults(0);
      showToast(t.reachFailed, 'error');
      addNotification('error', `Product search failed for "${researchQuery.trim()}"`);
    } finally {
      setResearchLoading(false);
    }
  }, [researchQuery, researchPlatforms, researchScope, platforms, showToast, t, appSettings.defaultMaxResults, addNotification, sortBy, priceMin, priceMax, minRating, inStockOnly]);

  const searchResearchProducts = useCallback(() => {
    runResearchSearch(1, researchPageSize);
  }, [runResearchSearch, researchPageSize]);

  const goToResearchPage = useCallback((targetPage) => {
    const clamped = Math.max(1, Math.min(targetPage, researchTotalPages));
    if (clamped === researchPage || researchLoading) return;
    runResearchSearch(clamped, researchPageSize);
  }, [runResearchSearch, researchTotalPages, researchPage, researchPageSize, researchLoading]);

  const changeResearchPageSize = useCallback((newSize) => {
    setResearchPageSize(newSize);
    if (researchSearched) runResearchSearch(1, newSize);
  }, [runResearchSearch, researchSearched]);

  const openProductModal = (product, mode) => {
    setProductModal({ product, mode });
  };

  const closeProductModal = useCallback(() => {
    if (analyzingProduct) return;
    setProductModalClosing(true);
    setTimeout(() => {
      setProductModal(null);
      setProductModalClosing(false);
    }, 200);
  }, [analyzingProduct]);

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

  // Persist the "search entire web" vs "specific stores" choice, and which stores are
  // checked, so it survives a page reload.
  useEffect(() => { localStorage.setItem('dsh-research-scope', researchScope); }, [researchScope]);
  useEffect(() => {
    localStorage.setItem('dsh-research-platforms', JSON.stringify(researchPlatforms));
  }, [researchPlatforms]);

  // Whenever the registered-platforms list loads (or a custom platform is added), make
  // sure it has a checkbox entry — unchecked by default unless it's one of the built-ins.
  useEffect(() => {
    setResearchPlatforms(prev => {
      let changed = false;
      const next = { ...prev };
      for (const p of platforms) {
        if (!(p.name in next)) {
          next[p.name] = DEFAULT_CHECKED_PLATFORMS.includes(p.name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [platforms]);

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

  const fetchSavedProducts = useCallback(async () => {
    setSavedProductsLoading(true);
    try {
      const params = new URLSearchParams();
      if (savedSearchText.trim()) params.set('search', savedSearchText.trim());
      if (savedStatusFilter) params.set('status', savedStatusFilter);
      if (savedStockStatusFilter) params.set('stock_status', savedStockStatusFilter);
      if (savedCategoryFilter) params.set('category', savedCategoryFilter);
      if (savedSortBy) {
        params.set('sort_by', savedSortBy);
        params.set('sort_dir', savedSortDir);
      }
      const res = await fetch(`${RESEARCH_API_URL}/manager/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSavedProducts(data.products || []);
      setSavedProductsTotal(data.total || 0);
    } catch {
      setSavedProducts([]);
      showToast('Could not load saved products', 'error');
    } finally {
      setSavedProductsLoading(false);
    }
  }, [savedSearchText, savedStatusFilter, savedStockStatusFilter, savedCategoryFilter, savedSortBy, savedSortDir, showToast]);

  const fetchDashboardStats = useCallback(async () => {
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDashboardStats(await res.json());
    } catch {
      setDashboardStats(null);
    }
  }, []);

  useEffect(() => {
    if (page !== 'products') return;
    fetchSavedProducts();
    fetchDashboardStats();
  }, [page, fetchSavedProducts, fetchDashboardStats]);

  const analyzeAndSaveProduct = useCallback(async () => {
    if (!productModal?.product) return;
    const p = productModal.product;
    if (p.price == null) {
      showToast('This product has no price — cannot analyze it', 'warning');
      return;
    }
    if (!(await checkAndIncrementUsage('analyze'))) return;
    setAnalyzingProduct(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/analyze-product`, {
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
          sku: p.sku,
          platform: p.platform,
          raw_data: p.raw_data || {},
          search_query: researchQuery.trim() || null,
          initial_quantity: 0,
          reorder_level: 10,
          strategy: 'mid',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      showToast(`"${p.name}" analyzed and saved`, 'success');
      addNotification('success', `Saved "${p.name}" — priced at ${data.currency} ${Number(data.selling_price).toFixed(2)}`);
      setResearchResults(prev => prev.map(item => (item === p ? { ...item, _added: true } : item)));
      closeProductModal();
      fetchSavedProducts();
      fetchDashboardStats();
    } catch (err) {
      showToast(err.message || 'Could not analyze this product', 'error');
    } finally {
      setAnalyzingProduct(false);
    }
  }, [productModal, showToast, closeProductModal, addNotification, researchQuery, fetchSavedProducts, fetchDashboardStats]);

  const toggleProductSelected = (id) => {
    setSelectedProductIds(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  const openManagedProduct = useCallback(async (id) => {
    setSelectedProductLoading(true);
    setManagementTab('details');
    setTabRecommendation(null);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/product/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelectedManagedProduct(data);
      setDetailsForm({
        name: data.name || '', description: data.description || '', category: data.category || '',
        status: data.status || 'active', reorderLevel: String(data.reorder_level ?? ''),
      });
      setPricingEditPrice(data.selling_price != null ? String(data.selling_price) : '');
      setPricingStrategySelection(data.pricing?.strategy && data.pricing.strategy !== 'manual' ? data.pricing.strategy : 'mid');
      setInventoryDelta('');
      setInventoryReason('restock');
    } catch {
      setSelectedManagedProduct(null);
      showToast('Could not load product details', 'error');
    } finally {
      setSelectedProductLoading(false);
    }
  }, [showToast]);

  const saveDetails = useCallback(async () => {
    if (!selectedManagedProduct) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/product/${selectedManagedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: detailsForm.name,
          description: detailsForm.description,
          category: detailsForm.category,
          status: detailsForm.status,
          reorder_level: detailsForm.reorderLevel !== '' ? Number(detailsForm.reorderLevel) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSelectedManagedProduct(data);
      showToast('Product details saved', 'success');
      fetchSavedProducts();
    } catch (err) {
      showToast(err.message || 'Could not save details', 'error');
    } finally {
      setSavingDetails(false);
    }
  }, [selectedManagedProduct, detailsForm, showToast, fetchSavedProducts]);

  const deleteManagedProduct = useCallback(async (id) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setDeletingProductId(id);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/product/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Product deleted', 'success');
      setSelectedProductIds(prev => { const next = { ...prev }; delete next[id]; return next; });
      setSelectedManagedProduct(prev => (prev?.id === id ? null : prev));
      fetchSavedProducts();
      fetchDashboardStats();
    } catch {
      showToast('Failed to delete product', 'error');
    } finally {
      setDeletingProductId(null);
    }
  }, [showToast, fetchSavedProducts, fetchDashboardStats]);

  const runBulkOperation = useCallback(async (operation, extra = {}) => {
    const ids = Object.keys(selectedProductIds).map(Number);
    if (ids.length === 0) return;
    setBulkActionRunning(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/bulk-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, product_ids: ids, ...extra }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      showToast(
        `${data.updated_count} succeeded${data.failed_count ? `, ${data.failed_count} failed` : ''}`,
        data.failed_count ? 'warning' : 'success'
      );
      setSelectedProductIds({});
      fetchSavedProducts();
      fetchDashboardStats();
    } catch {
      showToast('Bulk operation failed', 'error');
    } finally {
      setBulkActionRunning(false);
    }
  }, [selectedProductIds, showToast, fetchSavedProducts, fetchDashboardStats]);

  const bulkDeleteSelected = useCallback(() => {
    const count = Object.keys(selectedProductIds).length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected product(s)? This cannot be undone.`)) return;
    runBulkOperation('delete');
  }, [selectedProductIds, runBulkOperation]);

  const bulkSetStatus = useCallback(() => {
    runBulkOperation('update_status', { status: bulkStatusValue });
  }, [runBulkOperation, bulkStatusValue]);

  const bulkApplyPricing = useCallback(() => {
    runBulkOperation('apply_pricing', { strategy: bulkPricingStrategy });
  }, [runBulkOperation, bulkPricingStrategy]);

  const bulkRefreshPrice = useCallback(() => {
    runBulkOperation('refresh_price');
  }, [runBulkOperation]);

  const submitBulkStockUpdate = useCallback(async () => {
    const delta = Number(bulkStockDelta);
    if (bulkStockDelta === '' || Number.isNaN(delta) || delta === 0) {
      showToast('Enter a non-zero quantity change', 'warning');
      return;
    }
    setBulkStockSaving(true);
    await runBulkOperation('update_stock', { quantity_change: delta, reason: bulkStockReason });
    setBulkStockSaving(false);
    setBulkStockModalOpen(false);
  }, [bulkStockDelta, bulkStockReason, runBulkOperation, showToast]);

  const applyManualPrice = useCallback(async () => {
    if (!selectedManagedProduct || pricingEditPrice === '') return;
    const priceNum = Number(pricingEditPrice);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      showToast('Enter a valid price', 'warning');
      return;
    }
    setSavingPricing(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/product/${selectedManagedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selling_price: priceNum }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSelectedManagedProduct(data);
      showToast(`Price set to ${data.currency} ${priceNum.toFixed(2)}`, 'success');
      fetchSavedProducts();
    } catch (err) {
      showToast(err.message || 'Could not set price', 'error');
    } finally {
      setSavingPricing(false);
    }
  }, [selectedManagedProduct, pricingEditPrice, showToast, fetchSavedProducts]);

  const applyPricingStrategyToSelected = useCallback(async () => {
    if (!selectedManagedProduct) return;
    setSavingPricing(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/bulk-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'apply_pricing',
          product_ids: [selectedManagedProduct.id],
          strategy: pricingStrategySelection,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const item = data.results?.[0];
      if (!item?.success) throw new Error(item?.message || 'Failed to apply pricing strategy');
      showToast(item.message, 'success');
      openManagedProduct(selectedManagedProduct.id);
      fetchSavedProducts();
    } catch (err) {
      showToast(err.message || 'Could not apply pricing strategy', 'error');
    } finally {
      setSavingPricing(false);
    }
  }, [selectedManagedProduct, pricingStrategySelection, showToast, fetchSavedProducts, openManagedProduct]);

  const adjustInventory = useCallback(async () => {
    if (!selectedManagedProduct || inventoryDelta === '') return;
    const delta = Number(inventoryDelta);
    if (Number.isNaN(delta) || delta === 0) {
      showToast('Enter a non-zero quantity change', 'warning');
      return;
    }
    setSavingInventoryChange(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/product/${selectedManagedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity_change: delta, stock_reason: inventoryReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSelectedManagedProduct(data);
      setInventoryDelta('');
      showToast(`Stock updated — ${data.quantity} on hand`, 'success');
      if (data.stock_status === 'low-stock' || data.stock_status === 'out-of-stock') {
        addNotification('warning', `"${data.name}" is now ${data.stock_status.replace('-', ' ')}`);
      }
      fetchSavedProducts();
      fetchDashboardStats();
    } catch (err) {
      showToast(err.message || 'Could not update stock', 'error');
    } finally {
      setSavingInventoryChange(false);
    }
  }, [selectedManagedProduct, inventoryDelta, inventoryReason, showToast, addNotification, fetchSavedProducts, fetchDashboardStats]);

  const fetchTabRecommendation = useCallback(async (focus) => {
    if (!selectedManagedProduct) return;
    setTabRecommendationLoading(true);
    setTabRecommendation(null);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/ai-recommendation?product_id=${selectedManagedProduct.id}&focus=${focus}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTabRecommendation(await res.json());
    } catch {
      showToast('Could not get an AI recommendation', 'error');
    } finally {
      setTabRecommendationLoading(false);
    }
  }, [selectedManagedProduct, showToast]);

  const fetchShopifyStatus = useCallback(async () => {
    try {
      const res = await fetch(`${RESEARCH_API_URL}/shopify/status`);
      setShopifyStatus(res.ok ? await res.json() : null);
    } catch {
      setShopifyStatus(null);
    }
  }, []);

  const fetchShopifyStats = useCallback(async () => {
    try {
      const res = await fetch(`${RESEARCH_API_URL}/shopify/stats`);
      setShopifyStats(res.ok ? await res.json() : null);
    } catch {
      setShopifyStats(null);
    }
  }, []);

  const fetchShopifySyncLog = useCallback(async () => {
    try {
      const res = await fetch(`${RESEARCH_API_URL}/shopify/sync-log?limit=30`);
      setShopifySyncLog(res.ok ? await res.json() : []);
    } catch {
      setShopifySyncLog([]);
    }
  }, []);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await fetch(`${RESEARCH_API_URL}/scheduler/status`);
      if (!res.ok) return;
      const data = await res.json();
      setSchedulerConfig(data.config);
      setSchedulerLog(data.recent_log || []);
      setSchedulerForm({
        interval_hours: data.config.interval_hours,
        seed_keywords: data.config.seed_keywords.join('\n'),
        platforms: {
          aliexpress: data.config.platforms.includes('aliexpress'),
          amazon: data.config.platforms.includes('amazon'),
          ebay: data.config.platforms.includes('ebay'),
        },
        pricing_strategy: data.config.pricing_strategy,
        margin_threshold: data.config.margin_threshold,
        max_candidates_per_keyword: data.config.max_candidates_per_keyword,
        category_blacklist: data.config.category_blacklist.join('\n'),
      });
    } catch {
      setSchedulerConfig(null);
    }
  }, []);

  const refreshShopifyPage = useCallback(() => {
    fetchShopifyStatus();
    fetchShopifyStats();
    fetchShopifySyncLog();
    fetchSchedulerStatus();
  }, [fetchShopifyStatus, fetchShopifyStats, fetchShopifySyncLog, fetchSchedulerStatus]);

  useEffect(() => {
    if (page !== 'shopify') return;
    refreshShopifyPage();
    if (savedProducts.length === 0) fetchSavedProducts();
  }, [page, refreshShopifyPage, fetchSavedProducts, savedProducts.length]);

  // The header's welcome message shows live stats regardless of which page is open,
  // so load them once at startup rather than only when the Product Management/Shopify
  // Sync tabs are visited.
  useEffect(() => {
    fetchDashboardStats();
    fetchShopifyStats();
    fetchSchedulerStatus();
  }, [fetchDashboardStats, fetchShopifyStats, fetchSchedulerStatus]);

  const connectShopify = useCallback(async () => {
    setShopifyConnecting(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/shopify/connect`, { method: 'POST' });
      const data = await res.json();
      showToast(data.message, data.connected ? 'success' : 'warning');
    } catch {
      showToast('Could not reach the Shopify integration', 'error');
    } finally {
      setShopifyConnecting(false);
      fetchShopifyStatus();
    }
  }, [showToast, fetchShopifyStatus]);

  const syncSelectedToShopify = useCallback(async (publish) => {
    const ids = Object.keys(selectedProductIds).map(Number);
    if (ids.length === 0) {
      showToast('Select at least one product first', 'warning');
      return;
    }
    setShopifySyncing(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/shopify/bulk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_product_ids: ids, publish }),
      });
      const data = await res.json();
      showToast(
        `${data.synced_count} synced${data.failed_count ? `, ${data.failed_count} failed` : ''}`,
        data.failed_count ? 'warning' : 'success'
      );
      addNotification(
        data.failed_count ? 'warning' : 'success',
        `Shopify sync: ${data.synced_count} synced${data.failed_count ? `, ${data.failed_count} failed` : ''}`
      );
    } catch {
      showToast('Bulk sync failed', 'error');
      addNotification('error', 'Shopify bulk sync failed');
    } finally {
      setShopifySyncing(false);
      fetchShopifyStats();
      fetchShopifySyncLog();
    }
  }, [selectedProductIds, showToast, addNotification, fetchShopifyStats, fetchShopifySyncLog]);

  const buildSchedulerPayload = () => ({
    interval_hours: Number(schedulerForm.interval_hours),
    seed_keywords: schedulerForm.seed_keywords.split('\n').map(s => s.trim()).filter(Boolean),
    platforms: Object.entries(schedulerForm.platforms).filter(([, v]) => v).map(([k]) => k),
    pricing_strategy: schedulerForm.pricing_strategy,
    margin_threshold: Number(schedulerForm.margin_threshold),
    max_candidates_per_keyword: Number(schedulerForm.max_candidates_per_keyword),
    category_blacklist: schedulerForm.category_blacklist.split('\n').map(s => s.trim()).filter(Boolean),
  });

  const saveSchedulerConfig = useCallback(async () => {
    setSchedulerSaving(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/scheduler/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSchedulerPayload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      showToast('Schedule settings saved', 'success');
      fetchSchedulerStatus();
    } catch (err) {
      showToast(err.message || 'Could not save schedule settings', 'error');
    } finally {
      setSchedulerSaving(false);
    }
  }, [schedulerForm, showToast, fetchSchedulerStatus]);

  const toggleAutoSync = useCallback(async () => {
    setSchedulerSaving(true);
    const enabling = !schedulerConfig?.enabled;
    try {
      if (enabling) {
        const res = await fetch(`${RESEARCH_API_URL}/scheduler/start-auto-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSchedulerPayload()),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }
        showToast('Auto-sync started', 'success');
        addNotification('success', 'Shopify auto-sync started');
      } else {
        await fetch(`${RESEARCH_API_URL}/scheduler/stop-auto-sync`, { method: 'POST' });
        showToast('Auto-sync stopped', 'info');
      }
      fetchSchedulerStatus();
    } catch (err) {
      showToast(err.message || 'Could not update the schedule', 'error');
    } finally {
      setSchedulerSaving(false);
    }
  }, [schedulerConfig, showToast, fetchSchedulerStatus]);

  const generateReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`${RESEARCH_API_URL}/manager/products?limit=200`);
      const data = res.ok ? await res.json() : { products: [], total: 0 };
      const products = data.products || [];
      const withPrice = products.filter(p => p.selling_price != null);
      const avgPrice = withPrice.length > 0 ? withPrice.reduce((sum, p) => sum + p.selling_price, 0) / withPrice.length : 0;
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
    let rows = savedProducts;
    if (exportForm.dateFrom) {
      const from = new Date(exportForm.dateFrom).getTime();
      rows = rows.filter(p => p.updated_at && new Date(p.updated_at).getTime() >= from);
    }
    if (exportForm.dateTo) {
      const to = new Date(exportForm.dateTo).getTime() + 86400000;
      rows = rows.filter(p => p.updated_at && new Date(p.updated_at).getTime() <= to);
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
      downloadBlob(JSON.stringify(data, null, 2), 'application/json', 'products.json');
    } else {
      const csvRows = [cols.map(c => c.label), ...rows.map(p => cols.map(c => p[c.key] ?? ''))];
      const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      downloadBlob('﻿' + csv, 'text/csv', 'products.csv');
    }

    showToast(`Exported ${rows.length} product(s)`, 'success');
    setExportModalOpen(false);
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

  const displayName = (appSettings.displayName || '').trim() || user?.name || 'there';

  const hourOfDay = new Date().getHours();
  const greeting = hourOfDay >= 6 && hourOfDay < 12
    ? { text: 'Good Morning', emoji: '☀️' }
    : hourOfDay >= 12 && hourOfDay < 18
      ? { text: 'Good Afternoon', emoji: '🌤️' }
      : { text: 'Good Evening', emoji: '🌙' };

  const headerDescription = (() => {
    const parts = [];
    if (dashboardStats) {
      parts.push(`${dashboardStats.total_products} product${dashboardStats.total_products === 1 ? '' : 's'} live`);
    }
    if (dashboardStats && shopifyStats) {
      const readyToSync = Math.max(dashboardStats.total_products - shopifyStats.products_synced, 0);
      if (readyToSync > 0) parts.push(`${readyToSync} ready to sync to Shopify`);
    }
    if (profits.weekly != null) {
      parts.push(`$${profits.weekly.toLocaleString()} in revenue this week`);
    }
    if (parts.length === 0) {
      return "Ready to manage your e-commerce empire? Let's grow your business today.";
    }
    let sentence = `Here's your snapshot: ${parts.join(' • ')}.`;
    if (schedulerConfig?.enabled && schedulerConfig.next_run_at) {
      const hoursUntilNextSync = Math.round((new Date(schedulerConfig.next_run_at).getTime() - Date.now()) / 3600000);
      sentence += ` Next auto-sync in ${hoursUntilNextSync > 0 ? `${hoursUntilNextSync}h` : 'under an hour'}.`;
    }
    return sentence;
  })();

  const NAV = [
    { id: 'dashboard', icon: '◈', label: t.dashboard },
    { id: 'research', icon: '📦', label: t.productsResearch },
    { id: 'products', icon: '🛍️', label: 'Product Management' },
    { id: 'shopify', icon: '🛍️', label: 'Shopify Sync' },
    { id: 'analytics', icon: '📊', label: 'Analytics' },
    { id: 'platforms', icon: '⚙️', label: t.platformSettings },
    { id: 'usersettings', icon: '⚙️', label: 'Settings' },
    ...(user.role === 'admin' ? [{ id: 'admin', icon: '🛡️', label: 'Admin' }] : []),
  ];

  const closeAnyModal = useCallback(() => {
    if (logoutConfirmOpen) { setLogoutConfirmOpen(false); return; }
    if (shortcutsModalOpen) { setShortcutsModalOpen(false); return; }
    if (exportModalOpen) { setExportModalOpen(false); return; }
    if (reportModal) { setReportModal(null); return; }
    if (bulkStockModalOpen) { setBulkStockModalOpen(false); return; }
    if (productModal) { closeProductModal(); return; }
    if (editingPlatform) { setEditingPlatform(null); return; }
    if (selectedManagedProduct) { setSelectedManagedProduct(null); return; }
  }, [
    logoutConfirmOpen, shortcutsModalOpen, exportModalOpen, reportModal,
    bulkStockModalOpen, productModal, editingPlatform, selectedManagedProduct, closeProductModal,
  ]);

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
        setPage('products');
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
          <button className="dsh-icon-btn dsh-logo-theme-toggle" onClick={() => setDark(!dark)} title="Toggle theme">
            {dark ? '☀️' : '🌙'}
          </button>
        </div>

        <button
          className="dsh-btn dsh-btn--ghost dsh-side-refresh"
          onClick={() => fetchAll(false)}
          disabled={refreshingAll}
          title="Refresh all data"
        >
          {refreshingAll ? <span className="dsh-spinner" /> : '⟳'} {t.refresh}
        </button>

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

        <div className="dsh-side-footer">
          <button className="dsh-logout-btn" onClick={() => setLogoutConfirmOpen(true)}>
            ⏻ Log Out
          </button>
        </div>
      </aside>

      <main className="dsh-main">
        <header className="dsh-header">
          <div>
            <h1 className="dsh-title dsh-title--animated" key={displayName}>
              {greeting.text}, <span className="dsh-title-name">{displayName}</span> {greeting.emoji}
            </h1>
            <p className="dsh-sub dsh-sub--animated" key={headerDescription}>{headerDescription}</p>
          </div>
          <div className="dsh-header-actions" style={{ position: 'relative' }}>
            <button
              className="dsh-icon-btn"
              onClick={() => setNotifBellOpen(o => !o)}
              title="Notifications"
              style={{ position: 'relative' }}
            >
              🔔
              {unreadNotifCount > 0 && (
                <span className="dsh-notif-badge">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>
              )}
            </button>
            {notifBellOpen && (
              <div className="dsh-notif-dropdown">
                <div className="dsh-notif-dropdown-head">
                  <strong>Notifications</strong>
                  <button className="dsh-btn dsh-btn--ghost" onClick={markAllNotificationsRead}>Mark all read</button>
                </div>
                {notifications.length === 0 ? (
                  <div className="dsh-notif-empty">No notifications yet</div>
                ) : (
                  notifications.slice(0, 20).map(n => (
                    <div key={n.id} className={`dsh-notif-row ${n.read ? '' : 'dsh-notif-row--unread'}`}>
                      <span>{NOTIF_ICONS[n.type] || 'ℹ'}</span>
                      <div>
                        <div className="dsh-notif-msg">{n.message}</div>
                        <div className="dsh-notif-time">{new Date(n.time).toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        {page === 'dashboard' && (
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
        )}

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
              <button
                className="dsh-btn dsh-btn--primary"
                onClick={searchResearchProducts}
                disabled={researchLoading || !researchQuery.trim()}
              >
                {researchLoading ? (<><span className="dsh-spinner" /> Searching...</>) : `🔍 ${t.searchBtn}`}
              </button>
            </div>

            <div className="dsh-research-scope">
              <label className="dsh-platform-check">
                <input
                  type="radio"
                  name="research-scope"
                  checked={researchScope === 'all'}
                  onChange={() => setResearchScope('all')}
                />
                🌐 Search Entire Web
              </label>
              <label className="dsh-platform-check">
                <input
                  type="radio"
                  name="research-scope"
                  checked={researchScope === 'custom'}
                  onChange={() => setResearchScope('custom')}
                />
                🏪 Specific Stores
              </label>
            </div>

            {researchScope === 'custom' && (
              <div className="dsh-platform-checks dsh-platform-checks--research">
                {researchStoreOptions.map(p => (
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
            )}

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

            {researchLoading && researchResults.length === 0 ? (
              <div className="dsh-grid">{[0, 1, 2, 3, 4, 5].map(i => <SkeletonProductCard key={i} />)}</div>
            ) : researchError ? (
              <EmptyState
                icon="⚠️"
                title={t.searchFailedTitle}
                subtitle={researchError || t.searchFailedSub}
                action={<button className="dsh-btn dsh-btn--primary" onClick={searchResearchProducts}>⟳ {t.retry}</button>}
              />
            ) : !researchSearched ? (
              <EmptyState icon="📦" title={t.searchPromptTitle} subtitle={t.searchPromptSub} />
            ) : researchResults.length === 0 && Object.keys(researchApiErrors).length > 0 ? (
              <EmptyState
                icon="⚠️"
                title="Search Completed With Errors"
                subtitle={Object.entries(researchApiErrors).map(([p, msg]) => `${platformLabel(p)}: ${msg}`).join('  •  ')}
                action={<button className="dsh-btn dsh-btn--primary" onClick={searchResearchProducts}>⟳ {t.retry}</button>}
              />
            ) : researchResults.length === 0 ? (
              <EmptyState
                icon="🔍"
                title={t.noProductsTitle}
                subtitle={t.noProductsSub}
                action={hasActiveResearchFilters ? (
                  <button className="dsh-btn dsh-btn--ghost" onClick={clearResearchFilters}>✕ Clear Filters</button>
                ) : undefined}
              />
            ) : (
              <>
                <div className="dsh-grid">
                  {researchResults.map((p, i) => (
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

                <div className="dsh-pagination">
                  <div className="dsh-pagination-summary">
                    {researchLoading ? (
                      <><span className="dsh-spinner" /> Loading…</>
                    ) : (
                      `Showing ${(researchPage - 1) * researchPageSize + 1}-${Math.min(researchPage * researchPageSize, researchTotalResults)} of ${researchTotalResults.toLocaleString()}`
                    )}
                  </div>
                  <div className="dsh-pagination-controls">
                    <button
                      className="dsh-btn dsh-btn--ghost"
                      onClick={() => goToResearchPage(researchPage - 1)}
                      disabled={researchLoading || researchPage <= 1}
                    >
                      ‹ Previous
                    </button>
                    <span className="dsh-pagination-page">
                      Page
                      <input
                        type="number"
                        className="dsh-input dsh-pagination-page-input"
                        min={1}
                        max={researchTotalPages}
                        value={researchPageInput}
                        onChange={e => setResearchPageInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') goToResearchPage(Number(researchPageInput) || 1); }}
                        onBlur={() => goToResearchPage(Number(researchPageInput) || 1)}
                      />
                      of {researchTotalPages.toLocaleString()}
                    </span>
                    <button
                      className="dsh-btn dsh-btn--ghost"
                      onClick={() => goToResearchPage(researchPage + 1)}
                      disabled={researchLoading || researchPage >= researchTotalPages}
                    >
                      Next ›
                    </button>
                  </div>
                  <div className="dsh-pagination-page-size">
                    <label htmlFor="research-page-size">Per page</label>
                    <select
                      id="research-page-size"
                      className="dsh-settings-select"
                      value={researchPageSize}
                      onChange={e => changeResearchPageSize(Number(e.target.value))}
                    >
                      {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {page === 'products' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>🛍️ Product Management</h2>
              <div className="dsh-tools">
                <button className="dsh-btn dsh-btn--ghost" onClick={() => setExportModalOpen(true)} disabled={savedProducts.length === 0}>
                  ⬇ Export
                </button>
              </div>
            </div>

            {dashboardStats && (
              <div className="dsh-inventory-summary">
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Total Products</span>
                  <span className="dsh-inventory-summary-value">{dashboardStats.total_products}</span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Inventory Value</span>
                  <span className="dsh-inventory-summary-value dsh-inventory-summary-value--gold">
                    ${Number(dashboardStats.total_inventory_value).toFixed(2)}
                  </span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Avg Margin</span>
                  <span className="dsh-inventory-summary-value">
                    {dashboardStats.average_margin_percent != null ? `${dashboardStats.average_margin_percent.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="dsh-inventory-summary-stat dsh-inventory-summary-stat--warning">
                  <span className="dsh-inventory-summary-label">Low Stock</span>
                  <span className="dsh-inventory-summary-value">{dashboardStats.low_stock_count}</span>
                </div>
                <div className="dsh-inventory-summary-stat dsh-inventory-summary-stat--danger">
                  <span className="dsh-inventory-summary-label">Out of Stock</span>
                  <span className="dsh-inventory-summary-value">{dashboardStats.out_of_stock_count}</span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Overstocked</span>
                  <span className="dsh-inventory-summary-value">{dashboardStats.overstocked_count}</span>
                </div>
              </div>
            )}

            <div className="dsh-pm-layout">
              <div className="dsh-pm-left">
                <div className="dsh-pill-toggle-group">
                  <button type="button" className={`dsh-pill-toggle ${leftPanelMode === 'saved' ? 'dsh-pill-toggle--active' : ''}`} onClick={() => setLeftPanelMode('saved')}>
                    My Products
                  </button>
                  <button type="button" className={`dsh-pill-toggle ${leftPanelMode === 'search' ? 'dsh-pill-toggle--active' : ''}`} onClick={() => setLeftPanelMode('search')}>
                    + Find New
                  </button>
                </div>

                {leftPanelMode === 'search' ? (
                  <div className="dsh-pm-search">
                    <div className="dsh-research-controls">
                      <input
                        className="dsh-input"
                        placeholder={t.researchPlaceholder}
                        value={researchQuery}
                        onChange={e => setResearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchResearchProducts()}
                      />
                      <button className="dsh-btn dsh-btn--primary" onClick={searchResearchProducts} disabled={researchLoading || !researchQuery.trim()}>
                        {researchLoading ? (<><span className="dsh-spinner" /> Searching...</>) : `🔍 ${t.searchBtn}`}
                      </button>
                    </div>
                    {researchLoading ? (
                      <div className="dsh-grid">{[0, 1, 2].map(i => <SkeletonProductCard key={i} />)}</div>
                    ) : researchResults.length === 0 ? (
                      <EmptyState icon="📦" title={t.searchPromptTitle} subtitle={t.searchPromptSub} />
                    ) : (
                      <div className="dsh-grid">
                        {researchResults.map((p, i) => (
                          <div key={p.url || `${p.platform}-${i}`} className="dsh-product-card" onClick={() => openProductModal(p, 'research')}>
                            <div className="dsh-product-image">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} onError={e => { e.target.style.display = 'none'; }} />
                              ) : (
                                <span>📦</span>
                              )}
                            </div>
                            <h3 className="dsh-product-name" title={p.name}>{p.name}</h3>
                            <div className="dsh-product-meta">
                              <span className="dsh-product-price">{p.price != null ? `${p.currency || 'USD'} ${Number(p.price).toFixed(2)}` : '—'}</span>
                              <span className="dsh-badge dsh-badge--off">{p.platform}</span>
                            </div>
                            <button
                              className="dsh-btn dsh-btn--primary dsh-product-add-btn"
                              onClick={(e) => { e.stopPropagation(); openProductModal(p, 'research'); }}
                              disabled={p._added}
                            >
                              {p._added ? '✓ Added' : '✨ Analyze & Save'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="dsh-inventory-controls">
                      <input
                        className="dsh-input dsh-inventory-search-input"
                        placeholder="Search my products"
                        value={savedSearchText}
                        onChange={e => setSavedSearchText(e.target.value)}
                      />
                      <select className="dsh-settings-select" value={savedStatusFilter} onChange={e => setSavedStatusFilter(e.target.value)}>
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                      <select className="dsh-settings-select" value={savedStockStatusFilter} onChange={e => setSavedStockStatusFilter(e.target.value)}>
                        {INVENTORY_STATUS_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select className="dsh-settings-select" value={savedCategoryFilter} onChange={e => setSavedCategoryFilter(e.target.value)}>
                        <option value="">All Categories</option>
                        {savedCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select className="dsh-settings-select" value={savedSortBy} onChange={e => setSavedSortBy(e.target.value)}>
                        <option value="">Default</option>
                        <option value="name">Name</option>
                        <option value="quantity">Quantity</option>
                        <option value="value">Value</option>
                        <option value="margin">Margin</option>
                        <option value="updated_at">Last Updated</option>
                      </select>
                      {savedSortBy && (
                        <button type="button" className="dsh-btn dsh-btn--ghost" onClick={() => setSavedSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
                          {savedSortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                        </button>
                      )}
                    </div>

                    {selectedProductCount > 0 && (
                      <div className="dsh-inventory-bulk-bar dsh-pm-bulk-bar">
                        <span>{selectedProductCount} selected</span>
                        <button className="dsh-btn dsh-btn--ghost" onClick={bulkDeleteSelected} disabled={bulkActionRunning}>🗑 Delete</button>
                        <select className="dsh-settings-select" value={bulkStatusValue} onChange={e => setBulkStatusValue(e.target.value)}>
                          <option value="active">Active</option>
                          <option value="draft">Draft</option>
                          <option value="archived">Archived</option>
                        </select>
                        <button className="dsh-btn dsh-btn--ghost" onClick={bulkSetStatus} disabled={bulkActionRunning}>Set Status</button>
                        <button
                          className="dsh-btn dsh-btn--ghost"
                          onClick={() => { setBulkStockDelta(''); setBulkStockReason('correction'); setBulkStockModalOpen(true); }}
                          disabled={bulkActionRunning}
                        >
                          ✎ Adjust Stock
                        </button>
                        <select className="dsh-settings-select" value={bulkPricingStrategy} onChange={e => setBulkPricingStrategy(e.target.value)}>
                          {Object.entries(STRATEGY_LABELS).filter(([k]) => k !== 'custom').map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                        <button className="dsh-btn dsh-btn--ghost" onClick={bulkApplyPricing} disabled={bulkActionRunning}>💰 Apply Pricing</button>
                        <button className="dsh-btn dsh-btn--ghost" onClick={bulkRefreshPrice} disabled={bulkActionRunning}>🔄 Refresh Price</button>
                        <button className="dsh-btn dsh-btn--ghost" onClick={() => setSelectedProductIds({})}>Clear</button>
                      </div>
                    )}

                    {savedProductsLoading ? (
                      <div className="dsh-list">{[0, 1, 2, 3].map(i => <SkeletonTaskRow key={i} />)}</div>
                    ) : savedProducts.length === 0 ? (
                      <EmptyState
                        icon="🛍️"
                        title="No Saved Products"
                        subtitle='Use "+ Find New" to search and analyze a product into your catalog'
                        action={<button className="dsh-btn dsh-btn--primary" onClick={() => setLeftPanelMode('search')}>+ Find New</button>}
                      />
                    ) : (
                      <div className="dsh-products-table-wrap">
                        <table className="dsh-products-table">
                          <thead>
                            <tr>
                              <th className="dsh-products-th-check">
                                <input type="checkbox" checked={allSavedSelected} onChange={toggleSelectAllSaved} />
                              </th>
                              <th></th>
                              <th>Name</th>
                              <th>Price</th>
                              <th>Stock</th>
                              <th>Platform</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {savedProducts.map(p => (
                              <tr
                                key={p.id}
                                className={`${selectedProductIds[p.id] ? 'dsh-products-row--selected' : ''} ${selectedManagedProduct?.id === p.id ? 'dsh-pm-row--active' : ''}`}
                              >
                                <td onClick={e => e.stopPropagation()}>
                                  <input type="checkbox" checked={!!selectedProductIds[p.id]} onChange={() => toggleProductSelected(p.id)} />
                                </td>
                                <td onClick={() => openManagedProduct(p.id)}>
                                  <div className="dsh-products-thumb">
                                    {p.image_url ? (
                                      <img src={p.image_url} alt={p.name} onError={e => { e.target.style.display = 'none'; }} />
                                    ) : (
                                      <span>📦</span>
                                    )}
                                  </div>
                                </td>
                                <td className="dsh-products-name-cell" title={p.name} onClick={() => openManagedProduct(p.id)}>{p.name}</td>
                                <td onClick={() => openManagedProduct(p.id)}>{p.selling_price != null ? `$${Number(p.selling_price).toFixed(2)}` : '—'}</td>
                                <td onClick={() => openManagedProduct(p.id)}>
                                  <span className={`dsh-inventory-status-badge dsh-inventory-status-badge--${p.stock_status}`}>
                                    {INVENTORY_STATUS_LABELS[p.stock_status] || p.stock_status}
                                  </span>
                                </td>
                                <td onClick={() => openManagedProduct(p.id)}><span className="dsh-badge dsh-badge--off">{p.platform}</span></td>
                                <td>
                                  <div className="dsh-products-actions">
                                    <button
                                      className="dsh-agent-btn dsh-agent-btn--settings dsh-agent-btn--icon"
                                      title="View / Manage"
                                      onClick={() => openManagedProduct(p.id)}
                                    >
                                      👁
                                    </button>
                                    <button
                                      className="dsh-agent-btn dsh-agent-btn--pause dsh-agent-btn--icon"
                                      title="Delete"
                                      onClick={() => deleteManagedProduct(p.id)}
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
                    )}
                  </>
                )}
              </div>

              {selectedManagedProduct && (
                <div className="dsh-pm-right">
                  <div className="dsh-pm-right-head">
                    <h3>{selectedManagedProduct.name}</h3>
                    <button className="dsh-btn dsh-btn--ghost" onClick={() => setSelectedManagedProduct(null)}>✕ Close</button>
                  </div>

                  {selectedManagedProduct.warnings.length > 0 && (
                    <div className="dsh-pricing-warnings">
                      {selectedManagedProduct.warnings.map((w, i) => <div key={i} className="dsh-pricing-warning-item">⚠️ {w}</div>)}
                    </div>
                  )}

                  <div className="dsh-pm-tabs">
                    {['details', 'pricing', 'inventory', 'marketing', 'history'].map(tabId => (
                      <button
                        key={tabId}
                        type="button"
                        className={`dsh-pm-tab ${managementTab === tabId ? 'dsh-pm-tab--active' : ''}`}
                        onClick={() => setManagementTab(tabId)}
                      >
                        {tabId.charAt(0).toUpperCase() + tabId.slice(1)}
                      </button>
                    ))}
                  </div>

                  {selectedProductLoading ? (
                    <div className="dsh-ai-loading"><span className="dsh-spinner" /> Loading...</div>
                  ) : (
                    <div className="dsh-pm-tab-content">
                      {managementTab === 'details' && (
                        <>
                          <div className="dsh-pricing-field">
                            <label>Name</label>
                            <input className="dsh-input" value={detailsForm.name} onChange={e => setDetailsForm(f => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Description</label>
                            <textarea
                              className="dsh-input dsh-platform-config-textarea"
                              value={detailsForm.description}
                              onChange={e => setDetailsForm(f => ({ ...f, description: e.target.value }))}
                            />
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Category</label>
                            <input className="dsh-input" value={detailsForm.category} onChange={e => setDetailsForm(f => ({ ...f, category: e.target.value }))} />
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Status</label>
                            <select className="dsh-settings-select" value={detailsForm.status} onChange={e => setDetailsForm(f => ({ ...f, status: e.target.value }))}>
                              <option value="active">Active</option>
                              <option value="draft">Draft</option>
                              <option value="archived">Archived</option>
                            </select>
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Reorder Level</label>
                            <input
                              type="number" min="0" className="dsh-input"
                              value={detailsForm.reorderLevel}
                              onChange={e => setDetailsForm(f => ({ ...f, reorderLevel: e.target.value }))}
                            />
                          </div>
                          <div className="dsh-settings-actions">
                            <button className="dsh-btn dsh-btn--primary" onClick={saveDetails} disabled={savingDetails}>
                              {savingDetails ? (<><span className="dsh-spinner" /> Saving...</>) : '✓ Save Details'}
                            </button>
                            <button className="dsh-btn dsh-btn--ghost" onClick={() => deleteManagedProduct(selectedManagedProduct.id)}>🗑 Delete Product</button>
                          </div>
                        </>
                      )}

                      {managementTab === 'pricing' && (
                        <>
                          <div className="dsh-pricing-compare">
                            <div className="dsh-pricing-compare-item">
                              <span className="dsh-pricing-compare-label">Cost Price</span>
                              <span className="dsh-pricing-compare-value">
                                {selectedManagedProduct.supplier_price != null ? `${selectedManagedProduct.currency} ${Number(selectedManagedProduct.supplier_price).toFixed(2)}` : '—'}
                              </span>
                            </div>
                            <div className="dsh-pricing-compare-arrow">→</div>
                            <div className="dsh-pricing-compare-item dsh-pricing-compare-item--suggested">
                              <span className="dsh-pricing-compare-label">Selling Price</span>
                              <span className="dsh-pricing-compare-value dsh-pricing-compare-value--gold">
                                {selectedManagedProduct.selling_price != null ? `${selectedManagedProduct.currency} ${Number(selectedManagedProduct.selling_price).toFixed(2)}` : '—'}
                              </span>
                            </div>
                          </div>
                          <div className="dsh-pricing-margin-display">
                            <span className="dsh-pricing-margin-label">Profit Margin</span>
                            <span className="dsh-pricing-margin-value">
                              {selectedManagedProduct.pricing.margin_percent != null ? `${Number(selectedManagedProduct.pricing.margin_percent).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          {selectedManagedProduct.pricing.ai_recommendation && (
                            <div className="dsh-pricing-ai-box">
                              <div className="dsh-pricing-ai-box-header">✨ AI Recommendation</div>
                              <p>{selectedManagedProduct.pricing.ai_recommendation}</p>
                            </div>
                          )}

                          <div className="dsh-pricing-field">
                            <label>Set Manual Price</label>
                            <input
                              type="number" step="0.01" min="0" className="dsh-input"
                              value={pricingEditPrice}
                              onChange={e => setPricingEditPrice(e.target.value)}
                            />
                          </div>
                          <button className="dsh-btn dsh-btn--primary" onClick={applyManualPrice} disabled={savingPricing || pricingEditPrice === ''}>
                            {savingPricing ? (<><span className="dsh-spinner" /> Saving...</>) : '✓ Set Price'}
                          </button>

                          <div className="dsh-pricing-field" style={{ marginTop: 16 }}>
                            <label>Or Apply a Strategy</label>
                            <div className="dsh-pill-toggle-group">
                              {Object.entries(STRATEGY_LABELS).filter(([k]) => k !== 'custom').map(([k, label]) => (
                                <button
                                  key={k}
                                  type="button"
                                  className={`dsh-pill-toggle ${pricingStrategySelection === k ? 'dsh-pill-toggle--active' : ''}`}
                                  onClick={() => setPricingStrategySelection(k)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <button className="dsh-btn dsh-btn--ghost" onClick={applyPricingStrategyToSelected} disabled={savingPricing}>
                            {savingPricing ? (<><span className="dsh-spinner" /> Applying...</>) : '💰 Apply Strategy'}
                          </button>

                          <div className="dsh-settings-actions" style={{ marginTop: 16 }}>
                            <button className="dsh-btn dsh-btn--ghost" onClick={() => fetchTabRecommendation('pricing')} disabled={tabRecommendationLoading}>
                              {tabRecommendationLoading ? (<><span className="dsh-spinner" /> Thinking...</>) : '✨ Get AI Recommendation'}
                            </button>
                          </div>
                          {tabRecommendation && (
                            <div className="dsh-pricing-ai-box">
                              <div className="dsh-pricing-ai-box-header">✨ {tabRecommendation.recommendation}</div>
                              {tabRecommendation.suggested_actions.length > 0 && (
                                <ul>{tabRecommendation.suggested_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {managementTab === 'inventory' && (
                        <>
                          <div className="dsh-pricing-stats-grid">
                            <div className="dsh-pricing-stat">
                              <span className="dsh-pricing-stat-label">On Hand</span>
                              <span className="dsh-pricing-stat-value">{selectedManagedProduct.quantity}</span>
                            </div>
                            <div className="dsh-pricing-stat">
                              <span className="dsh-pricing-stat-label">Reorder Level</span>
                              <span className="dsh-pricing-stat-value">{selectedManagedProduct.reorder_level}</span>
                            </div>
                            <div className="dsh-pricing-stat">
                              <span className="dsh-pricing-stat-label">Status</span>
                              <span className={`dsh-inventory-status-badge dsh-inventory-status-badge--${selectedManagedProduct.stock_status}`}>
                                {INVENTORY_STATUS_LABELS[selectedManagedProduct.stock_status]}
                              </span>
                            </div>
                            <div className="dsh-pricing-stat">
                              <span className="dsh-pricing-stat-label">Turnover Rate</span>
                              <span className="dsh-pricing-stat-value">{selectedManagedProduct.turnover_rate ?? '—'}</span>
                            </div>
                            {selectedManagedProduct.forecast && (
                              <>
                                <div className="dsh-pricing-stat">
                                  <span className="dsh-pricing-stat-label">Forecasted Demand</span>
                                  <span className="dsh-pricing-stat-value">{selectedManagedProduct.forecast.forecasted_demand ?? '—'}</span>
                                </div>
                                <div className="dsh-pricing-stat">
                                  <span className="dsh-pricing-stat-label">Forecast Confidence</span>
                                  <span className="dsh-pricing-stat-value">
                                    {selectedManagedProduct.forecast.confidence != null ? `${(selectedManagedProduct.forecast.confidence * 100).toFixed(0)}%` : '—'}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="dsh-quick-delta-row">
                            {[-10, -1, 1, 10].map(d => (
                              <button
                                key={d}
                                type="button"
                                className="dsh-pill-toggle"
                                onClick={() => setInventoryDelta(String((Number(inventoryDelta) || 0) + d))}
                              >
                                {d > 0 ? `+${d}` : d}
                              </button>
                            ))}
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Quantity Change</label>
                            <input type="number" className="dsh-input" placeholder="e.g. -5 or 20" value={inventoryDelta} onChange={e => setInventoryDelta(e.target.value)} />
                          </div>
                          <div className="dsh-pricing-field">
                            <label>Reason</label>
                            <select className="dsh-settings-select" value={inventoryReason} onChange={e => setInventoryReason(e.target.value)}>
                              {STOCK_UPDATE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <button className="dsh-btn dsh-btn--primary" onClick={adjustInventory} disabled={savingInventoryChange || inventoryDelta === ''}>
                            {savingInventoryChange ? (<><span className="dsh-spinner" /> Saving...</>) : '✓ Apply'}
                          </button>

                          <div className="dsh-settings-actions" style={{ marginTop: 16 }}>
                            <button className="dsh-btn dsh-btn--ghost" onClick={() => fetchTabRecommendation('inventory')} disabled={tabRecommendationLoading}>
                              {tabRecommendationLoading ? (<><span className="dsh-spinner" /> Thinking...</>) : '✨ Get AI Recommendation'}
                            </button>
                          </div>
                          {tabRecommendation && (
                            <div className="dsh-pricing-ai-box">
                              <div className="dsh-pricing-ai-box-header">✨ {tabRecommendation.recommendation}</div>
                              {tabRecommendation.suggested_actions.length > 0 && (
                                <ul>{tabRecommendation.suggested_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {managementTab === 'marketing' && (
                        <>
                          {selectedManagedProduct.marketing ? (
                            <>
                              <p className="dsh-product-detail-desc">{selectedManagedProduct.marketing.description}</p>
                              {selectedManagedProduct.marketing.target_audience && (
                                <p><strong>Target audience:</strong> {selectedManagedProduct.marketing.target_audience}</p>
                              )}
                              {selectedManagedProduct.marketing.keywords.length > 0 && (
                                <div className="dsh-tools">
                                  {selectedManagedProduct.marketing.keywords.map(k => <span key={k} className="dsh-badge dsh-badge--off">{k}</span>)}
                                </div>
                              )}
                            </>
                          ) : (
                            <EmptyState icon="✨" title="No Marketing Copy Yet" subtitle="Marketing copy is generated automatically when a product is analyzed" />
                          )}
                          <div className="dsh-settings-actions" style={{ marginTop: 16 }}>
                            <button className="dsh-btn dsh-btn--ghost" onClick={() => fetchTabRecommendation('marketing')} disabled={tabRecommendationLoading}>
                              {tabRecommendationLoading ? (<><span className="dsh-spinner" /> Thinking...</>) : '✨ Get AI Recommendation'}
                            </button>
                          </div>
                          {tabRecommendation && (
                            <div className="dsh-pricing-ai-box">
                              <div className="dsh-pricing-ai-box-header">✨ {tabRecommendation.recommendation}</div>
                              {tabRecommendation.suggested_actions.length > 0 && (
                                <ul>{tabRecommendation.suggested_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {managementTab === 'history' && (
                        selectedManagedProduct.history.length === 0 ? (
                          <EmptyState icon="📈" title="No Activity Yet" subtitle="Pricing, stock, and marketing changes will show up here" />
                        ) : (
                          <div className="dsh-stock-timeline">
                            {[...selectedManagedProduct.history].reverse().map(h => (
                              <div
                                key={h.id}
                                className={`dsh-stock-timeline-item ${h.action === 'stocked' && h.details.quantity_change < 0 ? 'dsh-stock-timeline-item--out' : 'dsh-stock-timeline-item--in'}`}
                              >
                                <span className="dsh-stock-timeline-dot" />
                                <div className="dsh-stock-timeline-content">
                                  <div className="dsh-stock-timeline-change">
                                    <span className="dsh-badge dsh-badge--off">{h.action}</span>
                                    {h.action === 'stocked' && `${h.details.quantity_change >= 0 ? '+' : ''}${h.details.quantity_change} units (${h.details.reason || 'adjustment'})`}
                                    {h.action === 'priced' && `${selectedManagedProduct.currency} ${Number(h.details.applied_price ?? h.details.cost ?? 0).toFixed(2)} (${h.details.strategy || 'manual'})`}
                                    {h.action === 'searched' && `Sourced from ${h.details.platform || 'search'}`}
                                    {h.action === 'marketed' && (h.details.note || 'Marketing copy generated')}
                                  </div>
                                  <div className="dsh-stock-timeline-date">{new Date(h.date).toLocaleString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'shopify' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>🛍️ Shopify Sync</h2>
              <div className="dsh-tools">
                <span className={`dsh-badge ${shopifyStatus?.connected ? 'dsh-badge--on' : 'dsh-badge--err'}`}>
                  <span className="dsh-dot" />
                  {shopifyStatus?.connected ? `Connected — ${shopifyStatus.shop_name}` : shopifyStatus?.configured ? 'Not reachable' : 'Not configured'}
                </span>
                <button className="dsh-btn dsh-btn--ghost" onClick={connectShopify} disabled={shopifyConnecting}>
                  {shopifyConnecting ? (<><span className="dsh-spinner" /> Checking...</>) : '🔌 Connect'}
                </button>
              </div>
            </div>

            {!shopifyStatus?.configured && (
              <div className="dsh-ai-error" style={{ marginBottom: 20 }}>
                ⚠️ Set <code>SHOPIFY_STORE_URL</code> and <code>SHOPIFY_API_TOKEN</code> in the backend's <code>.env</code>
                {' '}(create a custom app in your store's Admin under Settings → Apps and sales channels → Develop apps,
                with products:write/products:read/inventory:write scopes) — the token is never entered here in the browser.
              </div>
            )}

            {shopifyStats && (
              <div className="dsh-inventory-summary">
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Products Synced</span>
                  <span className="dsh-inventory-summary-value">{shopifyStats.products_synced}</span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Active</span>
                  <span className="dsh-inventory-summary-value">{shopifyStats.active_count}</span>
                </div>
                <div className="dsh-inventory-summary-stat dsh-inventory-summary-stat--warning">
                  <span className="dsh-inventory-summary-label">Draft</span>
                  <span className="dsh-inventory-summary-value">{shopifyStats.draft_count}</span>
                </div>
                <div className="dsh-inventory-summary-stat dsh-inventory-summary-stat--danger">
                  <span className="dsh-inventory-summary-label">Failed</span>
                  <span className="dsh-inventory-summary-value">{shopifyStats.failed_count}</span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Synced Value</span>
                  <span className="dsh-inventory-summary-value dsh-inventory-summary-value--gold">${Number(shopifyStats.total_selling_value).toFixed(2)}</span>
                </div>
                <div className="dsh-inventory-summary-stat">
                  <span className="dsh-inventory-summary-label">Success Rate</span>
                  <span className="dsh-inventory-summary-value">{shopifyStats.success_rate_percent}%</span>
                </div>
              </div>
            )}

            <div className="dsh-pm-layout">
              <div className="dsh-pm-left">
                <h3 className="dsh-settings-panel-title">Manual Sync</h3>
                <p className="dsh-row-sub">
                  {selectedProductCount > 0
                    ? `${selectedProductCount} product(s) selected in Product Management`
                    : 'Select products in the Product Management tab first, then come back here to sync them.'}
                </p>
                <div className="dsh-settings-actions">
                  <button className="dsh-btn dsh-btn--primary" onClick={() => syncSelectedToShopify(true)} disabled={shopifySyncing || selectedProductCount === 0}>
                    {shopifySyncing ? (<><span className="dsh-spinner" /> Syncing...</>) : '✓ Sync & Publish'}
                  </button>
                  <button className="dsh-btn dsh-btn--ghost" onClick={() => syncSelectedToShopify(false)} disabled={shopifySyncing || selectedProductCount === 0}>
                    Sync as Draft
                  </button>
                  <button className="dsh-btn dsh-btn--ghost" onClick={() => setPage('products')}>🛍️ Go to Product Management</button>
                </div>

                <h3 className="dsh-settings-panel-title" style={{ marginTop: 28 }}>Sync History</h3>
                {shopifySyncLog.length === 0 ? (
                  <EmptyState icon="📈" title="No Sync Activity Yet" subtitle="Synced products, price/inventory pushes, and webhooks will show up here" />
                ) : (
                  <div className="dsh-stock-timeline">
                    {shopifySyncLog.map(entry => (
                      <div key={entry.id} className={`dsh-stock-timeline-item ${entry.status === 'success' ? 'dsh-stock-timeline-item--in' : 'dsh-stock-timeline-item--out'}`}>
                        <span className="dsh-stock-timeline-dot" />
                        <div className="dsh-stock-timeline-content">
                          <div className="dsh-stock-timeline-change">
                            <span className="dsh-badge dsh-badge--off">{entry.action}</span>
                            {entry.product_name ? `${entry.product_name} — ` : ''}{entry.message}
                          </div>
                          <div className="dsh-stock-timeline-date">{new Date(entry.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dsh-pm-right" style={{ position: 'static', maxHeight: 'none' }}>
                <h3 className="dsh-settings-panel-title">Automation Schedule</h3>
                <div className="dsh-settings-item" style={{ marginBottom: 16 }}>
                  <div className="dsh-settings-item-text">
                    <div className="dsh-settings-item-name">Auto-sync</div>
                    <div className="dsh-settings-item-desc">
                      {schedulerConfig?.enabled
                        ? `Running every ${schedulerConfig.interval_hours}h — next run ${schedulerConfig.next_run_at ? new Date(schedulerConfig.next_run_at).toLocaleString() : '—'}`
                        : 'Currently off — scheduled syncs always create Shopify drafts, never publish automatically'}
                    </div>
                  </div>
                  <label className="dsh-toggle">
                    <input type="checkbox" checked={!!schedulerConfig?.enabled} onChange={toggleAutoSync} disabled={schedulerSaving} />
                    <span className="dsh-toggle-slider" />
                  </label>
                </div>

                <div className="dsh-pricing-field">
                  <label>Interval</label>
                  <select
                    className="dsh-settings-select"
                    value={schedulerForm.interval_hours}
                    onChange={e => setSchedulerForm(f => ({ ...f, interval_hours: Number(e.target.value) }))}
                  >
                    <option value={1}>Every 1 hour</option>
                    <option value={4}>Every 4 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours</option>
                  </select>
                </div>

                <div className="dsh-pricing-field">
                  <label>Platforms to scan</label>
                  <div className="dsh-platform-checks">
                    {RESEARCH_PLATFORMS.map(p => (
                      <label key={p.id} className="dsh-platform-check">
                        <input
                          type="checkbox"
                          checked={!!schedulerForm.platforms[p.id]}
                          onChange={() => setSchedulerForm(f => ({ ...f, platforms: { ...f.platforms, [p.id]: !f.platforms[p.id] } }))}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="dsh-pricing-field">
                  <label>Seed keywords (one per line)</label>
                  <textarea
                    className="dsh-input dsh-platform-config-textarea"
                    placeholder={'wireless earbuds\nphone case\nled strip lights'}
                    value={schedulerForm.seed_keywords}
                    onChange={e => setSchedulerForm(f => ({ ...f, seed_keywords: e.target.value }))}
                  />
                </div>

                <div className="dsh-pricing-field">
                  <label>Pricing strategy</label>
                  <div className="dsh-pill-toggle-group">
                    {Object.entries(STRATEGY_LABELS).filter(([k]) => k !== 'custom').map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={`dsh-pill-toggle ${schedulerForm.pricing_strategy === k ? 'dsh-pill-toggle--active' : ''}`}
                        onClick={() => setSchedulerForm(f => ({ ...f, pricing_strategy: k }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dsh-pricing-field">
                  <label>Minimum margin % to auto-sync (must clear the chosen strategy's margin)</label>
                  <input
                    type="number" min="0" className="dsh-input"
                    value={schedulerForm.margin_threshold}
                    onChange={e => setSchedulerForm(f => ({ ...f, margin_threshold: e.target.value }))}
                  />
                </div>

                <div className="dsh-pricing-field">
                  <label>Max candidates per keyword</label>
                  <input
                    type="number" min="1" max="10" className="dsh-input"
                    value={schedulerForm.max_candidates_per_keyword}
                    onChange={e => setSchedulerForm(f => ({ ...f, max_candidates_per_keyword: e.target.value }))}
                  />
                </div>

                <div className="dsh-pricing-field">
                  <label>Blacklisted seed keywords (one per line, skipped even if listed above)</label>
                  <textarea
                    className="dsh-input dsh-platform-config-textarea"
                    value={schedulerForm.category_blacklist}
                    onChange={e => setSchedulerForm(f => ({ ...f, category_blacklist: e.target.value }))}
                  />
                </div>

                <div className="dsh-settings-actions">
                  <button className="dsh-btn dsh-btn--primary" onClick={saveSchedulerConfig} disabled={schedulerSaving}>
                    {schedulerSaving ? (<><span className="dsh-spinner" /> Saving...</>) : '✓ Save Settings'}
                  </button>
                </div>

                <h3 className="dsh-settings-panel-title" style={{ marginTop: 24 }}>Discovery Activity</h3>
                {schedulerLog.length === 0 ? (
                  <p className="dsh-row-sub">No discovery runs yet.</p>
                ) : (
                  <div className="dsh-stock-timeline">
                    {schedulerLog.map(entry => (
                      <div key={entry.id} className={`dsh-stock-timeline-item ${entry.status === 'success' ? 'dsh-stock-timeline-item--in' : 'dsh-stock-timeline-item--out'}`}>
                        <span className="dsh-stock-timeline-dot" />
                        <div className="dsh-stock-timeline-content">
                          <div className="dsh-stock-timeline-change">
                            <span className="dsh-badge dsh-badge--off">{entry.action}</span>
                            {entry.message}
                          </div>
                          <div className="dsh-stock-timeline-date">{new Date(entry.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
                  <div className="dsh-settings-label">Max Results Fetched Per Platform</div>
                  <div className="dsh-settings-item-desc">
                    How many results to pull into the searchable pool per platform — pagination pages
                    through this pool, so a higher number means more pages, not a bigger initial load.
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    className="dsh-input dsh-filter-num"
                    value={settingsDraft.defaultMaxResults}
                    onChange={e => setSettingsDraft(s => ({
                      ...s,
                      defaultMaxResults: Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                    }))}
                  />
                </div>
              </div>

              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">💳 Plan &amp; Billing</h3>
                {usageInfo && (
                  <div className="dsh-settings-section">
                    <div className="dsh-settings-label">Current Plan: {usageInfo.planName || usageInfo.plan || 'Free'}</div>
                    <div className="dsh-settings-item-desc">
                      {usageInfo.limit === null
                        ? `${usageInfo.used} products used this month — unlimited plan`
                        : `${usageInfo.used} of ${usageInfo.limit} products used this month`}
                    </div>
                    {usageInfo.limit !== null && (
                      <div className="dsh-usage-bar">
                        <div
                          className={`dsh-usage-bar-fill ${usageInfo.percentUsed >= 80 ? 'dsh-usage-bar-fill--warn' : ''}`}
                          style={{ width: `${Math.min(100, usageInfo.percentUsed)}%` }}
                        />
                      </div>
                    )}
                    {usageInfo.normalPrice > 0 && (
                      <div className="dsh-settings-item-desc" style={{ marginTop: 8 }}>
                        {usageInfo.isFirstMonth ? (
                          <>💰 Paying <strong>${usageInfo.currentPrice.toFixed(2)}</strong> this first month (normally ${usageInfo.normalPrice.toFixed(2)}/mo)</>
                        ) : (
                          <>Paying <strong>${usageInfo.normalPrice.toFixed(2)}/mo</strong></>
                        )}
                      </div>
                    )}
                    {usageInfo.nextBillingDate && (
                      <div className="dsh-settings-item-desc">
                        Next billing date: {new Date(usageInfo.nextBillingDate).toLocaleDateString()}
                      </div>
                    )}
                    {usageInfo.limit !== null && usageInfo.percentUsed >= 80 && (
                      <button className="dsh-btn dsh-btn--primary" style={{ marginTop: 10 }} onClick={() => setPlansModalOpen(true)}>
                        📈 Upgrade Plan
                      </button>
                    )}
                  </div>
                )}
                <div className="dsh-settings-section">
                  <button className="dsh-btn dsh-btn--ghost" onClick={() => setPlansModalOpen(true)}>
                    View All Plans
                  </button>
                </div>
              </div>

              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">🔗 Webhooks</h3>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Register a webhook URL</div>
                  <div className="dsh-settings-item-desc">Receives a POST for every notification event (product added, sync complete, error alerts).</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="url"
                      className="dsh-input"
                      placeholder="https://example.com/webhook"
                      value={newWebhookUrl}
                      onChange={e => setNewWebhookUrl(e.target.value)}
                    />
                    <button className="dsh-btn dsh-btn--primary" onClick={addWebhook}>+ Add</button>
                  </div>
                </div>
                <div className="dsh-settings-section">
                  <div className="dsh-settings-label">Registered Webhooks</div>
                  {webhooks.length === 0 ? (
                    <div className="dsh-settings-item-desc">No webhooks registered yet.</div>
                  ) : (
                    <div className="dsh-platform-checks" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      {webhooks.map(w => (
                        <div key={w.id} className="dsh-platform-check" style={{ justifyContent: 'space-between' }}>
                          <span>{w.url}</span>
                          <button className="dsh-btn dsh-btn--ghost" onClick={() => deleteWebhook(w.id)}>✕ Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="dsh-settings-actions dsh-user-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={saveSettings}>✓ Save Settings</button>
              <button className="dsh-btn dsh-btn--ghost" onClick={resetSettingsDraft}>↺ Reset to Defaults</button>
            </div>
          </section>
        )}

        {page === 'admin' && user.role === 'admin' && (
          <section className="dsh-section">
            <div className="dsh-section-head">
              <h2>🛡️ Admin</h2>
              <button className="dsh-btn dsh-btn--ghost" onClick={loadAdminData}>⟳ Refresh</button>
            </div>

            {adminStats && (
              <section className="dsh-stats">
                <div className="dsh-stat dsh-stat--purple">
                  <span className="dsh-stat-icon">👥</span>
                  <div>
                    <div className="dsh-stat-num">{adminStats.total_users}</div>
                    <div className="dsh-stat-label">Total Users</div>
                  </div>
                </div>
                <div className="dsh-stat dsh-stat--gold">
                  <span className="dsh-stat-icon">💰</span>
                  <div>
                    <div className="dsh-stat-num">${(adminStats.revenue_proxy_cents / 100).toFixed(2)}</div>
                    <div className="dsh-stat-label">Revenue (proxy)</div>
                  </div>
                </div>
                <div className="dsh-stat dsh-stat--blue">
                  <span className="dsh-stat-icon">🔍</span>
                  <div>
                    <div className="dsh-stat-num">{adminStats.active_searches_24h}</div>
                    <div className="dsh-stat-label">Actions (24h)</div>
                  </div>
                </div>
              </section>
            )}

            {adminHealth && (
              <div className="dsh-settings-panel">
                <h3 className="dsh-settings-panel-title">System Health</h3>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span>{adminHealth.express?.ok ? '🟢' : '🔴'} Express Backend</span>
                  <span>{adminHealth.fastapi?.ok ? '🟢' : '🔴'} FastAPI Research Service</span>
                </div>
              </div>
            )}

            <div className="dsh-settings-panel">
              <h3 className="dsh-settings-panel-title">Users</h3>
              <div className="dsh-platform-checks" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                {adminUsers.map(u => (
                  <div key={u.id} className="dsh-platform-check" style={{ justifyContent: 'space-between' }}>
                    <span>{u.name} ({u.email}) — {u.role} — {u.plan_key || 'free'}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        className="dsh-input"
                        defaultValue={u.plan_key || 'free'}
                        onChange={e => adminSetUserPlan(u.id, e.target.value)}
                      >
                        {billingPlans.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                      </select>
                      <button
                        className="dsh-btn dsh-btn--danger"
                        onClick={() => adminDeleteUser(u.id)}
                        disabled={u.id === user.id}
                      >
                        ✕ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="dsh-settings-panel">
              <h3 className="dsh-settings-panel-title">Logs</h3>
              <pre className="dsh-admin-logs">
                {adminLogs.length === 0 ? 'No log entries yet.' : adminLogs.map(l => JSON.stringify(l)).join('\n')}
              </pre>
            </div>
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

      {productModal && (
        <ProductDetailModal
          product={productModal.product}
          onClose={closeProductModal}
          onAnalyzeAndSave={analyzeAndSaveProduct}
          analyzing={analyzingProduct}
          closing={productModalClosing}
        />
      )}

      {bulkStockModalOpen && (
        <div className="dsh-modal-back" onClick={() => setBulkStockModalOpen(false)}>
          <div className="dsh-modal" onClick={e => e.stopPropagation()}>
            <h3>✎ Bulk Update Stock</h3>
            <p className="dsh-price-history-product">{selectedProductCount} item(s) selected</p>

            <div className="dsh-pricing-field">
              <label>Quantity Change (applied to every selected item)</label>
              <input
                type="number" className="dsh-input" placeholder="e.g. -5 or 20" autoFocus
                value={bulkStockDelta}
                onChange={e => setBulkStockDelta(e.target.value)}
              />
            </div>
            <div className="dsh-pricing-field">
              <label>Reason</label>
              <select className="dsh-settings-select" value={bulkStockReason} onChange={e => setBulkStockReason(e.target.value)}>
                {STOCK_UPDATE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--primary" onClick={submitBulkStockUpdate} disabled={bulkStockSaving}>
                {bulkStockSaving ? (<><span className="dsh-spinner" /> Updating...</>) : '✓ Apply to All'}
              </button>
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setBulkStockModalOpen(false)} disabled={bulkStockSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
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

      {upgradeModalOpen && (
        <div className="dsh-modal-back" onClick={() => setUpgradeModalOpen(false)}>
          <div className="dsh-modal" onClick={e => e.stopPropagation()}>
            <h3>📈 Monthly Limit Reached</h3>
            <p className="dsh-logout-text">
              {usageInfo
                ? `You've used ${usageInfo.used}${usageInfo.limit !== null ? ` of ${usageInfo.limit}` : ''} products on the ${usageInfo.planName || usageInfo.plan || 'Free'} plan this month.`
                : "You've reached your monthly plan limit."}
              {' '}Upgrade to continue researching products.
            </p>
            <PlanCards plans={billingPlans} currentPlanKey={usageInfo?.plan} onSelect={changePlan} />
            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setUpgradeModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {plansModalOpen && (
        <div className="dsh-modal-back" onClick={() => setPlansModalOpen(false)}>
          <div className="dsh-modal dsh-modal--wide" onClick={e => e.stopPropagation()}>
            <h3>💳 Compare Plans</h3>
            <p className="dsh-logout-text">Every paid plan starts at just <strong>$5 for your first month</strong>.</p>
            <PlanCards plans={billingPlans} currentPlanKey={usageInfo?.plan} onSelect={changePlan} />
            <div className="dsh-settings-actions">
              <button className="dsh-btn dsh-btn--ghost" onClick={() => setPlansModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;