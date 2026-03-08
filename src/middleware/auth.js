const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function makeToken(password) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(password).digest('hex');
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function setCookie(res, name, value, maxAgeSeconds) {
  res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}; Path=/`);
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; HttpOnly; Max-Age=0; Path=/`);
}

module.exports = { makeToken, parseCookies, setCookie, clearCookie };
