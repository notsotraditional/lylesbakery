// Minimal Upstash/Vercel-KV REST client (no dependencies).
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args) {
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

// Atomically take `n` donuts from the batch. Returns donuts left, or -1 if there are not enough.
const RESERVE = `local r=tonumber(redis.call('GET',KEYS[1])); if not r then return -1 end; local n=tonumber(ARGV[1]); if r>=n then return redis.call('DECRBY',KEYS[1],n) else return -1 end`;
const reserve = (n) => cmd('EVAL', RESERVE, 1, 'batch:remaining', n).then(Number);

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

async function getBatch() {
  const [cfg, rem] = await Promise.all([cmd('GET', 'batch:config'), cmd('GET', 'batch:remaining')]);
  return { cfg: parse(cfg), remaining: Math.max(0, parseInt(rem || '0', 10) || 0) };
}

module.exports = { cmd, reserve, getBatch, parse };
