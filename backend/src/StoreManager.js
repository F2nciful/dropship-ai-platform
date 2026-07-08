import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiEye, FiRefreshCw } from 'react-icons/fi';
import './StoreManager.css';

function StoreManager({ setView }) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [storePerformance, setStorePerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');

  // جلب الـ Stores من API
  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/stores');
      const data = await res.json();
      setStores(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stores:', error);
      setLoading(false);
    }
  };

  const fetchStorePerformance = async (storeId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/stores/${storeId}/performance`);
      const data = await res.json();
      setStorePerformance(data);
    } catch (error) {
      console.error('Error fetching performance:', error);
    }
  };

  const handleViewStore = (store) => {
    setSelectedStore(store);
    fetchStorePerformance(store.id);
    setActiveTab('details');
  };

  return (
    <>
      {setView && (
        <button 
          onClick={() => setView('dashboard')}
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            background: '#00ff41',
            color: '#0a0a0a',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 999,
            fontSize: '0.9em'
          }}
        >
          ← Back to Dashboard
        </button>
      )}
      <div className="store-manager">
        <div className="store-header">
          <h2>🏪 Store Management</h2>
          <button className="btn-add-store">
            <FiPlus /> Add New Store
          </button>
        </div>

        {/* TABS */}
        <div className="store-tabs">
          <button 
            className={`tab ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            All Stores ({stores.length})
          </button>
          {selectedStore && (
            <button 
              className={`tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              {selectedStore.name}
            </button>
          )}
        </div>

        {/* STORES LIST */}
        {activeTab === 'list' && (
          <div className="stores-list">
            {loading ? (
              <p className="loading">Loading stores...</p>
            ) : stores.length === 0 ? (
              <p className="empty">No stores found</p>
            ) : (
              stores.map(store => (
                <div key={store.id} className="store-card">
                  <div className="store-info">
                    <div className="store-name">
                      <h3>{store.name}</h3>
                      <span className={`badge ${store.status}`}>{store.status.toUpperCase()}</span>
                    </div>
                    <p className="platform">📱 {store.platform}</p>
                    
                    <div className="store-stats">
                      <div className="stat">
                        <span className="label">Products</span>
                        <span className="value">{store.products}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Orders</span>
                        <span className="value">{store.orders}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Revenue</span>
                        <span className="value">{store.revenue}</span>
                      </div>
                    </div>
                  </div>

                  <div className="store-actions">
                    <button 
                      className="btn-view"
                      onClick={() => handleViewStore(store)}
                    >
                      <FiEye /> View
                    </button>
                    <button className="btn-edit">
                      <FiEdit2 /> Edit
                    </button>
                    <button className="btn-delete">
                      <FiTrash2 /> Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* STORE DETAILS */}
        {activeTab === 'details' && selectedStore && storePerformance && (
          <div className="store-details">
            <div className="details-header">
              <h3>{selectedStore.name}</h3>
              <button onClick={() => fetchStorePerformance(selectedStore.id)} className="btn-refresh">
                <FiRefreshCw /> Refresh
              </button>
            </div>

            {/* PERFORMANCE METRICS */}
            <div className="performance-section">
              <h4>Performance Metrics</h4>
              
              <div className="metrics-grid">
                <div className="metric-card">
                  <h5>Revenue</h5>
                  <div className="metric-values">
                    <div className="value-item">
                      <span>Today</span>
                      <span className="amount">{storePerformance.revenue.today}</span>
                    </div>
                    <div className="value-item">
                      <span>This Week</span>
                      <span className="amount">{storePerformance.revenue.week}</span>
                    </div>
                    <div className="value-item">
                      <span>This Month</span>
                      <span className="amount">{storePerformance.revenue.month}</span>
                    </div>
                  </div>
                </div>

                <div className="metric-card">
                  <h5>Orders</h5>
                  <div className="metric-values">
                    <div className="value-item">
                      <span>Today</span>
                      <span className="amount">{storePerformance.orders.today}</span>
                    </div>
                    <div className="value-item">
                      <span>This Week</span>
                      <span className="amount">{storePerformance.orders.week}</span>
                    </div>
                    <div className="value-item">
                      <span>This Month</span>
                      <span className="amount">{storePerformance.orders.month}</span>
                    </div>
                  </div>
                </div>

                <div className="metric-card">
                  <h5>Customers</h5>
                  <div className="metric-values">
                    <div className="value-item">
                      <span>New</span>
                      <span className="amount">{storePerformance.customers.new}</span>
                    </div>
                    <div className="value-item">
                      <span>Returning</span>
                      <span className="amount">{storePerformance.customers.returning}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TOP PRODUCTS */}
            <div className="top-products">
              <h4>Top Products</h4>
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {storePerformance.topProducts.map((product, idx) => (
                    <tr key={idx}>
                      <td>{product.name}</td>
                      <td>{product.sold}</td>
                      <td>{product.revenue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default StoreManager;