import React, { useState } from 'react';
import '../styles/Auth.css';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    // Simulate API call
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
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
          <h1>AI Agents Platform</h1>
          <p>Login to your dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Email</label>
            <div className="input-wrapper">
              <FiMail size={20} />
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-wrapper">
              <FiLock size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="auth-footer">
          Demo: Use any email/password to login
        </p>
      </div>
    </div>
  );
}

export default Login;