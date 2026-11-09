const { cmd, reserve, getBatch } = require('./_lib/redis');
const { site, SUBURBS, esc, clean, EMAIL_RE, readBody, send } = require('./_lib/util');
const { sendMail, wrap } = require('./_lib/mail');

const money = (n) => 'R' + Number(n).toLocaleString('en-ZA');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const b = readBody(req);

  // Honeypot: real people never fill this hidden field.
  if (clean(b.company, 100)) return send(res, 200, { ok: true, ref: 'LB-0000' });

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
  if (Object.keys(errors).length) return send(res, 422, { error: 'invalid', errors });

  try {
    const { cfg } = await getBatch();
    if (!cfg || !cfg.open) return send(res, 409, { error: 'sold_out' });

    const donuts = size * qty;
    const left = await reserve(donuts);
    if (left < 0) {
      const { remaining } = await getBatch();
      return send(res, 409, { error: remaining < Math.min(...site.boxes) ? 'sold_out' : 'not_enough', remaining });
    }

    const n = await cmd('INCR', 'order:counter');
    const ref = 'LB-' + String(n).padStart(4, '0');
    const price = site.prices && site.prices[size];
    const total = typeof price === 'number' ? price * qty : null;
    const order = { ref, batchId: cfg.id, batchLabel: cfg.label, createdAt: new Date().toISOString(), name, email, size, qty, donuts, method, address, total };

    try {
      await cmd('RPUSH', `orders:${cfg.id}`, order);
    } catch (e) {
      await cmd('INCRBY', 'batch:remaining', donuts).catch(() => {}); // give the donuts back
      throw e;
    }

    const where = method === 'delivery'
      ? `Delivery to ${esc(address.street)}${address.complex ? ', ' + esc(address.complex) : ''}, ${esc(address.suburb)}, Cape Town`
      : 'Collection (Cape Town)';
    const lines = `<p style="font-size:15px;line-height:1.6;margin:0 0 6px"><b>Order ${esc(ref)}</b><br>${qty} &times; ${size}-box (${donuts} donuts)${total != null ? '<br>Total: ' + money(total) : ''}<br>${where}</p>`;

    await Promise.allSettled([
      sendMail({
        to: email,
        subject: `Your Lyle's order ${ref}`,
        html: wrap(`<p style="font-size:16px;line-height:1.6">Hi ${esc(name.split(' ')[0])}, thank you for your order!</p>${lines}<p style="font-size:15px;line-height:1.6">${esc(site.afterOrderNote)}</p>${method === 'collection' ? `<p style="font-size:15px;line-height:1.6">${esc(site.collectionNote)}</p>` : ''}`),
      }),
      process.env.OWNER_EMAIL
        ? sendMail({ to: process.env.OWNER_EMAIL, subject: `New order ${ref} – ${qty} × ${size}-box (${method})`, html: wrap(`<p style="font-size:15px;line-height:1.6"><b>${esc(name)}</b><br>${esc(email)}</p>${lines}${address && address.instructions ? `<p style="font-size:14px">Note: ${esc(address.instructions)}</p>` : ''}<p style="font-size:14px">${left} donuts left in this batch.</p>`) })
        : null,
    ].filter(Boolean));

    send(res, 200, { ok: true, ref, donuts, total, method, email, left });
  } catch (e) {
    console.error('order_failed', e);
    send(res, 500, { error: 'server_error' });
  }
};
