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
// Prefix für API-Pfade:
// UniFi OS (UDM/UDM Pro):      /proxy/network
// Klassischer Controller:       (leer)
let apiPrefix = '';

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
  // UniFi OS Console (UDM, UDM Pro, Cloud Key Gen2+): /api/auth/login  → API prefix: /proxy/network
  // Klassischer Controller (selbst gehostet):          /api/login       → API prefix: (leer)
  const variants = [
    { endpoint: '/api/auth/login', prefix: '/proxy/network' },
    { endpoint: '/api/login',      prefix: '' },
  ];
  let lastError;
  for (const { endpoint, prefix } of variants) {
    try {
      const response = await client.post(endpoint, {
        username: UNIFI_USERNAME,
        password: UNIFI_PASSWORD,
      });
      extractCookies(response);
      apiPrefix = prefix;
      console.log(`UniFi: Login erfolgreich via ${endpoint} (API-Prefix: "${prefix || '(keiner)'}")`);
      return;
    } catch (err) {
      console.log(`UniFi: Login via ${endpoint} fehlgeschlagen (${err.response?.status ?? err.message})`);
      lastError = err;
    }
  }
  throw lastError;
}

async function ensureSession() {
  if (!sessionCookies) {
    await login();
    return;
  }
  // Session validieren
  try {
    await client.get(`${apiPrefix}/api/s/${UNIFI_SITE}/self`, {
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
  const response = await client.get(`${apiPrefix}/api/s/${UNIFI_SITE}/rest/wlanconf`, {
    headers: { Cookie: sessionCookies },
  });
  extractCookies(response);
  const wlans = response.data.data;
  const wlan = wlans.find(w => w.name === UNIFI_WLAN_NAME);
  if (!wlan) {
    throw new Error(`WLAN "${UNIFI_WLAN_NAME}" nicht gefunden. Verfügbar: ${wlans.map(w => w.name).join(', ')}`);
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
    password,
    wlan_conf_id: wlanId,
    ...(expiresAt ? { expires: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    note: `Registrierung: ${email}`,
  };

  // UniFi PPSK API Endpunkt
  let response;
  try {
    response = await client.post(
      `${apiPrefix}/api/s/${UNIFI_SITE}/rest/psk`,
      ppskData,
      { headers: { Cookie: sessionCookies } }
    );
  } catch (err) {
    console.error('UniFi PPSK Request-Body:', JSON.stringify(ppskData));
    console.error('UniFi PPSK Response-Body:', JSON.stringify(err.response?.data));
    throw err;
  }
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
      `${apiPrefix}/api/s/${UNIFI_SITE}/rest/psk/${ppskId}`,
      { headers: { Cookie: sessionCookies } }
    );
    console.log(`UniFi: PPSK ${ppskId} gelöscht`);
  } catch (err) {
    console.error(`UniFi: Fehler beim Löschen von PPSK ${ppskId}:`, err.message);
  }
}

module.exports = { createPpsk, deletePpsk };
