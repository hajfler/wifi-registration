const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/email.html');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function renderTemplate(data) {
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, value ?? '');
  }
  return html;
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'Dauerhaft';
  return new Date(expiresAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

async function sendWifiCredentials({ to, firstName, lastName, ssid, password, expiresAt, qrCodeBase64 }) {
  const html = renderTemplate({
    FIRST_NAME: firstName,
    LAST_NAME: lastName,
    SSID: ssid,
    PASSWORD: password,
    EXPIRES: formatExpiry(expiresAt),
    QR_CODE: qrCodeBase64,
    YEAR: new Date().getFullYear(),
  });

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `Deine WLAN-Zugangsdaten für ${ssid}`,
    html,
    attachments: [
      {
        filename: 'wifi-qrcode.png',
        content: Buffer.from(qrCodeBase64, 'base64'),
        contentType: 'image/png',
        cid: 'wifiQrCode',
      },
    ],
  });

  console.log(`E-Mail mit WLAN-Zugangsdaten gesendet an: ${to}`);
}

module.exports = { sendWifiCredentials };
