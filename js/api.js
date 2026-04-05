const API_BASE_URL = '/api';

/**
 * Führt einen API Request aus inkl. Authentifizierungstoken aus localStorage.
 */
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
