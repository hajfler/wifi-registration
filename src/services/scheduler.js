const cron = require('node-cron');
const { getExpiredActiveRegistrations, deactivateRegistration } = require('../db/database');
const { deletePpsk } = require('./unifi');

async function processExpiredRegistrations() {
  const expired = getExpiredActiveRegistrations();
  if (expired.length === 0) {
    console.log('Scheduler: Keine abgelaufenen WLAN-Zugänge gefunden.');
    return;
  }

  console.log(`Scheduler: ${expired.length} abgelaufene Zugänge werden deaktiviert...`);

  for (const reg of expired) {
    try {
      await deletePpsk(reg.unifi_ppsk_id);
      deactivateRegistration(reg.id);
      console.log(`Scheduler: Zugang deaktiviert für ${reg.email} (abgelaufen: ${reg.expires_at})`);
    } catch (err) {
      console.error(`Scheduler: Fehler bei Deaktivierung für ${reg.email}:`, err.message);
    }
  }
}

function startScheduler() {
  // Täglich um 02:00 Uhr
  cron.schedule('0 2 * * *', async () => {
    console.log('Scheduler: Starte Prüfung auf abgelaufene WLAN-Zugänge...');
    await processExpiredRegistrations();
  });
  console.log('Scheduler: Aktiv – prüft täglich um 02:00 Uhr auf abgelaufene Zugänge');
}

// Für manuellen Test-Aufruf
async function runNow() {
  console.log('Scheduler: Manueller Durchlauf...');
  await processExpiredRegistrations();
}

module.exports = { startScheduler, runNow };
