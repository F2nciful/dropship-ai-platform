-- Create Users Table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'starter',
  subscription_status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Stores Table
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  store_name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  api_key VARCHAR(255),
  api_secret VARCHAR(255),
  store_url VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Products Table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  product_name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  cost DECIMAL(10, 2),
  profit_margin DECIMAL(5, 2),
  quantity_in_stock INTEGER,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Create Orders Table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  order_number VARCHAR(255) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  total_amount DECIMAL(10, 2),
  order_status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  shipping_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Create Agents Table
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id),
  agent_name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'running',
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Tasks Table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  task_description TEXT,
  task_status VARCHAR(50) DEFAULT 'pending',
  result TEXT,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Analytics Table
CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  total_sales DECIMAL(15, 2),
  total_orders INTEGER,
  average_order_value DECIMAL(10, 2),
  conversion_rate DECIMAL(5, 2),
  roi DECIMAL(5, 2),
  date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Create Transactions Table
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  transaction_id VARCHAR(255) UNIQUE,
  payment_method VARCHAR(50),
  amount DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for faster queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_stores_user_id ON stores(user_id);
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_analytics_store_id ON analytics(store_id);
CREATE INDEX idx_transactions_order_id ON transactions(order_id);