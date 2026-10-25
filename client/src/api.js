export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const KEY = 'paylink:session';
let memorySession = null; // fallback when localStorage is unavailable

export function getSession() {
  if (memorySession) return memorySession;
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  memorySession = session;
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable - session lives in memory only */
  }
}

/** Calls the API. Sends the merchant's JWT when signed in; a 401 on a signed-in call signs the user out. */
export async function api(path, { method = 'GET', body } = {}) {
  const session = getSession();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && session?.token && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('paylink:unauthorized'));
    }
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const kes = (n) => `KES ${Number(n || 0).toLocaleString('en-US')}`;
