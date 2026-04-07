// Dynamisch die korrekte API-URL ermitteln
function getApiBaseUrl() {
  // Lokal: http://localhost:3000/api
  // Production (Proxmox): http://<domain>/api (nginx leitet weiter)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  // Production: nutze den Server, von dem die Seite geladen wird
  return `${window.location.protocol}//${window.location.host}/api`;
}

const API_BASE_URL = getApiBaseUrl();
console.log('[API] Base URL:', API_BASE_URL);

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

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.error || `HTTP Error ${response.status}`);
  }

  return response.json();
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
