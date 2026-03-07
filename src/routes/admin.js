const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { deletePpsk } = require('../services/unifi');

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000; // 8 Stunden

function makeToken(password) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(password).digest('hex');
}

function isAuthenticated(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return token === makeToken(ADMIN_PASSWORD);
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.redirect('/admin/login');
}

// Cookie-Parser (mini, ohne extra Dependency)
router.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('='));
  });
  next();
});

// GET /admin → redirect
router.get('/', requireAuth, (req, res) => {
  res.redirect('/admin/dashboard');
});

// GET /admin/login
router.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin/dashboard');
  res.sendFile('login.html', { root: 'public/admin' });
});

// POST /admin/login
router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = makeToken(ADMIN_PASSWORD);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE / 1000}; Path=/`);
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/admin/login?error=1');
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Max-Age=0; Path=/`);
  res.redirect('/admin/login');
});

// GET /admin/dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile('dashboard.html', { root: 'public/admin' });
});

// GET /admin/api/registrations – JSON für Dashboard
router.get('/api/registrations', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, first_name, last_name, email, phone, password,
           expires_at, is_active, created_at
    FROM registrations
    ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// DELETE /admin/api/registrations/:id – Zugang widerrufen
router.delete('/api/registrations/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

  if (!reg) return res.status(404).json({ error: 'Nicht gefunden' });

  try {
    await deletePpsk(reg.unifi_ppsk_id);
  } catch (err) {
    console.error('Admin: PPSK löschen fehlgeschlagen:', err.message);
  }

  db.prepare('UPDATE registrations SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
