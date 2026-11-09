const { cmd, getBatch } = require('./_lib/redis');
const { clean, EMAIL_RE, normPhone, readBody, send } = require('./_lib/util');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const b = readBody(req);
  if (clean(b.company, 100)) return send(res, 200, { ok: true });

  const errors = {};
  const rawEmail = clean(b.email, 254).toLowerCase();
  const rawPhone = clean(b.phone, 30);
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : '';
  const phone = rawPhone ? normPhone(rawPhone) : null;
  if (rawEmail && !email) errors.email = 'That email address does not look right.';
  if (rawPhone && !phone) errors.phone = 'Please enter a valid WhatsApp number, e.g. 082 123 4567.';
  if (!rawEmail && !rawPhone) errors.email = 'Please add your email, your WhatsApp number, or both.';
  if (Object.keys(errors).length) return send(res, 422, { error: 'invalid', errors });

  try {
    const keys = [email && 'e:' + email, phone && 'p:' + phone].filter(Boolean);
    let fresh = 0;
    for (const k of keys) fresh += Number(await cmd('SADD', 'waitlist:keys', k));
    if (fresh > 0) {
      const { cfg } = await getBatch();
      await cmd('RPUSH', 'waitlist', { email, phone: phone || '', createdAt: new Date().toISOString(), afterBatch: cfg ? cfg.id : 0 });
    }
    send(res, 200, { ok: true });
  } catch (e) {
    console.error('waitlist_failed', e);
    send(res, 500, { error: 'server_error' });
  }
};
