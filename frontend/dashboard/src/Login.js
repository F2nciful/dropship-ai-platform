import React, { useState } from 'react';
import './Login.css';
import { API_URL } from './api';

function Login({ onLogin }) {
  const [dark, setDark] = useState(() => localStorage.getItem('dsh-theme') !== 'light');
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password || (mode === 'register' && !name)) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const path = mode === 'register' ? '/users/register' : '/users/login';
      const body = mode === 'register' ? { name, email, password } : { email, password };
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.message || 'Something went wrong');
        setLoading(false);
        return;
      }

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) {
      setError('Could not reach the server — please try again');
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error">
              <span>⚠️</span>
              {error}
            </div>
          )}

          {mode === 'register' && (
            <div className="login-field">
              <label>Name</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">👤</span>
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
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
                {mode === 'register' ? 'Creating account...' : 'Logging in...'}
              </>
            ) : (mode === 'register' ? 'Create Account' : 'Login')}
          </button>
        </form>

        <p className="login-footer">
          {mode === 'login' ? (
            <>New here? <button type="button" className="login-mode-toggle" onClick={() => { setMode('register'); setError(''); }}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" className="login-mode-toggle" onClick={() => { setMode('login'); setError(''); }}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}

export default Login;
