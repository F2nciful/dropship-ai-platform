import './theme.css';
import './animations.css';
import React, { useState, useEffect } from 'react';
import './App.css';
import Login from './Login';
import Dashboard from './Dashboard';
import { API_URL, authFetch } from './api';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Validate the stored token against the backend rather than blindly trusting
    // localStorage['user'] — this also refreshes role/plan if an admin changed them.
    authFetch(API_URL, '/users/me')
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      })
      .catch(() => {
        // authFetch already clears storage + reloads on a 401; any other failure
        // (e.g. backend down) just falls back to the login screen for this load.
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    // Stateless JWT, no server-side session to invalidate — clearing storage is the logout.
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