export const API_URL = 'http://localhost:5000/api';
export const RESEARCH_API_URL = 'http://127.0.0.1:8000/api';

// Shared fetch wrapper for the authenticated Express endpoints — attaches the stored JWT,
// bounces to Login on a 401 (stateless JWT means an expired/invalid token can't be
// refreshed in place), and throws with the backend's real error message on failure.
export async function authFetch(base, path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.reload();
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
