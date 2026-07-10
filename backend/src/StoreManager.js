const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, './dropship_ai.db');
const db = new sqlite3.Database(dbPath);

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const initDatabase = async () => {
  try {
    console.log('📊 Initializing SQLite database...');

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Users table ready');

      db.run(`
        CREATE TABLE IF NOT EXISTS agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT DEFAULT 'active'
        )
      `);
      console.log('✅ Agents table ready');

      db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER,
          task_name TEXT NOT NULL,
          status TEXT DEFAULT 'running',
          progress INTEGER DEFAULT 0
        )
      `);
      console.log('✅ Tasks table ready');

      db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER,
          message TEXT NOT NULL,
          level TEXT DEFAULT 'info'
        )
      `);
      console.log('✅ Activity logs table ready');

      db.run(`
        CREATE TABLE IF NOT EXISTS stores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          platform TEXT NOT NULL,
          status TEXT DEFAULT 'active'
        )
      `);
      console.log('✅ Stores table ready');
    });

    console.log('🎉 Database initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
};

module.exports = {
  query,
  initDatabase,
  db
};