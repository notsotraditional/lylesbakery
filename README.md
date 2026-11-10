# Lyle's Bakery – order site

Built with [Astro](https://astro.build) and deployed on Vercel.

- `src/pages/index.astro`, `src/pages/admin.astro` – the order page and the admin page (prerendered).
- `src/pages/api/*.js` – server endpoints (order, status, waitlist, admin, Yoco webhook). Run on demand as Vercel functions.
- `src/lib/` – shared server code (Redis, Yoco, email, stock holds).
- `public/` – static files served as-is (`styles.css`, `app.js`, fonts, logo, `data/*.json`).
- `astro.config.mjs` – app config, including the schema of every server-side environment variable.

Local development: `pnpm install`, put the variables below in `.env.local`, then `pnpm dev`. Build with `pnpm build`.

## Deploy (about 10 minutes)

1. Put this folder in a GitHub repo and import it in Vercel (Framework: **Astro**, detected automatically). Or run `vercel` in this folder.
2. **Add storage:** Vercel dashboard > your project > Storage > Marketplace > **Upstash Redis** (free tier is plenty). Connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables automatically.
3. **Add environment variables** (Settings > Environment Variables):
   - `ADMIN_TOKEN` – the password for `/admin` (make it long)
   - `OWNER_EMAIL` – where new-order emails go
   - `RESEND_API_KEY` – from resend.com (needed for emails; the site works without it, but nobody gets emailed)
   - `YOCO_SECRET_KEY` – from the Yoco app (Checkout API integration > How to connect). Start with the **test** key `sk_test_...`.
   - `YOCO_WEBHOOK_SECRET` – printed once when you register the webhook (step 4).
   - `SITE_URL` – the public address of the site, e.g. `https://lyles.example.com` (no trailing slash).
   - `FROM_EMAIL` – e.g. `Lyle's Bakery <orders@yourdomain.com>` (verify the domain in Resend; until then Resend only sends to your own address)
4. **Register the Yoco webhook** (after the first deploy, so the URL exists). Locally, with the key in `.env.local`:
   `node --env-file=.env.local scripts/register-webhook.js https://YOUR-SITE/api/yoco-webhook`
   It prints a `whsec_...` secret once. Save it as `YOCO_WEBHOOK_SECRET` in Vercel. A test key makes a test webhook and a live key a live one, so repeat it when you switch to live.
5. **Going live:** in the Yoco app add your site's domain under Verified Domains and wait for approval, then swap in the `sk_live_...` key and register a live webhook. Fill in the prices in `public/data/site.json` first: ordering stays off until each box size has a price.
6. Redeploy, then go to `yoursite.com/admin`, sign in, and **Open a new batch** (name + donuts per flavour). The order form is live from that moment.

## How an order works
1. The customer picks a box and flavours. The donuts are **held** (taken out of stock) and they are sent to Yoco's payment page.
2. When Yoco confirms the payment (a signed webhook), the order is saved and both emails go out. Only then does it count as sold.
3. Yoco does not tell us when someone abandons a payment, so an unpaid hold is released after 20 minutes and the donuts go back on sale.

Stock is per flavour (default 10 each of Cream, Custard, Berliners, Jam and Chocolate ganache). When fewer than 4 donuts are left in total, or you close orders, the page shows "sold out" and the alert sign-up. A flavour can never be oversold: holds are taken atomically.

If someone pays after their hold expired and the donuts have since sold, the order is saved with status **CHECK** in `/admin` and you get an email: refund them in Yoco or fulfil it yourself. Orders with the wrong amount are flagged the same way.

## Things you can edit
- `public/data/site.json` – the flavours and default amounts offered when opening a batch (`defaultFlavours`) and **prices in rand** (set e.g. `"4": 180`; required before orders can be taken), max boxes per order, wording for collection and after-order messages.
- `public/data/suburbs.json` – the Cape Town suburbs people can pick for delivery. Add or remove names here.
- Preview each state: `/?demo=open` and `/?demo=soldout`.

## Alerting the waitlist
In `/admin`: open the new batch, then **Email everyone**. For WhatsApp, **Copy WhatsApp numbers** and message them yourself (or paste into a broadcast list). **Clear list** afterwards.

## Not included
Yoco's Orders API (so orders also show in the Yoco app) is not wired in yet. Payment itself is taken through Yoco Checkout; orders are managed in `/admin`.
