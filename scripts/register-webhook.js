// One-off: tells Yoco where to send payment notifications and prints the signing secret.
//   node --env-file=.env.local scripts/register-webhook.js https://YOUR-SITE/api/yoco-webhook
// The secret is shown only once. Save it as YOCO_WEBHOOK_SECRET in Vercel.
// A test key creates a test-mode webhook and a live key a live one, so run it once for each.
const key = process.env.YOCO_SECRET_KEY;
const url = process.argv[2];
if (!key || !url || !/^https:\/\//.test(url)) {
  console.error('Usage: YOCO_SECRET_KEY must be set, then: node --env-file=.env.local scripts/register-webhook.js https://YOUR-SITE/api/yoco-webhook');
  process.exit(1);
}
(async () => {
  const r = await fetch((process.env.YOCO_API_BASE || 'https://payments.yoco.com') + '/api/webhooks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'lyles-bakery-orders', url, events: ['payment.succeeded'] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Yoco refused it (' + r.status + '):', JSON.stringify(j)); process.exit(1); }
  console.log(`Registered ${j.mode} webhook ${j.id}\nSigning secret (save it now, it is not shown again):\n${j.secret}`);
})();
