// Database configuration and connection
const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dropship_ai'
});

// Connection error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Query function with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`✅ Query executed in ${duration}ms`);
    return res;
  } catch (error) {
    console.error('❌ Database error:', error.message);
    throw error;
  }
};

// Initialize database tables
const initDatabase = async () => {
  try {
    console.log('📊 Initializing database...');

    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table ready');

    // Agents table
    await query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        uptime DECIMAL(5,2) DEFAULT 99.0,
        tasks_completed INTEGER DEFAULT 0,
        last_task VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Agents table ready');

    // Tasks table
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        task_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'running',
        progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tasks table ready');

    // Activity logs table
    await query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        message VARCHAR(500) NOT NULL,
        level VARCHAR(50) DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Activity logs table ready');

    // Stores table
    await query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        platform VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        products_count INTEGER DEFAULT 0,
        orders_count INTEGER DEFAULT 0,
        revenue DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Stores table ready');

    console.log('🎉 Database initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
};

module.exports = {
  query,
  initDatabase,
  pool
};