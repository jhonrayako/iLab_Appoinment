import { API_URL } from '../visitorApi';

export async function adminRequest(path, options = {}) {
  let auth;
  try {
    auth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
  } catch {
    throw new Error('Your admin session could not be read. Please sign in again.');
  }

  const headers = new Headers(options.headers || {});
  if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || 'Unable to complete the request.');
  }
  return data;
}
