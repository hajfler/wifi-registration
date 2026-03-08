/**
 * IP-Whitelist Middleware
 * Unterstützt einzelne IPs (192.168.1.1) und CIDR-Blöcke (172.16.15.0/24)
 */

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isInCidr(ip, cidr) {
  if (!cidr.includes('/')) {
    return ip === cidr;
  }
  const [network, bits] = cidr.split('/');
  const mask = bits === '32' ? 0xFFFFFFFF : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function isAllowed(ip, ranges) {
  if (!ip) return false;
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) normalisieren
  const normalizedIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return ranges.some(range => isInCidr(normalizedIp, range.trim()));
}

function parseRanges(envValue) {
  if (!envValue) return [];
  return envValue.split(',').map(s => s.trim()).filter(Boolean);
}

function createIpWhitelist() {
  const ranges = parseRanges(process.env.ALLOWED_IPS);

  if (ranges.length === 0) {
    // Keine Einschränkung konfiguriert – alles erlaubt
    return (_req, _res, next) => next();
  }

  console.log(`IP-Whitelist aktiv: ${ranges.join(', ')}`);

  return (req, res, next) => {
    const ip = req.ip;
    if (isAllowed(ip, ranges)) return next();
    console.warn(`IP-Whitelist: Zugriff verweigert für ${ip} auf ${req.path}`);
    res.status(403).send(`
      <!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kein Zugriff</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;
      height:100vh;margin:0;background:#f0f4f8;}
      .box{text-align:center;padding:40px;background:#fff;border-radius:12px;
      box-shadow:0 4px 20px rgba(0,0,0,.1);}h1{color:#1e293b}p{color:#64748b}</style></head>
      <body><div class="box"><h1>🚫 Kein Zugriff</h1>
      <p>Diese Seite ist nur aus dem Schulnetzwerk erreichbar.</p>
      <p style="font-size:12px;color:#94a3b8">IP: ${ip}</p></div></body></html>
    `);
  };
}

module.exports = { createIpWhitelist };
