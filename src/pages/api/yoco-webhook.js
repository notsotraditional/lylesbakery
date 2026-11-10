// Yoco calls this when a payment succeeds. This is the only place an order becomes real:
// the customer returning to the success page proves nothing, the signed webhook does.
import { cmd, reserve, getBatch, parse } from '../../lib/redis.js';
import { esc, send, site } from '../../lib/util.js';
import { verifySignature } from '../../lib/yoco.js';
import { sendMail, wrap } from '../../lib/mail.js';
import { env } from '../../lib/env.js';

export const prerender = false;

const money = (n) => 'R' + Number(n).toLocaleString('en-ZA');

async function emails(o, remaining) {
  const where = o.method === 'delivery'
    ? `Delivery to ${esc(o.address.street)}${o.address.complex ? ', ' + esc(o.address.complex) : ''}, ${esc(o.address.suburb)}, Cape Town`
    : 'Collection (Cape Town)';
  const lines = `<p style="font-size:15px;line-height:1.6;margin:0 0 6px"><b>Order ${esc(o.ref)}</b><br>${o.qty} &times; ${o.size}-box (${o.donuts} donuts)<br>${Object.entries(o.flavours).map(([f, c]) => `${c} &times; ${esc(f)}`).join(', ')}<br>Paid: ${money(o.paidAmount / 100)}<br>${where}</p>`;
  const review = o.status !== 'paid' ? `<p style="font-size:15px;line-height:1.6;color:#000"><b>Needs your attention:</b> ${esc(o.note)}<br>Customer was NOT sent a confirmation. Contact them at ${esc(o.email)}.</p>` : '';
  await Promise.allSettled([
    o.status === 'paid' ? sendMail({
      to: o.email,
      subject: `Your Lyle's order ${o.ref}`,
      html: wrap(`<p style="font-size:16px;line-height:1.6">Hi ${esc(o.name.split(' ')[0])}, thank you for your order!</p>${lines}<p style="font-size:15px;line-height:1.6">${esc(site.afterOrderNote)}</p>${o.method === 'collection' ? `<p style="font-size:15px;line-height:1.6">${esc(site.collectionNote)}</p>` : ''}`),
    }) : null,
    env('OWNER_EMAIL') ? sendMail({
      to: env('OWNER_EMAIL'),
      subject: `${o.status === 'paid' ? 'New paid order' : 'CHECK ORDER'} ${o.ref} – ${o.qty} × ${o.size}-box (${o.method})`,
      html: wrap(`${review}<p style="font-size:15px;line-height:1.6"><b>${esc(o.name)}</b><br>${esc(o.email)}</p>${lines}${o.address && o.address.instructions ? `<p style="font-size:14px">Note: ${esc(o.address.instructions)}</p>` : ''}<p style="font-size:14px">${remaining} donuts left in this batch.</p>`),
    }) : null,
  ].filter(Boolean));
}

export async function POST({ request }) {
  const secret = env('YOCO_WEBHOOK_SECRET');
  if (!secret) return send(503, { error: 'webhook_secret_not_set' });

  // Signatures cover the exact bytes Yoco sent, so the body must not be parsed first.
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifySignature(raw, Object.fromEntries(request.headers), secret)) return send(403, { error: 'bad_signature' });

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return send(400, { error: 'bad_json' }); }
  if (!evt || evt.type !== 'payment.succeeded' || !evt.payload) return send(200, { ok: true, ignored: true });

  const p = evt.payload;
  const md = p.metadata || {};
  let claimed = null;
  try {
    // Our own lookup first (checkoutId is the one metadata key Yoco documents), our metadata second.
    const ref = (md.checkoutId && await cmd('GET', 'chk:' + md.checkoutId)) || md.ref;
    if (!ref) { console.error('webhook_unmatched', evt.id); return send(200, { ok: true, unmatched: true }); }

    // Yoco retries until it gets a 2xx, so the same payment can arrive more than once. Process it once.
    if ((await cmd('SET', 'done:' + ref, p.id || evt.id, 'NX')) !== 'OK') return send(200, { ok: true, duplicate: true });
    claimed = ref;

    const hold = parse(await cmd('GET', 'hold:' + ref));
    if (!hold) { console.error('webhook_no_hold', ref, p.id); return send(200, { ok: true, unmatched: true }); }

    const { cfg } = await getBatch();
    const stillHeld = Number(await cmd('ZREM', 'holds', ref)) === 1; // if so, the donuts are already set aside for this order
    let status = 'paid', note = '';
    if (!cfg || cfg.id !== hold.batchId) {
      status = 'review'; note = 'A new batch was opened before this payment arrived, so no donuts were set aside for it.';
    } else if (!stillHeld && (await reserve(hold.picks)) < 0) {
      status = 'review'; note = 'This payment arrived after the 20-minute hold ran out and the donuts have since sold. Refund the customer in Yoco, or fulfil it yourself.';
    }
    if (p.amount !== hold.amount) {
      status = 'review'; note = `${note} Amount paid (${money(p.amount / 100)}) differs from the order total (${money(hold.amount / 100)}).`.trim();
    }

    const order = { ...hold.order, status, note, paymentId: p.id, paidAt: new Date().toISOString(), paidAmount: p.amount, mode: p.mode };
    await cmd('RPUSH', `orders:${hold.batchId}`, order);
    await emails(order, (await getBatch()).remaining);
    return send(200, { ok: true, status });
  } catch (e) {
    console.error('webhook_failed', e);
    if (claimed) await cmd('DEL', 'done:' + claimed).catch(() => {}); // let Yoco's retry try again
    return send(500, { error: 'server_error' });
  }
}

export const ALL = () => send(405, { error: 'method_not_allowed' });
