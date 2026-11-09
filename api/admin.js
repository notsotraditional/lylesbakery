const crypto = require('crypto');
const { cmd, getBatch, parse } = require('./_lib/redis');
const { clean, readBody, send, esc } = require('./_lib/util');
const { sendMany, wrap } = require('./_lib/mail');

function authed(req) {
  const t = process.env.ADMIN_TOKEN;
  if (!t) return null;
  const a = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function snapshot(batchParam) {
  const { cfg, remaining } = await getBatch();
  const id = Number(batchParam) || (cfg ? cfg.id : 0);
  const [orders, waitlist] = await Promise.all([
    id ? cmd('LRANGE', `orders:${id}`, 0, -1) : [],
    cmd('LRANGE', 'waitlist', 0, -1),
  ]);
  return { batch: cfg, remaining, viewing: id, orders: (orders || []).map(parse).filter(Boolean), waitlist: (waitlist || []).map(parse).filter(Boolean) };
}

module.exports = async (req, res) => {
  const ok = authed(req);
  if (ok === null) return send(res, 503, { error: 'ADMIN_TOKEN is not set on the server.' });
  if (!ok) return send(res, 401, { error: 'Wrong password.' });

  try {
    if (req.method === 'GET') return send(res, 200, await snapshot(req.query && req.query.batch));
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });

    const b = readBody(req);
    const { cfg } = await getBatch();

    if (b.action === 'open') {
      const capacity = Number(b.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) return send(res, 422, { error: 'Capacity must be a whole number of donuts (1-5000).' });
      const id = Number(await cmd('INCR', 'batch:id'));
      await cmd('SET', 'batch:config', { id, label: clean(b.label, 60) || 'Next batch', capacity, open: true, openedAt: new Date().toISOString() });
      await cmd('SET', 'batch:remaining', capacity);
    } else if (b.action === 'setOpen') {
      if (!cfg) return send(res, 422, { error: 'Open a batch first.' });
      await cmd('SET', 'batch:config', { ...cfg, open: !!b.open });
    } else if (b.action === 'setRemaining') {
      const r = Number(b.remaining);
      if (!Number.isInteger(r) || r < 0 || r > 5000) return send(res, 422, { error: 'Remaining must be a whole number.' });
      await cmd('SET', 'batch:remaining', r);
    } else if (b.action === 'notify') {
      const { waitlist } = await snapshot();
      const emails = [...new Set(waitlist.map((w) => w.email).filter(Boolean))];
      if (!process.env.RESEND_API_KEY) return send(res, 422, { error: 'RESEND_API_KEY is not set, so no emails can be sent.' });
      const subject = clean(b.subject, 120) || "Lyle's next batch is open!";
      const msg = clean(b.message, 600) || 'The next batch is now open for orders. Boxes go fast, so grab yours before they sell out.';
      const html = wrap(`<p style="font-size:16px;line-height:1.6">${esc(msg)}</p>`);
      for (let i = 0; i < emails.length; i += 100) await sendMany(emails.slice(i, i + 100).map((to) => ({ to, subject, html })));
      return send(res, 200, { ok: true, emailed: emails.length, ...(await snapshot()) });
    } else if (b.action === 'clearWaitlist') {
      await cmd('DEL', 'waitlist');
      await cmd('DEL', 'waitlist:keys');
    } else {
      return send(res, 422, { error: 'Unknown action.' });
    }
    send(res, 200, { ok: true, ...(await snapshot()) });
  } catch (e) {
    console.error('admin_failed', e);
    send(res, 500, { error: e.message === 'storage_not_configured' ? 'Storage is not connected yet (see README).' : 'Server error.' });
  }
};
