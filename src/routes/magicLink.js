const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { createMagicLink } = require('../db/database');
const { sendMagicLink } = require('../services/email');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /magic-link – Anfrage-Formular
router.get('/', (_req, res) => {
  res.sendFile('magic-link.html', { root: 'public' });
});

// POST /magic-link/request – Magic Link generieren und senden
// Wird von unserem eigenen AJAX-Formular (JSON) UND von WordPress-Formularen (Form-POST) aufgerufen.
router.post('/request', requestLimiter, [
  body('email').trim().isEmail().withMessage('Bitte eine gültige E-Mail-Adresse eingeben.').normalizeEmail(),
], async (req, res) => {
  const isJson = req.is('application/json');

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (isJson) return res.status(400).json({ errors: errors.array() });
    return res.redirect('/magic-link?error=email');
  }

  const { email } = req.body;
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const token = createMagicLink(email);
    const magicLinkUrl = `${baseUrl}/?token=${token}`;
    await sendMagicLink({ to: email, magicLinkUrl });
  } catch (err) {
    console.error('Magic Link Fehler:', err.message);
    // Kein Fehler nach aussen – verhindert E-Mail-Enumeration
  }

  // Immer Erfolg zurückgeben
  if (isJson) return res.json({ success: true });
  res.redirect('/magic-link?sent=1');
});

module.exports = router;
