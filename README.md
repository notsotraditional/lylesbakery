# Lyle's Bakery – order site

Static page (`public/`) + Vercel functions (`api/`). No build step, no dependencies.

## Deploy (about 10 minutes)

1. Put this folder in a GitHub repo and import it in Vercel (Framework: **Other**). Or run `vercel` in this folder.
2. **Add storage:** Vercel dashboard > your project > Storage > Marketplace > **Upstash Redis** (free tier is plenty). Connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables automatically.
3. **Add environment variables** (Settings > Environment Variables):
   - `ADMIN_TOKEN` – the password for `/admin` (make it long)
   - `OWNER_EMAIL` – where new-order emails go
   - `RESEND_API_KEY` – from resend.com (needed for emails; the site works without it, but nobody gets emailed)
   - `FROM_EMAIL` – e.g. `Lyle's Bakery <orders@yourdomain.com>` (verify the domain in Resend; until then Resend only sends to your own address)
4. Redeploy, then go to `yoursite.com/admin`, sign in, and **Open a new batch** (name + total donuts). The order form is live from that moment.

## How slots work
A batch has a total number of **donuts**. A 4-box uses 4, a 6-box uses 6, a 12-box uses 12. When fewer than 4 are left (or you close orders) the page switches to "Orders are all sold out" and the alert sign-up. Orders can never oversell: stock is taken atomically.

## Things you can edit
- `public/data/site.json` – prices (set e.g. `"4": 180` and they show on the page), max boxes per order, wording for collection and after-order messages.
- `public/data/suburbs.json` – the Cape Town suburbs people can pick for delivery. Add or remove names here.
- Preview each state: `/?demo=open` and `/?demo=soldout`.

## Alerting the waitlist
In `/admin`: open the new batch, then **Email everyone**. For WhatsApp, **Copy WhatsApp numbers** and message them yourself (or paste into a broadcast list). **Clear list** afterwards.

## Not included
Online payment. Orders are recorded and emailed; you confirm payment with the customer. (Yoco / PayFast can be added later.)
