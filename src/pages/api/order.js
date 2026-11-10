// Starts an order: checks the form, holds the donuts, and returns a Yoco payment page to send the customer to.
// The order itself is only saved once Yoco confirms payment (see yoco-webhook.js).
import { cmd, reserve, release, getBatch } from '../../lib/redis.js';
import { site, SUBURBS, clean, EMAIL_RE, readBody, send } from '../../lib/util.js';
import { createCheckout } from '../../lib/yoco.js';
import { sweep, HOLD_MINUTES } from '../../lib/holds.js';
import { env } from '../../lib/env.js';

export const prerender = false;

export async function POST({ request }) {
  const b = await readBody(request);

  // Honeypot: real people never fill this hidden field.
  if (clean(b.company, 100)) return send(200, { ok: true, ref: 'LB-0000' });

  const errors = {};
  const size = Number(b.size);
  if (!site.boxes.includes(size)) errors.size = 'Choose a box size.';
  const qty = Number(b.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > site.maxBoxesPerOrder) errors.qty = 'Choose how many boxes.';
  const name = clean(b.name, 80);
  if (name.length < 2) errors.name = 'Please enter your name.';
  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  const method = b.method;
  if (method !== 'delivery' && method !== 'collection') errors.method = 'Choose delivery or collection.';

  let address = null;
  if (method === 'delivery') {
    const street = clean(b.street, 120);
    const suburb = SUBURBS.get(clean(b.suburb, 80).toLowerCase());
    if (street.length < 3) errors.street = 'Please enter your street address.';
    if (!suburb) errors.suburb = 'We only deliver to Cape Town and its suburbs. Please pick your suburb from the list.';
    address = { street, complex: clean(b.complex, 80), suburb, city: 'Cape Town', instructions: clean(b.instructions, 200) };
  }
  if (Object.keys(errors).length) return send(422, { error: 'invalid', errors });

  try {
    // Payments need a price and a Yoco key; say so plainly instead of taking an order we cannot charge for.
    const price = site.prices && site.prices[size];
    if (!env('YOCO_SECRET_KEY') || typeof price !== 'number' || !(price > 0)) return send(503, { error: 'not_configured' });

    await sweep();
    const { cfg, stock } = await getBatch();
    if (!cfg || !cfg.open) return send(409, { error: 'sold_out' });

    // Flavours: { name: count }, only this batch's flavours, adding up to exactly the donuts in the order.
    const donuts = size * qty;
    const raw = b.flavours && typeof b.flavours === 'object' && !Array.isArray(b.flavours) ? b.flavours : {};
    const picks = {};
    let picked = 0, bad = false;
    for (const [f, v] of Object.entries(raw)) {
      const c = Number(v);
      if (!Object.hasOwn(stock, f) || !Number.isInteger(c) || c < 0) { bad = true; break; }
      if (c > 0) { picks[f] = c; picked += c; }
    }
    if (bad || picked !== donuts) return send(422, { error: 'invalid', errors: { flavours: `Choose exactly ${donuts} donuts.` } });

    // Hold the donuts while the customer pays. All or nothing, atomically.
    if ((await reserve(picks)) < 0) {
      const now = await getBatch();
      return send(409, { error: now.remaining < Math.min(...site.boxes) ? 'sold_out' : 'not_enough', remaining: now.remaining });
    }

    try {
      const ref = 'LB-' + String(await cmd('INCR', 'order:counter')).padStart(4, '0');
      const total = price * qty;
      const amount = Math.round(total * 100); // cents
      const base = (env('SITE_URL') || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`).replace(/\/+$/, '');
      const mix = Object.entries(picks).map(([f, c]) => `${c} ${f}`).join(', ');

      const checkout = await createCheckout({
        amount,
        successUrl: `${base}/?paid=${ref}`,
        cancelUrl: `${base}/?cancelled=${ref}`,
        failureUrl: `${base}/?failed=${ref}`,
        metadata: { ref, batchId: String(cfg.id) },
        externalId: ref,
        idempotencyKey: ref,
        lineItems: [{ displayName: `${size}-box (${donuts} donuts)`, description: mix, quantity: qty, pricingDetails: { price: price * 100 } }],
      });

      const expiresAt = Date.now() + HOLD_MINUTES * 60000;
      const order = { ref, batchId: cfg.id, batchLabel: cfg.label, createdAt: new Date().toISOString(), name, email, size, qty, donuts, flavours: picks, method, address, total };
      await Promise.all([
        cmd('SET', 'hold:' + ref, { order, picks, batchId: cfg.id, amount, checkoutId: checkout.id, expiresAt }, 'EX', 2592000),
        cmd('SET', 'chk:' + checkout.id, ref, 'EX', 2592000),
        cmd('ZADD', 'holds', expiresAt, ref),
      ]);

      return send(200, { ok: true, ref, redirectUrl: checkout.redirectUrl, donuts, total });
    } catch (e) {
      await release(picks).catch(() => {}); // give the donuts back
      throw e;
    }
  } catch (e) {
    console.error('order_failed', e);
    if (e.message === 'yoco_not_configured') return send(503, { error: 'not_configured' });
    if (String(e.message).startsWith('yoco_')) return send(502, { error: 'payment_unavailable' });
    return send(500, { error: 'server_error' });
  }
}

export const ALL = () => send(405, { error: 'method_not_allowed' });
