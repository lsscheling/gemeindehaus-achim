# TODO: Gemeindehaus Achim Anmeldung Fix

## Current Status
- [x] API-URL-Ermittlung in `js/api.js` robust für Telegram WebApp machen
- [x] URL-Normalisierung (Trailing Slash) ergänzen

## Anmelde Button Fix (laufend)
- [ ] 1. supabase_schema.sql prüfen → Tables 'users', 'gemeinden', 'gewerke_konfig', 'levels' + Columns validieren
- [ ] 2. Backend/DB Status checken → docker-compose up wenn nötig
- [x] 3a. Frontend Debug: `anmeldung.html` handleSubmit() → console.log/toast bei jedem Step + API Errors
- [x] 3b. `js/api.js` → apiFetch error → user-friendly toast
- [ ] 4. Vollständigen Flow testen → browser_action: Form ausfüllen → submit → Backend logs checken
- [ ] 5. Supabase Schema fixen falls mismatch
- [ ] 6. Final cleanup debug code

**Nächster Step:** supabase_schema.sql lesen
