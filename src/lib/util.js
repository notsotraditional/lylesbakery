import suburbs from '../../public/data/suburbs.json';
import site from '../../public/data/site.json';

export { suburbs, site };

export const SUBURBS = new Map();
for (const list of Object.values(suburbs)) for (const s of list) SUBURBS.set(s.toLowerCase(), s);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// South African numbers (082 123 4567, +27 82 123 4567) or any international +number.
export function normPhone(raw) {
  const d = clean(raw, 30).replace(/[\s\-().]/g, '');
  if (/^0\d{9}$/.test(d)) return '+27' + d.slice(1);
  if (/^27\d{9}$/.test(d)) return '+' + d;
  if (/^\+\d{8,15}$/.test(d)) return d;
  return null;
}

export async function readBody(request) {
  const b = await request.json().catch(() => ({}));
  return b && typeof b === 'object' ? b : {};
}

export const send = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
