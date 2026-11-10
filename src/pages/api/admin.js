import crypto from 'node:crypto';
import { cmd, getBatch, setStock, parse } from '../../lib/redis.js';
import { clean, readBody, send, esc } from '../../lib/util.js';
import { sendMany, wrap } from '../../lib/mail.js';
import { sweep } from '../../lib/holds.js';
import { env } from '../../lib/env.js';

export const prerender = false;

function authed(request) {
  const t = env('ADMIN_TOKEN');
  if (!t) return null;
  const a = Buffer.from((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// { flavour: whole number 0-5000 }, up to 20 flavours. Returns null if anything is off.
function readStock(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const name = clean(k, 40), n = Number(v);
    if (!name || Object.hasOwn(out, name) || !Number.isInteger(n) || n < 0 || n > 5000) return null;
    out[name] = n;
  }
  const count = Object.keys(out).length;
  return count >= 1 && count <= 20 ? out : null;
}

async function snapshot(batchParam) {
  await sweep();
  const { cfg, stock, remaining } = await getBatch();
  const id = Number(batchParam) || (cfg ? cfg.id : 0);
  const [orders, waitlist, held] = await Promise.all([
    id ? cmd('LRANGE', `orders:${id}`, 0, -1) : [],
    cmd('LRANGE', 'waitlist', 0, -1),
    cmd('ZCARD', 'holds'),
  ]);
  return { batch: cfg, stock, remaining, pending: Number(held) || 0, viewing: id, orders: (orders || []).map(parse).filter(Boolean), waitlist: (waitlist || []).map(parse).filter(Boolean) };
}

export async function ALL({ request }) {
  const ok = authed(request);
  if (ok === null) return send(503, { error: 'ADMIN_TOKEN is not set on the server.' });
  if (!ok) return send(401, { error: 'Wrong password.' });

  try {
    if (request.method === 'GET') return send(200, await snapshot(new URL(request.url).searchParams.get('batch')));
    if (request.method !== 'POST') return send(405, { error: 'method_not_allowed' });

    const b = await readBody(request);
    const { cfg } = await getBatch();

    if (b.action === 'open') {
      const flavours = readStock(b.flavours);
      const capacity = flavours ? Object.values(flavours).reduce((a, n) => a + n, 0) : 0;
      if (!flavours || capacity < 1) return send(422, { error: 'Enter a whole number of donuts for each flavour (0-5000), with at least one donut in total.' });
      const id = Number(await cmd('INCR', 'batch:id'));
      await cmd('SET', 'batch:config', { id, label: clean(b.label, 60) || 'Next batch', capacity, flavours, open: true, openedAt: new Date().toISOString() });
      await setStock(flavours);
    } else if (b.action === 'setOpen') {
      if (!cfg) return send(422, { error: 'Open a batch first.' });
      await cmd('SET', 'batch:config', { ...cfg, open: !!b.open });
    } else if (b.action === 'setStock') {
      if (!cfg || !cfg.flavours) return send(422, { error: 'Open a batch first.' });
      const stock = readStock(b.stock);
      if (!stock || Object.keys(stock).some((f) => !Object.hasOwn(cfg.flavours, f))) return send(422, { error: 'Donuts left must be a whole number (0-5000) for each flavour in this batch.' });
      await cmd('HSET', 'batch:stock', ...Object.entries(stock).flat());
    } else if (b.action === 'notify') {
      const { waitlist } = await snapshot();
      const emails = [...new Set(waitlist.map((w) => w.email).filter(Boolean))];
      if (!env('RESEND_API_KEY')) return send(422, { error: 'RESEND_API_KEY is not set, so no emails can be sent.' });
      const subject = clean(b.subject, 120) || "Lyle's next batch is open!";
      const msg = clean(b.message, 600) || 'The next batch is now open for orders. Boxes go fast, so grab yours before they sell out.';
      const html = wrap(`<p style="font-size:16px;line-height:1.6">${esc(msg)}</p>`);
      for (let i = 0; i < emails.length; i += 100) await sendMany(emails.slice(i, i + 100).map((to) => ({ to, subject, html })));
      return send(200, { ok: true, emailed: emails.length, ...(await snapshot()) });
    } else if (b.action === 'clearWaitlist') {
      await cmd('DEL', 'waitlist');
      await cmd('DEL', 'waitlist:keys');
    } else {
      return send(422, { error: 'Unknown action.' });
    }
    return send(200, { ok: true, ...(await snapshot()) });
  } catch (e) {
    console.error('admin_failed', e);
    return send(500, { error: e.message === 'storage_not_configured' ? 'Storage is not connected yet (see README).' : 'Server error.' });
  }
}
