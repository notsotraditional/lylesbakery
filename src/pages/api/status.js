import { getBatch } from '../../lib/redis.js';
import { sweep } from '../../lib/holds.js';
import { site, send } from '../../lib/util.js';

export const prerender = false;

export async function GET() {
  try {
    await sweep(); // donuts held for unpaid checkouts go back on sale once the hold runs out
    const { cfg, stock, remaining } = await getBatch();
    const min = Math.min(...site.boxes);
    const open = !!(cfg && cfg.open);
    const sizes = {};
    site.boxes.forEach((b) => (sizes[b] = open && remaining >= b));
    const soldOut = !open || remaining < min;
    return send(200, { soldOut, open, label: cfg ? cfg.label : '', remaining: soldOut ? 0 : remaining, sizes, flavours: soldOut ? [] : Object.entries(stock).map(([name, left]) => ({ name, left })) });
  } catch (e) {
    return send(503, { error: e.message === 'storage_not_configured' ? 'storage_not_configured' : 'unavailable' });
  }
}

export const ALL = () => send(405, { error: 'method_not_allowed' });
