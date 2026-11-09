const suburbs = require('../../public/data/suburbs.json');
const site = require('../../public/data/site.json');

const SUBURBS = new Map();
for (const list of Object.values(suburbs)) for (const s of list) SUBURBS.set(s.toLowerCase(), s);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// South African numbers (082 123 4567, +27 82 123 4567) or any international +number.
function normPhone(raw) {
  const d = clean(raw, 30).replace(/[\s\-().]/g, '');
  if (/^0\d{9}$/.test(d)) return '+27' + d.slice(1);
  if (/^27\d{9}$/.test(d)) return '+' + d;
  if (/^\+\d{8,15}$/.test(d)) return d;
  return null;
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function send(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

module.exports = { suburbs, site, SUBURBS, esc, clean, EMAIL_RE, normPhone, readBody, send };
