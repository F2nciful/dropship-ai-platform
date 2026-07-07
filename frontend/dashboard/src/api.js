// API configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Agents API calls
export const agentsAPI = {
  // Get all agents status
  getAgentsStatus: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/status`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching agents status:', error);
      return null;
    }
  },

  // Get specific agent details
  getAgentDetails: async (agentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${agentId}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching agent details:', error);
      return null;
    }
  },

  // Start a task for an agent
  startTask: async (agentId, taskData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${agentId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      return await response.json();
    } catch (error) {
      console.error('Error starting task:', error);
      return null;
    }
  },

  // Get agent task history
  getTaskHistory: async (agentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/${agentId}/history`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching task history:', error);
      return null;
    }
  }
};

// Products API calls
export const productsAPI = {
  // Get all products
  getAllProducts: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  },

  // Add new product
  addProduct: async (productData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      return await response.json();
    } catch (error) {
      console.error('Error adding product:', error);
      return null;
    }
  },

  // Update product
  updateProduct: async (productId, productData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating product:', error);
      return null;
    }
  }
};

// Orders API calls
export const ordersAPI = {
  // Get all orders
  getAllOrders: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  },

  // Create new order
  createOrder: async (orderData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating order:', error);
      return null;
    }
  },

  // Update order status
  updateOrderStatus: async (orderId, status) => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating order:', error);
      return null;
    }
  }
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await fetch(`${API_BASE_URL.replace('/api', '')}/api/health`);
    return await response.json();
  } catch (error) {
    console.error('Backend is not running:', error);
    return null;
  }
};