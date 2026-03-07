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

async function getWlan() {
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
  return wlan;
}

async function getWlanId() {
  return (await getWlan())._id;
}

async function getNetworkId() {
  const networkName = process.env.UNIFI_NETWORK_NAME;
  if (!networkName) return null;
  await ensureSession();
  const response = await client.get(`${apiPrefix}/api/s/${UNIFI_SITE}/rest/networkconf`, {
    headers: { Cookie: sessionCookies },
  });
  extractCookies(response);
  const networks = response.data.data;
  const network = networks.find(n => n.name === networkName);
  if (!network) {
    console.warn(`UniFi: Netzwerk "${networkName}" nicht gefunden. Verfügbar: ${networks.map(n => n.name).join(', ')}`);
    return null;
  }
  console.log(`UniFi: Netzwerk "${networkName}" gefunden (ID: ${network._id})`);
  return network._id;
}

/**
 * Erstellt einen PPSK-Eintrag für einen User im UniFi Controller.
 * Gibt die PPSK-ID zurück.
 *
 * UniFi PPSK Datenstruktur (Network Application 7.x+):
 * Der PPSK wird als Eintrag in der "private_preshared_key" Tabelle angelegt.
 */
async function createPpsk({ firstName, lastName, password, expiresAt }) {
  await ensureSession();
  const [wlanId, networkId] = await Promise.all([getWlanId(), getNetworkId()]);

  // Vollständiges WLAN-Objekt laden um PPSK-Struktur zu verstehen
  const wlan = await getWlan();
  console.log('UniFi WLAN-Objekt (PPSK-relevante Felder):', JSON.stringify({
    _id: wlan._id,
    name: wlan.name,
    private_preshared_keys: wlan.private_preshared_keys,
    psk_group: wlan.psk_group,
    wpa_mode: wlan.wpa_mode,
    ...Object.fromEntries(Object.entries(wlan).filter(([k]) => k.toLowerCase().includes('psk') || k.toLowerCase().includes('password'))),
  }));

  // PPSK zur bestehenden Liste hinzufügen und WLAN aktualisieren
  const existingKeys = wlan.private_preshared_keys || [];
  const newKey = {
    password,
    network_conf_id: networkId,
    ...(expiresAt ? { expires: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
  };
  const updatedKeys = [...existingKeys, newKey];

  let response;
  try {
    response = await client.put(
      `${apiPrefix}/api/s/${UNIFI_SITE}/rest/wlanconf/${wlan._id}`,
      { ...wlan, private_preshared_keys: updatedKeys },
      { headers: { Cookie: sessionCookies } }
    );
  } catch (err) {
    console.error('UniFi WLAN PUT Request:', JSON.stringify({ private_preshared_keys: updatedKeys }));
    console.error('UniFi WLAN PUT Response:', JSON.stringify(err.response?.data));
    throw err;
  }
  extractCookies(response);

  // ID des neuen Eintrags zurückgeben
  const saved = response.data.data?.[0]?.private_preshared_keys?.find(k => k.password === password);
  return saved?._id || password;
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
