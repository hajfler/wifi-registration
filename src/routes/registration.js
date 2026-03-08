const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { upsertRegistration, findActiveByEmail } = require('../db/database');
const { createPpsk } = require('../services/unifi');
const { generateWifiQrCode } = require('../services/qrcode');
const { sendWifiCredentials } = require('../services/email');

const router = express.Router();

const SSID = process.env.UNIFI_WLAN_NAME;

// Zugangsdauer in Tage umrechnen
const DURATION_MAP = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '60d': 60,
  'permanent': null,
};

function calculateExpiry(duration) {
  const days = DURATION_MAP[duration];
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// Validierungsregeln
const validators = [
  body('first_name').trim().notEmpty().withMessage('Vorname ist erforderlich.').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Nachname ist erforderlich.').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Bitte eine gültige E-Mail-Adresse eingeben.').normalizeEmail(),
  body('email_confirm').trim().custom((value, { req }) => {
    if (value !== req.body.email) throw new Error('E-Mail-Adressen stimmen nicht überein.');
    return true;
  }),
  body('phone').trim().notEmpty().withMessage('Telefonnummer ist erforderlich.')
    .matches(/^[\d\s+\-().]{6,20}$/).withMessage('Ungültige Telefonnummer.'),
  body('duration').optional().isIn(Object.keys(DURATION_MAP)).withMessage('Ungültige Zugangsdauer.'),
];

router.post('/', validators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { first_name, last_name, email, phone, duration = '1d' } = req.body;

  // Doppelregistrierung prüfen – nur blockieren wenn noch aktiv & nicht abgelaufen
  if (findActiveByEmail(email)) {
    return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert und der Zugang ist noch aktiv.' });
  }

  const password = generatePassword();
  const expiresAt = calculateExpiry(duration);

  let unifi_ppsk_id = null;

  try {
    unifi_ppsk_id = await createPpsk({
      firstName: first_name,
      lastName: last_name,
      email,
      password,
      expiresAt,
    });
  } catch (err) {
    console.error('UniFi PPSK Fehler:', err.message);
    return res.status(502).json({ error: 'WLAN-Zugang konnte nicht angelegt werden. Bitte wende dich an den Administrator.' });
  }

  // In Datenbank speichern (Update wenn E-Mail bereits existiert, sonst Insert)
  upsertRegistration({ first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at: expiresAt });

  // QR-Code generieren und E-Mail senden
  try {
    const qrCodeBase64 = await generateWifiQrCode(SSID, password);
    await sendWifiCredentials({
      to: email,
      firstName: first_name,
      lastName: last_name,
      ssid: SSID,
      password,
      expiresAt,
      qrCodeBase64,
    });
  } catch (err) {
    console.error('E-Mail Fehler:', err.message);
    // Registrierung war erfolgreich – E-Mail-Fehler ist nicht kritisch
  }

  res.json({ success: true });
});

module.exports = router;
