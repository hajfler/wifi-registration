const axios = require('axios');
const https = require('https');

const UNIFI_HOST = process.env.UNIFI_HOST;
const UNIFI_USERNAME = process.env.UNIFI_USERNAME;
const UNIFI_PASSWORD = process.env.UNIFI_PASSWORD;
const UNIFI_SITE = process.env.UNIFI_SITE || 'default';
const UNIFI_WLAN_NAME = process.env.UNIFI_WLAN_NAME;
const REJECT_UNAUTHORIZED = process.env.UNIFI_REJECT_UNAUTHORIZED !== 'false';

// Axios-Instanz mit persistentem Cookie-Jar (Session-Reuse)
const httpsAgent = new https.Agent({ rejectUnauthorized: REJECT_UNAUTHORIZED });

let sessionCookies = null;

const client = axios.create({
  baseURL: UNIFI_HOST,
  httpsAgent,
  withCredentials: true,
  timeout: 15000,
});

// Cookie aus Response speichern
function extractCookies(response) {
  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    sessionCookies = setCookie.map(c => c.split(';')[0]).join('; ');
  }
}

async function login() {
  const response = await client.post('/api/auth/login', {
    username: UNIFI_USERNAME,
    password: UNIFI_PASSWORD,
  });
  extractCookies(response);
  console.log('UniFi: Login erfolgreich');
}

async function ensureSession() {
  if (!sessionCookies) {
    await login();
    return;
  }
  // Session validieren
  try {
    await client.get(`/proxy/network/api/s/${UNIFI_SITE}/self`, {
      headers: { Cookie: sessionCookies },
    });
  } catch {
    // Session abgelaufen – neu einloggen
    sessionCookies = null;
    await login();
  }
}

async function getWlanId() {
  await ensureSession();
  const response = await client.get(`/proxy/network/api/s/${UNIFI_SITE}/rest/wlanconf`, {
    headers: { Cookie: sessionCookies },
  });
  extractCookies(response);
  const wlans = response.data.data;
  const wlan = wlans.find(w => w.name === UNIFI_WLAN_NAME);
  if (!wlan) {
    throw new Error(`WLAN "${UNIFI_WLAN_NAME}" nicht im UniFi Controller gefunden. Verfügbar: ${wlans.map(w => w.name).join(', ')}`);
  }
  return wlan._id;
}

/**
 * Erstellt einen PPSK-Eintrag für einen User im UniFi Controller.
 * Gibt die PPSK-ID zurück.
 *
 * UniFi PPSK Datenstruktur (Network Application 7.x+):
 * Der PPSK wird als Eintrag in der "private_preshared_key" Tabelle angelegt.
 */
async function createPpsk({ firstName, lastName, email, password, expiresAt }) {
  await ensureSession();
  const wlanId = await getWlanId();

  const ppskData = {
    name: `${firstName} ${lastName}`,
    passphrase: password,
    wlan_id: wlanId,
    ...(expiresAt ? { end_time: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    note: `Registrierung: ${email}`,
  };

  // UniFi PPSK API Endpunkt
  const response = await client.post(
    `/proxy/network/api/s/${UNIFI_SITE}/rest/psk`,
    ppskData,
    { headers: { Cookie: sessionCookies } }
  );
  extractCookies(response);

  const created = response.data.data?.[0];
  return created?._id || null;
}

/**
 * Deaktiviert/löscht einen PPSK-Eintrag anhand der ID.
 */
async function deletePpsk(ppskId) {
  if (!ppskId) return;
  await ensureSession();
  try {
    await client.delete(
      `/proxy/network/api/s/${UNIFI_SITE}/rest/psk/${ppskId}`,
      { headers: { Cookie: sessionCookies } }
    );
    console.log(`UniFi: PPSK ${ppskId} gelöscht`);
  } catch (err) {
    console.error(`UniFi: Fehler beim Löschen von PPSK ${ppskId}:`, err.message);
  }
}

module.exports = { createPpsk, deletePpsk };
