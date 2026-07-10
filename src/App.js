import './theme.css';
import './animations.css';
import React, { useState, useEffect } from 'react';
import './App.css';
import Login from './Login';
import Dashboard from './Dashboard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) {
    return <div style={{ background: '#0a0a0a', height: '100vh' }} />;
  }

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  return <Login onLogin={setUser} />;
}

export default App;