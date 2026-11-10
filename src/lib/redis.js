// Minimal Upstash/Vercel-KV REST client (no dependencies).
import { env } from './env.js';

const URL_ = () => env('KV_REST_API_URL') || env('DB_KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
const TOKEN = () => env('KV_REST_API_TOKEN') || env('DB_KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');

export async function cmd(...args) {
  if (!URL_() || !TOKEN()) throw new Error('storage_not_configured');
  const r = await fetch(URL_(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis_http_${r.status}`);
  return j.result;
}

// Stock lives in the hash `batch:stock` (flavour -> donuts left).
// Atomically take every flavour in `picks` ({ flavour: n }). All or nothing.
// Returns total donuts left across all flavours, or -1 if any flavour is short.
const RESERVE = `for i=1,#ARGV,2 do local h=tonumber(redis.call('HGET',KEYS[1],ARGV[i])) or 0; if h<tonumber(ARGV[i+1]) then return -1 end end; for i=1,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],-tonumber(ARGV[i+1])) end; local t=0; for _,v in ipairs(redis.call('HVALS',KEYS[1])) do t=t+tonumber(v) end; return t`;
export const reserve = (picks) => cmd('EVAL', RESERVE, 1, 'batch:stock', ...Object.entries(picks).flat()).then(Number);
export const release = (picks) => Promise.all(Object.entries(picks).map(([f, n]) => cmd('HINCRBY', 'batch:stock', f, n)));

// Replace the stock hash with `stock` ({ flavour: n }).
export async function setStock(stock) {
  await cmd('DEL', 'batch:stock');
  await cmd('HSET', 'batch:stock', ...Object.entries(stock).flat());
}

export const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// stock: { flavour: donuts left } in the batch's flavour order. remaining: the total.
export async function getBatch() {
  const [raw, flat] = await Promise.all([cmd('GET', 'batch:config'), cmd('HGETALL', 'batch:stock')]);
  const cfg = parse(raw);
  const have = {};
  for (let i = 0; i < (flat || []).length; i += 2) have[flat[i]] = Math.max(0, parseInt(flat[i + 1], 10) || 0);
  const stock = {};
  for (const f of Object.keys((cfg && cfg.flavours) || {})) stock[f] = have[f] || 0;
  return { cfg, stock, remaining: Object.values(stock).reduce((a, n) => a + n, 0) };
}
