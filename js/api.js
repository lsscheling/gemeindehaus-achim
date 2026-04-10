// Dynamisch die korrekte API-URL ermitteln
function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function getApiBaseUrl() {
  // 1) Explizit im Window gesetzt (z.B. für Telegram WebApp)
  if (window.__API_BASE_URL) {
    return normalizeBaseUrl(window.__API_BASE_URL);
  }

  // 2) Optional über Query-Param (?apiBase=https://example.com/api)
  const qp = new URLSearchParams(window.location.search);
  const apiBaseFromQuery = qp.get('apiBase');
  if (apiBaseFromQuery) {
    return normalizeBaseUrl(apiBaseFromQuery);
  }

  // 3) Lokal: direkt auf Backend (ohne nginx)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }

  // 4) Standard: gleicher Host auf dediziertem Backend-Port (ohne nginx proxy)
  const url = `${window.location.protocol}//${window.location.hostname}:3001/api`;
  console.log('[API Config] hostname:', window.location.hostname, 'protocol:', window.location.protocol, 'host:', window.location.host);
  return normalizeBaseUrl(url);
}

const API_BASE_URL = getApiBaseUrl();
console.log('[API] Base URL ermittelt:', API_BASE_URL);
console.log('[API] window.location:', window.location.href);

// Globaler Storage für Telegram-Daten
let currentTelegramUser = null;

/**
 * Gibt den aktuellen Telegram-Benutzer zurück
 */
export function getCurrentTelegramUser() {
  return currentTelegramUser;
}
export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('auth_token');
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 12000;
  
  console.log('[apiFetch] Endpoint:', endpoint, 'API_BASE_URL:', API_BASE_URL);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = `${API_BASE_URL}${endpoint}`;
  console.log('[apiFetch] Full URL:', fullUrl, 'Timeout:', timeoutMs, 'ms');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;

  try {
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const errObj = await response.json().catch(() => ({}));
      console.error('[apiFetch] HTTP Error:', response.status, errObj);
      const error = new Error(errObj.error || `HTTP Error ${response.status}`);
      error.status = response.status;
      error.code = errObj.code || null;
      throw error;
    }

    const data = await response.json();
    console.log('[apiFetch] Response:', data);
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms (${endpoint})`);
      timeoutError.code = 'REQUEST_TIMEOUT';
      console.error('[apiFetch] Timeout Error:', timeoutError.message);
      throw timeoutError;
    }
    console.error('[apiFetch] Fetch Error:', e);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Initialisiert die Telegram WebApp, liest die initData und schickt sie
 * an das Backend zur Verifikation. Danach wird das erhaltene JWT lokal gespeichert.
 */
export async function authenticateWithTelegram() {
  const tg = window.Telegram.WebApp;
  tg.ready();

  const initData = tg.initData;

  // Falls wir nicht im Telegram Kontext laufen (also z.B. wenn sich ein Admin direkt im Webbrowser einloggt)
  if (!initData) {
    return false;
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (userStr) {
      currentTelegramUser = JSON.parse(userStr);
      console.log('[API] Telegram User gespeichert:', currentTelegramUser.username || currentTelegramUser.id);
    }

    const res = await fetch(`${API_BASE_URL}/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('auth_token', data.token); // Wir merken uns den Token!
      return data; // Gibt { token, user, registered } zurück
    }
    return false;
  } catch (error) {
    console.error("Fehler bei Telegram-Auth:", error);
    return false;
  }
}
