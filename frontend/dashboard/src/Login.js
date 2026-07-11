import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin }) {
  const [dark, setDark] = useState(() => localStorage.getItem('dsh-theme') !== 'light');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('dsh-theme', next ? 'dark' : 'light');
  };

  const handleLogin = (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    setTimeout(() => {
      const user = {
        id: 1,
        email: email,
        name: email.split('@')[0]
      };

      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', 'fake-jwt-token-' + Date.now());

      onLogin(user);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className={`login ${dark ? 'login--dark' : 'login--light'}`}>
      <button type="button" className="login-theme-toggle" onClick={toggleDark} aria-label="Toggle theme">
        {dark ? '☀️' : '🌙'}
      </button>

      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-mark">◆</div>
          <h1 className="login-brand-name">Nexus</h1>
          <p className="login-tagline">Intelligent Commerce Platform</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div className="login-error">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="login-field">
            <label>Email</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">✉️</span>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="login-field">
            <label>Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="login-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner" />
                Logging in...
              </>
            ) : 'Login'}
          </button>
        </form>

        <p className="login-footer">
          Demo: Use any email/password to login
        </p>
      </div>
    </div>
  );
}

export default Login;
