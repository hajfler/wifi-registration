require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDb } = require('./src/db/database');
const registrationRouter = require('./src/routes/registration');
const adminRouter = require('./src/routes/admin');
const magicLinkRouter = require('./src/routes/magicLink');
const { requireMagicLink } = require('./src/middleware/magicLink');
const { startScheduler } = require('./src/services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Reverse Proxy vertrauen (Coolify / Traefik)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting: max. 5 Registrierungen pro IP pro Stunde
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Anfragen von dieser IP. Bitte versuche es in einer Stunde erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Magic-Link-Routen (öffentlich zugänglich)
app.use('/magic-link', magicLinkRouter);

// Registrierungsformular: nur mit gültigem Magic-Link zugänglich
app.get('/', requireMagicLink, (_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});
app.get('/success.html', requireMagicLink, (_req, res) => {
  res.sendFile('success.html', { root: 'public' });
});

// Routes
app.use('/register', registrationLimiter, requireMagicLink, registrationRouter);
app.use('/admin', adminRouter);

// Datenbankinitialisierung und Server-Start
initDb();
startScheduler();

app.listen(PORT, () => {
  console.log(`WLAN-Registrierungsportal läuft auf http://localhost:${PORT}`);
});
