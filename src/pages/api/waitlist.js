import { cmd, getBatch } from '../../lib/redis.js';
import { clean, EMAIL_RE, normPhone, readBody, send } from '../../lib/util.js';

export const prerender = false;

export async function POST({ request }) {
  const b = await readBody(request);
  if (clean(b.company, 100)) return send(200, { ok: true });

  const errors = {};
  const rawEmail = clean(b.email, 254).toLowerCase();
  const rawPhone = clean(b.phone, 30);
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : '';
  const phone = rawPhone ? normPhone(rawPhone) : null;
  if (rawEmail && !email) errors.email = 'That email address does not look right.';
  if (rawPhone && !phone) errors.phone = 'Please enter a valid WhatsApp number, e.g. 082 123 4567.';
  if (!rawEmail && !rawPhone) errors.email = 'Please add your email, your WhatsApp number, or both.';
  if (Object.keys(errors).length) return send(422, { error: 'invalid', errors });

  try {
    const keys = [email && 'e:' + email, phone && 'p:' + phone].filter(Boolean);
    let fresh = 0;
    for (const k of keys) fresh += Number(await cmd('SADD', 'waitlist:keys', k));
    if (fresh > 0) {
      const { cfg } = await getBatch();
      await cmd('RPUSH', 'waitlist', { email, phone: phone || '', createdAt: new Date().toISOString(), afterBatch: cfg ? cfg.id : 0 });
    }
    return send(200, { ok: true });
  } catch (e) {
    console.error('waitlist_failed', e);
    return send(500, { error: 'server_error' });
  }
}

export const ALL = () => send(405, { error: 'method_not_allowed' });
