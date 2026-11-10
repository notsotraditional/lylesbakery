// Yoco Checkout API (https://developer.yoco.com). Card payments happen on Yoco's hosted page.
// Test and live mode share one host; the key (sk_test_... / sk_live_...) decides the mode.
import crypto from 'node:crypto';
import { env } from './env.js';

const BASE = () => env('YOCO_API_BASE') || 'https://payments.yoco.com';

// amount is in cents (ZAR). Returns { id, redirectUrl, ... }.
export async function createCheckout({ amount, successUrl, cancelUrl, failureUrl, metadata, externalId, lineItems, idempotencyKey }) {
  const key = env('YOCO_SECRET_KEY');
  if (!key) throw new Error('yoco_not_configured');
  const r = await fetch(BASE() + '/api/checkouts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ amount, currency: 'ZAR', successUrl, cancelUrl, failureUrl, metadata, externalId, clientReferenceId: externalId, lineItems }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id || !j.redirectUrl) throw new Error(`yoco_checkout_${r.status}`);
  return j;
}

// Standard-Webhooks style signature: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${raw body}`,
// keyed with the base64 part of the whsec_ secret. `raw` must be the unparsed request body (Buffer).
export function verifySignature(raw, headers, secret, now = Date.now()) {
  const id = headers['webhook-id'], ts = headers['webhook-timestamp'], sig = headers['webhook-signature'];
  if (!id || !ts || !sig || !secret) return false;
  if (!(Math.abs(now / 1000 - Number(ts)) <= 180)) return false; // reject stale or replayed events (3 min)
  const expected = crypto.createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(Buffer.concat([Buffer.from(`${id}.${ts}.`), raw])).digest();
  return String(sig).split(' ').some((part) => {
    const [v, s] = part.split(',');
    if (v !== 'v1' || !s) return false;
    const got = Buffer.from(s, 'base64');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
