/**
 * Auth utilities — JWT session tokens via HMAC-SHA256.
 * No external dependencies; uses Node.js built-in crypto.
 */
const crypto = require('crypto');

const COOKIE_NAME = 'wiki_session';
const TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

function createToken(payload) {
  const secret = process.env.SESSION_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRY,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret)
    .update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
  try {
    const secret = process.env.SESSION_SECRET;
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret)
      .update(header + '.' + body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(function (part) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + TOKEN_EXPIRY + '; Secure'
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure'
  );
}

module.exports = {
  createToken,
  verifyToken,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
};
