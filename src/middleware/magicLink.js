const { findValidMagicLink } = require('../db/database');

function requireMagicLink(req, res, next) {
  const token = req.query.token || req.body?.token;

  if (!token) {
    return res.status(403).send(errorPage(
      'Kein Zugriffslink',
      'Bitte verwende den Magic-Link aus deiner E-Mail, um auf das Registrierungsformular zuzugreifen.',
      req
    ));
  }

  const link = findValidMagicLink(token);
  if (!link) {
    return res.status(403).send(errorPage(
      'Link abgelaufen oder ungültig',
      'Dein Zugriffslink ist abgelaufen oder ungültig. Bitte fordere über das Formular einen neuen Link an.',
      req
    ));
  }

  next();
}

function errorPage(title, message, req) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – Schule Dietlikon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="page-wrapper">
    <header class="site-header">
      <img src="/assets/logo.svg" alt="Schule Dietlikon" width="193" height="46">
    </header>
    <div class="card">
      <div class="card-header">
        <div class="page-icon">🔒</div>
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
      <div class="card-body" style="text-align:center;padding-bottom:32px;">
        <a href="${baseUrl}/magic-link" class="btn-submit" style="display:inline-block;text-decoration:none;padding:14px 28px;">
          Neuen Zugriffslink anfordern
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { requireMagicLink };
