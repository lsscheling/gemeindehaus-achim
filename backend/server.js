const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');

// Umgebungsvariablen laden (nur für lokale Entwicklung, im Docker sind die direkt davor geschaltet)
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Frontend statisch ausliefern (im Container unter /app/public)
const frontendRoot = '/app/public';
app.use(express.static(frontendRoot));

// Logge jeden Request!
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// Supabase Client mit Service Role (erlaubt vollen Zugriff aufs Backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Konstanten
const JWT_SECRET = process.env.JWT_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;

// ==========================================
// HILFSFUNKTIONEN
// ==========================================

// Telegram initData verifizieren (Muss exakt den Vorgaben von Telegram entsprechen)
function verifyTelegramWebAppData(telegramInitData) {
  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');
  let dataToCheck = [];
  
  initData.sort();
  initData.forEach((val, key) => {
    if (key !== 'hash') {
      dataToCheck.push(`${key}=${val}`);
    }
  });

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataToCheck.join('\n')).digest('hex');

  return calculatedHash === hash;
}

// Token Middleware für Routen, die einen eingeloggten Nutzer erfordern
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==========================================
// ROUTEN
// ==========================================

// Startseite ausliefern
app.get('/', (req, res) => {
  return res.sendFile(path.join(frontendRoot, 'index.html'));
});

// 1. Telegram Auth
app.post('/api/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ error: 'initData missing' });

    // Verifizieren der Signatur
    if (!verifyTelegramWebAppData(initData)) {
      console.error('[API] Telegram Auth fehlgeschlagen! Falscher BOT_TOKEN?');
      return res.status(401).json({ error: 'Invalid Telegram signature' });
    }

    // User Logik
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return res.status(400).json({ error: 'No user data inside initData' });
    
    const tgUser = JSON.parse(userStr);
    console.log('[API] Authentifiziere User:', tgUser.id);

    // Existiert der Nutzer schon in der DB?
    const { data: dbUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', tgUser.id)
      .single();

    const isRegistered = !!dbUser;

    // JWT erstellen
    const tokenPayload = {
      telegram_id: tgUser.id,
      user_id: dbUser ? dbUser.id : null,
      registered: isRegistered,
      role: 'helfer'
    };
    
    // Gültig für 30 Tage
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' });

    return res.json({ token, user: dbUser || tgUser, registered: isRegistered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Bot fragt an: Ist Telegram-User registriert?
app.get('/api/check-user', async (req, res) => {
  try {
    const telegramId = req.query.telegram_id;
    if (!telegramId) return res.status(400).json({ error: 'telegram_id param missing' });

    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (data) {
      return res.json({ registered: true });
    } else {
      return res.json({ registered: false });
    }
  } catch(e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// 3. Eigenes Profil laden
app.get('/api/me', authenticateToken, async (req, res) => {
  if (!req.user.telegram_id) return res.status(400).json({ error: 'Not a telegram user' });
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', req.user.telegram_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'User not found' });
  return res.json(data);
});

// 4. Anmeldung speichern / bearbeiten
app.post('/api/anmeldung', authenticateToken, async (req, res) => {
  if (!req.user.telegram_id) return res.status(400).json({ error: 'Not a telegram user' });
  
  const telegram_id = req.user.telegram_id;
  const payload = req.body;
  
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', telegram_id)
    .single();
    
  let result;

  if (existingUser) {
    result = await supabase
      .from('users')
      .update({
        telegram_username: payload.telegram_username || null,
        vorname: payload.vorname,
        nachname: payload.nachname,
        telefon: payload.telefon,
        gemeinde: payload.gemeinde || null,
        schichtarbeit: payload.schichtarbeit || false,
        gewerke: payload.gewerke || [],
        erfahrung: payload.erfahrung || {},
        qualifikationen: payload.qualifikationen || '',
        gruppenwunsch: payload.gruppenwunsch || '',
        status: payload.status || 'angemeldet',
        updated_at: new Date()
      })
      .eq('telegram_id', telegram_id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('users')
      .insert({
        telegram_id: telegram_id,
        telegram_username: payload.telegram_username || null,
        vorname: payload.vorname,
        nachname: payload.nachname,
        telefon: payload.telefon,
        gemeinde: payload.gemeinde || null,
        schichtarbeit: payload.schichtarbeit || false,
        gewerke: payload.gewerke || [],
        erfahrung: payload.erfahrung || {},
        qualifikationen: payload.qualifikationen || '',
        gruppenwunsch: payload.gruppenwunsch || '',
        status: payload.status || 'angemeldet'
      })
      .select()
      .single();
  }
  
  if (result.error) {
    console.error('❌ Supabase Error bei Anmeldung:', result.error);
    return res.status(500).json({ error: result.error.message });
  }
  console.log('✅ Daten gespeichert!', result.data);
  return res.json(result.data);
});

// 5. Gewerke abfragen (öffentlich, für das Formular)
app.get('/api/gewerke', async (req, res) => {
  const { data: gewerke } = await supabase.from('gewerke_konfig').select('*').order('sort_order', { ascending: true });
  const { data: levels } = await supabase.from('levels').select('*');
  return res.json({ gewerke: gewerke || [], levels: levels || [] });
});

// 6. Gemeinden abfragen (öffentlich, für das Formular)
app.get('/api/gemeinden', async (req, res) => {
  const { data: gemeinden } = await supabase.from('gemeinden').select('*').eq('active', true).order('sort_order', { ascending: true });
  return res.json({ gemeinden: gemeinden || [] });
});

// ==========================================
// GEWERKE ADMIN ROUTEN
// ==========================================

// 5b. Gewerke speichern (Admin) – ersetzt die gesamte Liste per Upsert
app.put('/api/admin/gewerke', authenticateAdmin, async (req, res) => {
  const { gewerke, levels } = req.body;
  if (!Array.isArray(gewerke) || !Array.isArray(levels)) {
    return res.status(400).json({ error: 'gewerke und levels müssen Arrays sein' });
  }

  // Gewerke: alle vorhandenen löschen und neu einfügen
  const { error: delGwErr } = await supabase.from('gewerke_konfig').delete().neq('id', '__never__');
  if (delGwErr) return res.status(500).json({ error: delGwErr.message });

  if (gewerke.length > 0) {
    const rows = gewerke.map((g, i) => ({
      id:              g.id,
      name:            g.name,
      active:          g.active ?? true,
      visible_in_form: g.visibleInForm ?? true,
      kategorie:       g.kategorie || null,
      sort_order:      g.sortOrder ?? i,
      levels:          g.levels || [],
      color:           g.color || null,
      min_persons:     g.minPersons || 1,
    }));
    const { error: insGwErr } = await supabase.from('gewerke_konfig').insert(rows);
    if (insGwErr) return res.status(500).json({ error: insGwErr.message });
  }

  // Levels: alle vorhandenen löschen und neu einfügen
  const { error: delLvErr } = await supabase.from('levels').delete().neq('id', '__never__');
  if (delLvErr) return res.status(500).json({ error: delLvErr.message });

  if (levels.length > 0) {
    const lvRows = levels.map(l => ({ id: l.id, name: l.name, color: l.color || null }));
    const { error: insLvErr } = await supabase.from('levels').insert(lvRows);
    if (insLvErr) return res.status(500).json({ error: insLvErr.message });
  }

  return res.json({ success: true });
});

// ==========================================
// ADMIN ROUTEN (für das Dashboard)
// ==========================================

// Token Middleware für Admins
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user.is_admin) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// 6. Admin Login
app.post('/api/auth/admin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Bitte E-Mail und Passwort eingeben' });
  
  // Supabase Auth nutzen
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return res.status(401).json({ error: 'Falsches Passwort oder E-Mail' });
  
  // Rolle aus admin_users holen
  const { data: roleData } = await supabase.from('admin_users').select('rolle, team').eq('id', data.user.id).single();
  
  // Unser eigenes JWT für das Backend erstellen
  const token = jwt.sign({
    is_admin: true,
    user_id: data.user.id,
    email: data.user.email,
    role: roleData?.rolle || 'teamleiter',
    team: roleData?.team
  }, JWT_SECRET, { expiresIn: '7d' });
  
  return res.json({ token, user: { email: data.user.email, role: roleData?.rolle, team: roleData?.team } });
});

// 7. Alle Anmeldungen laden
app.get('/api/admin/anmeldungen', authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// 8. Anmeldung bearbeiten/zuweisen
app.patch('/api/admin/anmeldungen/:id', authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase.from('users').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// 8b. Anmeldung löschen
app.delete('/api/admin/anmeldungen/:id', authenticateAdmin, async (req, res) => {
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// 9. Admin-Nutzerliste laden
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase.from('admin_users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// 10. Neuen Admin anlegen (nur für Admins)
app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
  
  const { email, password, rolle, team } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Fehlende Daten' });
  
  // Im Supabase Auth als admin anlegen (Dafür brauchen wir die service_role)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (authError) return res.status(400).json({ error: authError.message });
  
  const { data, error } = await supabase.from('admin_users').insert({
    id: authData.user.id,
    email,
    rolle,
    team: team || null
  }).select().single();
  
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// 11. Admin löschen
app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
  
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend läuft auf Port ${PORT}`);
});
