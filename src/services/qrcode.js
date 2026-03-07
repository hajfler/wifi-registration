const QRCode = require('qrcode');

/**
 * Generiert einen WiFi-QR-Code als Base64-PNG.
 * Format: WIFI:T:WPA;S:<ssid>;P:<password>;;
 * Kompatibel mit iOS (ab 11) und Android (ab 10) Kamera-App.
 */
async function generateWifiQrCode(ssid, password) {
  const wifiString = `WIFI:T:WPA;S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};;`;

  const dataUrl = await QRCode.toDataURL(wifiString, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
  });

  // Gibt nur den Base64-Teil zurück (ohne "data:image/png;base64,")
  return dataUrl.split(',')[1];
}

// Sonderzeichen im WIFI QR-Code escapen
function escapeWifiField(value) {
  return value.replace(/([\\";,])/g, '\\$1');
}

module.exports = { generateWifiQrCode };
