// A "hold" keeps a customer's donuts out of stock while they pay on Yoco.
// Yoco does not tell us when a checkout is abandoned or expires, so we release unpaid holds ourselves.
// Keys: `holds` (sorted set: ref -> expiry ms), `hold:<ref>` (the order + what was reserved),
//       `chk:<checkoutId>` (-> ref), `done:<ref>` (set once a payment has been processed).
import { cmd, release, getBatch, parse } from './redis.js';

export const HOLD_MINUTES = 20;

// Give back the donuts of every hold that has run out. ZREM decides who owns a hold, so a hold is
// released at most once and never at the same moment a payment claims it.
export async function sweep() {
  const due = await cmd('ZRANGEBYSCORE', 'holds', '-inf', Date.now());
  if (!due || !due.length) return;
  const { cfg } = await getBatch();
  for (const ref of due) {
    if (Number(await cmd('ZREM', 'holds', ref)) !== 1) continue;
    const h = parse(await cmd('GET', 'hold:' + ref));
    if (h && cfg && h.batchId === cfg.id) await release(h.picks); // stock of an older batch no longer exists
  }
}
