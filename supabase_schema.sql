-- 1. Tabelle für die Angemeldeten Helfer (Telegram Nutzer)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     BIGINT UNIQUE,
  vorname         TEXT,
  nachname        TEXT,
  telefon         TEXT,
  schichtarbeit   BOOLEAN DEFAULT false,
  qualifikationen TEXT,
  gruppenwunsch   TEXT,
  status          TEXT DEFAULT 'entwurf',  -- 'entwurf'|'angemeldet'|'final'
  team            TEXT,
  teams           JSONB DEFAULT '[]',       -- [{team, von, bis}]
  gewerke         TEXT[],                  -- Array von Gewerk-IDs
  erfahrung       JSONB DEFAULT '{}',       -- {gewerk_id: level_id}
  abwesenheiten   JSONB DEFAULT '[]',       -- [{von, bis}]
  schichtplan     JSONB DEFAULT '{}',       -- {mo:'frueh', di:'frei', ...}
  registered_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabelle für Dashboard-Admins (verknüpft mit Supabase Auth)
CREATE TABLE admin_users (
  id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email  TEXT NOT NULL,
  rolle  TEXT NOT NULL DEFAULT 'teamleiter',  -- 'admin'|'teamleiter'
  team   TEXT
);

-- 3. Tabelle für Gewerke-Konfiguration
CREATE TABLE gewerke_konfig (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  levels           TEXT[] DEFAULT '{}',
  active           BOOLEAN DEFAULT true,
  visible_in_form  BOOLEAN DEFAULT true,
  kategorie        TEXT,
  sort_order       INT DEFAULT 0,
  color            TEXT,                   -- Hex-Farbe, z.B. '#2d6a4f'
  min_persons      INT DEFAULT 1
);

-- 4. Tabelle für Level (Erfahrungsstufen)
CREATE TABLE levels (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT                               -- Hex-Farbe, z.B. '#2d6a4f'
);

-- ── Migration für bestehende Datenbanken ──
-- (Nur ausführen wenn die Tabelle bereits existiert!)
-- ALTER TABLE gewerke_konfig ADD COLUMN IF NOT EXISTS color TEXT;
-- ALTER TABLE gewerke_konfig ADD COLUMN IF NOT EXISTS min_persons INT DEFAULT 1;
-- ALTER TABLE levels         ADD COLUMN IF NOT EXISTS color TEXT;

-- Row Level Security (RLS) aktivieren
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gewerke_konfig ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;

-- RLS Policies für users
-- Die Backend-API greift als "service_role" zu, daher ignoriert sie RLS weitesgehend.
CREATE POLICY "Public read access to users via API" ON users FOR SELECT USING (true);
CREATE POLICY "Public insert access to users via API" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access to users via API" ON users FOR UPDATE USING (true);

CREATE POLICY "Public read access to gewerke_konfig" ON gewerke_konfig FOR SELECT USING (true);
CREATE POLICY "Public read access to levels" ON levels FOR SELECT USING (true);
CREATE POLICY "Public read access to admin_users" ON admin_users FOR SELECT USING (true);
