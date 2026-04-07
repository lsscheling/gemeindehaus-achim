/**
 * Migration Script: Firebase Gewerke → Supabase
 * 
 * Dieses Script liest die Gewerke und Levels aus Firebase
 * und speichert sie in Supabase.
 * 
 * WICHTIG: Du benötigst Firebase Admin Credentials!
 * 1. Lade die JSON von Firebase Console herunter (Service Account Key)
 * 2. Speichere sie als `firebase-credentials.json` im backend/ Ordner
 * 3. Führe aus: node migrate-gewerke.js
 */

// ── Im Docker: Env-Vars sind schon gesetzt
// ── Lokal: .env laden
require('dotenv').config();

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ============================================
// SETUP: Firebase
// ============================================
let firebaseApp;
try {
  // Versuche, firebase-credentials.json zu laden
  const credPath = path.join(__dirname, 'firebase-credentials.json');
  if (!fs.existsSync(credPath)) {
    console.error('❌ firebase-credentials.json nicht gefunden!');
    console.error('   Bitte lade die Service Account Key vom Firebase Console herunter.');
    console.error('   Speichere sie als: backend/firebase-credentials.json');
    process.exit(1);
  }
  
  const serviceAccount = require(credPath);
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialisiert');
} catch (e) {
  console.error('❌ Firebase Init Error:', e.message);
  process.exit(1);
}

const firebaseDb = admin.firestore();

// ============================================
// SETUP: Supabase
// ============================================
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  console.log('✅ Supabase Client initialisiert');
} catch (e) {
  console.error('❌ Supabase Init Error:', e.message);
  process.exit(1);
}

// ============================================
// MIGRATION
// ============================================
async function migrate() {
  console.log('\n📦 Starte Migration: Firebase → Supabase\n');

  try {
    // 1. Lese Gewerke und Levels aus Firebase
    console.log('📖 Lese Gewerke aus Firebase...');
    const gewerkeSnap = await firebaseDb.doc('planung/gewerkeKonfig').get();
    
    if (!gewerkeSnap.exists) {
      console.error('❌ Firebase Dokument "planung/gewerkeKonfig" existiert nicht!');
      process.exit(1);
    }

    const firebaseData = gewerkeSnap.data();
    const firebaseGewerke = firebaseData.gewerke || [];
    const firebaseLevels = firebaseData.levels || [];

    console.log(`   ✓ ${firebaseGewerke.length} Gewerke gefunden`);
    console.log(`   ✓ ${firebaseLevels.length} Levels gefunden`);

    // 2. Transformiere Daten in Supabase-Format
    console.log('\n🔄 Transformiere Daten...');
    const supabaseGewerke = firebaseGewerke.map((g, idx) => ({
      id:              g.id || 'gw_' + idx,
      name:            g.name || '',
      active:          g.active ?? true,
      visible_in_form: g.visibleInForm ?? true,
      kategorie:       g.kategorie || null,
      sort_order:      g.sort_order ?? idx,
      levels:          g.levels || [],
      color:           g.color || null,
      min_persons:     g.minPersons || g.min_persons || 1,
    }));

    const supabaseLevels = firebaseLevels.map(l => ({
      id:    l.id || '',
      name:  l.name || '',
      color: l.color || null,
    }));

    console.log('   ✓ Gewerke transformiert');
    console.log('   ✓ Levels transformiert');

    // 3. Speichere in Supabase (DELETE + INSERT für sauberen Zustand)
    console.log('\n💾 Speichere in Supabase...');
    
    // Lösche alte Gewerke
    const { error: delGwErr } = await supabase
      .from('gewerke_konfig')
      .delete()
      .neq('id', '__never__');
    
    if (delGwErr) {
      console.error('❌ Fehler beim Löschen alter Gewerke:', delGwErr.message);
      process.exit(1);
    }
    console.log('   ✓ Alte Gewerke gelöscht');

    // Schreibe neue Gewerke
    if (supabaseGewerke.length > 0) {
      const { error: insGwErr } = await supabase
        .from('gewerke_konfig')
        .insert(supabaseGewerke);
      
      if (insGwErr) {
        console.error('❌ Fehler beim Einfügen von Gewerken:', insGwErr.message);
        process.exit(1);
      }
      console.log(`   ✓ ${supabaseGewerke.length} Gewerke eingefügt`);
    }

    // Lösche alte Levels
    const { error: delLvErr } = await supabase
      .from('levels')
      .delete()
      .neq('id', '__never__');
    
    if (delLvErr) {
      console.error('❌ Fehler beim Löschen alter Levels:', delLvErr.message);
      process.exit(1);
    }
    console.log('   ✓ Alte Levels gelöscht');

    // Schreibe neue Levels
    if (supabaseLevels.length > 0) {
      const { error: insLvErr } = await supabase
        .from('levels')
        .insert(supabaseLevels);
      
      if (insLvErr) {
        console.error('❌ Fehler beim Einfügen von Levels:', insLvErr.message);
        process.exit(1);
      }
      console.log(`   ✓ ${supabaseLevels.length} Levels eingefügt`);
    }

    // 4. Verifizierung
    console.log('\n✅ Verifizierung...');
    const { count: gwCount } = await supabase
      .from('gewerke_konfig')
      .select('*', { count: 'exact', head: true });
    
    const { count: lvCount } = await supabase
      .from('levels')
      .select('*', { count: 'exact', head: true });

    console.log(`   ✓ Supabase: ${gwCount} Gewerke`);
    console.log(`   ✓ Supabase: ${lvCount} Levels`);

    console.log('\n🎉 Migration erfolgreich abgeschlossen!\n');
    console.log('📝 Nächste Schritte:');
    console.log('   1. Teste gewerke.html im Browser');
    console.log('   2. Die Admin-Seite sollte jetzt die Gewerke laden');
    console.log('   3. Firebase-Daten kannst du später löschen\n');

    process.exit(0);

  } catch (err) {
    console.error('❌ Unerwarteter Fehler:', err);
    process.exit(1);
  }
}

// Start
migrate();
