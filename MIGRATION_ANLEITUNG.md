# Firebase → Supabase Gewerke Migration

## Problem
Die Gewerke-Daten liegen noch in Firebase (`planung/gewerkeKonfig`), aber der Backend versucht sie von Supabase zu laden. Das Script migriert sie vollautomatisch.

## Voraussetzungen
- ✅ Supabase Project mit den Tabellen `gewerke_konfig` und `levels` (siehe `supabase_schema.sql`)
- ✅ Firebase Service Account Key (JSON)
- ✅ Node.js 14+

## Schritt-für-Schritt

### 1. Firebase Service Account Key downloaden
1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt: `gemeindehaus-achim`
3. Gehe zu **Project Settings** (Gear-Icon oben links)
4. Reiter: **Service Accounts**
5. Klick: **Generate New Private Key**
6. Die JSON wird heruntergeladen

### 2. JSON in den Backend-Ordner kopieren
```bash
# Windows (von Download-Folder)
copy C:\Users\<YourUser>\Downloads\gemeindehaus-achim-*.json .\backend\firebase-credentials.json

# macOS / Linux
cp ~/Downloads/gemeindehaus-achim-*.json ./backend/firebase-credentials.json
```

### 3. Dependencies installieren (falls noch nicht geschehen)
```bash
cd backend
npm install
```

Das installiert auch `firebase-admin@^12.0.0` die wir gerade hinzugefügt haben.

### 4. Migration ausführen (lokal oder im Container)

**Lokal:**
```bash
cd backend
node migrate-gewerke.js
```

**Im Docker-Container:**
```bash
# When container is running:
docker exec gemeindehaus_backend node migrate-gewerke.js
```

### 5. Das war's! 🎉

Das Script wird:
- ✅ Alle Gewerke aus Firebase lesen
- ✅ Alle in Supabase schreiben
- ✅ Alte Einträge löschen (clean slate)
- ✅ Verifizieren, dass alles angekommen ist
- ✅ Die firebase-credentials.json wird **nicht** gelöscht (sicher zum Wiederholen)

## Verifikation

Nach der Migration:
1. Öffne [gewerke.html](../gewerke.html) im Browser → sollte alle Gewerke laden ✅
2. Prüfe [dashboard.html](../dashboard.html) → Gewerke sollten im Anmeldeformular erscheinen
3. Logs im Backend: `GET /api/gewerke` sollte 200 sein

## Fehlerbehandlung

### ❌ "firebase-credentials.json nicht gefunden"
→ Du hast die JSON nicht im `backend/` Ordner gespeichert. Siehe Schritt 2.

### ❌ "Firestore permission denied"
→ Der Service Account hat keine Rechte. In Firebase Console:
1. **Database** → **Firestore Database**
2. **Security Rules**: Mache sie temporär öffentlich zum Testen:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

### ❌ "SUPABASE_URL oder SUPABASE_SERVICE_KEY nicht gesetzt"
→ Backend `.env` ist nicht geladen. Prüfe:
- `backend/.env` existiert und hat `SUPABASE_URL` und `SUPABASE_SERVICE_KEY`
- Du führst das Script aus `backend/` Ordner aus

## Danach: Firebase Admin Code entfernen

Nachdem Migration erfolgreich war, kannst du optional:
1. `firebase-credentials.json` löschen (nicht pushen!)
2. Firebase Admin SDK aus `package.json` entfernen
3. `migrate-gewerke.js` in Archiv verschieben

Aber es schadet nicht, das Script zu behalten für zukünftige Daten-Syncs!

## Rollback?

Falls etwas schief geht:
1. Alte Gewerke von Firebase sind immer noch da
2. Du kannst jederzeit das Script neu ausführen
3. Oder manuell in Supabase löschen + Firebase-Daten nochmal importieren
