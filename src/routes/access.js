const express = require('express');
const path = require('path');
const { makeToken, parseCookies, setCookie } = require('../middleware/auth');

const router = express.Router();

const REGISTER_PASSWORD = process.env.REGISTER_PASSWORD;
const COOKIE_NAME = 'register_access';
const COOKIE_MAX_AGE = 4 * 60 * 60; // 4 Stunden

function isAuthorized(req) {
  if (!REGISTER_PASSWORD) return true; // Kein Passwort gesetzt → offen
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] === makeToken(REGISTER_PASSWORD);
}

// Middleware: schützt die Registrierungsseite
function requireAccess(req, res, next) {
  if (isAuthorized(req)) return next();
  res.redirect('/access');
}

// GET /access – Zugangscode-Seite
router.get('/', (req, res) => {
  if (isAuthorized(req)) return res.redirect('/');
  res.sendFile('access.html', { root: path.join(__dirname, '../../public') });
});

// POST /access – Zugangscode prüfen
router.post('/', express.urlencoded({ extended: false }), (req, res) => {
  const { password } = req.body;
  if (password === REGISTER_PASSWORD) {
    setCookie(res, COOKIE_NAME, makeToken(REGISTER_PASSWORD), COOKIE_MAX_AGE);
    return res.redirect('/');
  }
  res.redirect('/access?error=1');
});

module.exports = { router, requireAccess };
