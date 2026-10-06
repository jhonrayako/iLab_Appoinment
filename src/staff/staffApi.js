export const STAFF_STORAGE_KEY = 'ilab_staff_auth';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export { API_URL };

export function getStaffAuth() {
  try {
    return JSON.parse(localStorage.getItem(STAFF_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function staffRequest(path, options = {}) {
  const auth = getStaffAuth();
  const headers = new Headers(options.headers || {});
  if (auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}/staff${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || 'Unable to complete the request.');
  }
  return data;
}

export function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatStaffDate(value, options = {}) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(value));
}