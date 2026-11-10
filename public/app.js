(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const VIEWS = ['loading', 'error', 'order', 'soldout', 'success'];
  let site, status, current = 'loading';
  const picks = {}; // flavour -> donuts chosen

  const show = (name) => { VIEWS.forEach((v) => ($('#view-' + v).hidden = v !== name)); current = name; };
  const money = (n) => 'R' + Number(n).toLocaleString('en-ZA');

  async function api(url, opts) {
    const r = await fetch(url, opts);
    let data = {};
    try { data = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data };
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* ---------- status ---------- */
  async function loadStatus() {
    const demo = qs.get('demo'); // ?demo=soldout or ?demo=open previews each state
    if (demo === 'soldout') return { soldOut: true };
    if (demo === 'open') { const fl = Object.entries(site.defaultFlavours || {}).map(([name, left]) => ({ name, left })); return { soldOut: false, remaining: fl.reduce((a, f) => a + f.left, 0), label: 'Saturday batch', sizes: { 4: true, 6: true, 12: true }, flavours: fl }; }
    const r = await api('/api/status');
    if (!r.ok) throw new Error('status');
    return r.data;
  }

  async function refresh() {
    status = await loadStatus();
    if (current === 'success') return;
    if (status.soldOut) { if (current !== 'soldout') show('soldout'); return; }
    renderOrder();
    if (current !== 'order') show('order');
  }

  /* ---------- order view ---------- */
  function selectedSize() { const el = $('input[name=size]:checked'); return el ? Number(el.value) : 0; }
  function selectedMethod() { const el = $('input[name=method]:checked'); return el ? el.value : ''; }

  function renderOrder() {
    $('#batch-label').textContent = status.label || 'Next batch';
    const pill = $('#stock-pill');
    const low = status.remaining <= site.lowStockAt;
    pill.textContent = low ? `Only ${status.remaining} donuts left` : 'Orders open';
    pill.classList.toggle('low', low);

    const keep = selectedSize();
    $('#box-grid').innerHTML = site.boxes.map((n) => {
      const ok = status.sizes && status.sizes[n];
      const p = site.prices && site.prices[n];
      return `<label class="choice"><input type="radio" name="size" value="${n}" ${ok ? '' : 'disabled'} ${keep === n && ok ? 'checked' : ''}>
        <span class="face"><span class="num">${n}</span><span class="unit">box</span>
        <span class="sub">${ok ? n + ' donuts' : 'Sold out'}</span>${ok && p != null ? `<span class="sub">${money(p)}</span>` : ''}</span></label>`;
    }).join('');
    updateQty();
    renderFlavours();
    updateSummary();
  }

  function updateQty() {
    const size = selectedSize();
    const sel = $('#qty');
    const prev = Number(sel.value) || 1;
    const max = size ? Math.max(1, Math.min(site.maxBoxesPerOrder, Math.floor((status.remaining || 0) / size))) : site.maxBoxesPerOrder;
    sel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    sel.value = String(Math.min(prev, max));
  }

  /* ---------- flavours ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const needed = () => selectedSize() * (Number($('#qty').value) || 1);
  const pickedTotal = () => Object.values(picks).reduce((a, n) => a + n, 0);

  function renderFlavours() {
    const list = status.flavours || [];
    const need = needed();
    $('#flavour-wrap').hidden = !need;
    if (!need) return;
    // Drop flavours that are gone and never hold more than is left.
    for (const k of Object.keys(picks)) { const f = list.find((x) => x.name === k); picks[k] = Math.min(picks[k], f ? f.left : 0); if (!picks[k]) delete picks[k]; }
    const total = pickedTotal();
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : {};
    $('#flavour-list').innerHTML = list.map((f) => {
      const n = picks[f.name] || 0, name = esc(f.name);
      return `<div class="flavour${f.left ? '' : ' out'}"><span class="fname">${name}<small>${f.left ? f.left + ' left' : 'Sold out'}</small></span>
        <span class="stepper"><button type="button" data-flavour="${name}" data-d="-1" aria-label="One less ${name}" ${n ? '' : 'disabled'}>&minus;</button>
        <b>${n}</b><button type="button" data-flavour="${name}" data-d="1" aria-label="One more ${name}" ${n < f.left && total < need ? '' : 'disabled'}>+</button></span></div>`;
    }).join('');
    if (focused.flavour) { const again = [...document.querySelectorAll('#flavour-list button')].find((b) => b.dataset.flavour === focused.flavour && b.dataset.d === focused.d); if (again && !again.disabled) again.focus(); }
    const diff = need - total;
    const pc = $('#pick-count');
    pc.textContent = diff > 0 ? `Pick ${diff} more (${total} of ${need})` : diff < 0 ? `Take ${-diff} off (${total} of ${need})` : `All ${need} donuts chosen`;
    pc.classList.toggle('done', diff === 0);
  }

  function stepFlavour(btn) {
    const name = btn.dataset.flavour, d = Number(btn.dataset.d);
    const f = (status.flavours || []).find((x) => x.name === name);
    if (!f) return;
    const n = (picks[name] || 0) + d;
    if (n < 0 || n > f.left || (d > 0 && pickedTotal() >= needed())) return;
    if (n) picks[name] = n; else delete picks[name];
    $('#err-flavours').textContent = '';
    renderFlavours();
    updateSummary();
  }

  function updateSummary() {
    const size = selectedSize();
    const el = $('#summary');
    if (!size) { el.textContent = 'Choose a box to get started'; return; }
    const qty = Number($('#qty').value) || 1;
    const p = site.prices && site.prices[size];
    const mix = Object.entries(picks).map(([f, n]) => `${n} ${f}`).join(', ');
    el.textContent = `${qty} × ${size}-box · ${size * qty} donuts` + (p != null ? ` · ${money(p * qty)}` : '') + (mix ? ` · ${mix}` : '');
  }

  function buildSuburbs(suburbs) {
    $('#suburb').insertAdjacentHTML('beforeend', Object.entries(suburbs).map(([region, list]) =>
      `<optgroup label="${region.replace(/&/g, '&amp;')}">${list.map((s) => `<option value="${s.replace(/"/g, '&quot;')}">${s.replace(/&/g, '&amp;')}</option>`).join('')}</optgroup>`).join(''));
  }

  function setMethod() {
    const m = selectedMethod();
    $('#delivery-fields').hidden = m !== 'delivery';
    const cn = $('#collection-note');
    cn.hidden = m !== 'collection';
    cn.textContent = site.collectionNote;
  }

  /* ---------- errors ---------- */
  function clearErrors(form) {
    form.querySelectorAll('.err').forEach((e) => (e.textContent = ''));
    form.querySelectorAll('.has-err').forEach((e) => e.classList.remove('has-err'));
    form.querySelectorAll('.form-err').forEach((e) => (e.hidden = true));
  }
  function showErrors(form, errors, prefix = '') {
    let first = null;
    for (const [field, msg] of Object.entries(errors)) {
      const el = $('#err-' + prefix + field);
      if (!el) continue;
      el.textContent = msg;
      const label = el.closest('label.f');
      if (label) label.classList.add('has-err');
      if (!first) first = form.querySelector(`[name=${field}]`);
    }
    if (first) first.focus();
  }
  function formError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }

  /* ---------- order submit ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validateOrder(d) {
    const e = {};
    if (!d.size) e.size = 'Choose a box size.';
    else if (pickedTotal() !== d.size * d.qty) e.flavours = `Choose exactly ${d.size * d.qty} donuts.`;
    if (d.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL.test(d.email.trim())) e.email = 'Please enter a valid email address.';
    if (!d.method) e.method = 'Choose delivery or collection.';
    if (d.method === 'delivery') {
      if (d.street.trim().length < 3) e.street = 'Please enter your street address.';
      if (!d.suburb) e.suburb = 'Please choose your suburb. We only deliver in Cape Town and its suburbs.';
    }
    return e;
  }

  async function submitOrder(ev) {
    ev.preventDefault();
    const form = ev.target;
    clearErrors(form);
    const f = new FormData(form);
    const d = { size: selectedSize(), qty: Number(f.get('qty')) || 1, name: f.get('name') || '', email: f.get('email') || '', method: selectedMethod(),
      street: f.get('street') || '', complex: f.get('complex') || '', suburb: f.get('suburb') || '', instructions: f.get('instructions') || '', company: f.get('company') || '', flavours: { ...picks } };
    const errs = validateOrder(d);
    if (Object.keys(errs).length) { showErrors(form, errs); const k = Object.keys(errs)[0]; if (k === 'size' || k === 'method' || k === 'flavours') $('#err-' + k).scrollIntoView({ block: 'center' }); return; }

    const btn = $('#submit');
    let leaving = false;
    btn.disabled = true; btn.textContent = 'Starting payment…';
    try {
      const r = await post('/api/order', d);
      if (r.ok && r.data.redirectUrl) {
        // Hand over to Yoco's secure payment page. We remember the order so the page can show it when they come back.
        try { sessionStorage.setItem('lyles-pending', JSON.stringify({ ref: r.data.ref, qty: d.qty, size: d.size, donuts: r.data.donuts, flavours: d.flavours, method: d.method, suburb: d.suburb, email: d.email })); } catch (_) {}
        leaving = true;
        btn.textContent = 'Taking you to payment…';
        location.href = r.data.redirectUrl;
        return;
      }
      if (r.status === 422 && r.data.errors) return showErrors(form, r.data.errors);
      if (r.status === 409) {
        if (r.data.error === 'sold_out') { status = { soldOut: true }; return show('soldout'); }
        formError('#form-err', "Sorry, someone just took some of those donuts. Please check your flavours and try again.");
        return refresh().catch(() => {});
      }
      if (r.status === 503 && r.data.error === 'not_configured') return formError('#form-err', "Online ordering isn't switched on yet. Please check back soon.");
      if (r.status === 502) return formError('#form-err', "We couldn't start the payment page. Nothing was charged. Please try again in a moment.");
      formError('#form-err', 'Something went wrong on our side. Please try again in a moment.');
    } catch (_) {
      formError('#form-err', "We couldn't reach the server. Check your connection and try again.");
    } finally {
      if (!leaving) { btn.disabled = false; btn.textContent = 'Pay now'; }
    }
  }

  // Shown when Yoco sends the customer back. This does not prove payment (only Yoco's webhook does),
  // so the wording says the payment is being confirmed.
  function showPaid(ref) {
    let d = {};
    try { const j = JSON.parse(sessionStorage.getItem('lyles-pending') || '{}'); if (j.ref === ref) d = j; } catch (_) {}
    $('#ok-ref').textContent = ref;
    $('#ok-detail').textContent = d.size ? `${d.qty} × ${d.size}-box (${d.donuts} donuts: ${Object.entries(d.flavours || {}).map(([f, n]) => `${n} ${f}`).join(', ')}) · ` + (d.method === 'delivery' ? `Delivery to ${d.suburb}` : 'Collection') : '';
    $('#ok-note').textContent = d.method === 'collection' ? `${site.collectionNote} ${site.afterOrderNote}` : site.afterOrderNote;
    $('#ok-email').textContent = d.email || 'your email address';
    show('success');
    try { sessionStorage.removeItem('lyles-pending'); } catch (_) {}
  }

  /* ---------- waitlist ---------- */
  function normPhone(raw) {
    const d = raw.replace(/[\s\-().]/g, '');
    if (/^0\d{9}$/.test(d) || /^27\d{9}$/.test(d) || /^\+\d{8,15}$/.test(d)) return d;
    return null;
  }
  async function submitWait(ev) {
    ev.preventDefault();
    const form = ev.target;
    clearErrors(form);
    const f = new FormData(form);
    const email = (f.get('email') || '').trim(), phone = (f.get('phone') || '').trim();
    const errs = {};
    if (!email && !phone) errs.email = 'Please add your email, your WhatsApp number, or both.';
    if (email && !EMAIL.test(email)) errs.email = 'That email address does not look right.';
    if (phone && !normPhone(phone)) errs.phone = 'Please enter a valid WhatsApp number, e.g. 082 123 4567.';
    if (Object.keys(errs).length) return showErrors(form, errs, 'w-');
    const btn = $('#wait-submit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await post('/api/waitlist', { email, phone, company: f.get('company') || '' });
      if (r.ok) { form.hidden = true; $('.lead', form.parentNode).hidden = true; $('#wait-done').hidden = false; return; }
      if (r.status === 422 && r.data.errors) return showErrors(form, r.data.errors, 'w-');
      formError('#wait-err', 'Something went wrong. Please try again in a moment.');
    } catch (_) {
      formError('#wait-err', "We couldn't reach the server. Check your connection and try again.");
    } finally {
      btn.disabled = false; btn.textContent = 'Alert me';
    }
  }

  /* ---------- boot ---------- */
  async function init() {
    try {
      const [s, sb] = await Promise.all([fetch('/data/site.json').then((r) => r.json()), fetch('/data/suburbs.json').then((r) => r.json())]);
      site = s; buildSuburbs(sb);
      document.addEventListener('change', (e) => {
        if (e.target.name === 'size') { updateQty(); renderFlavours(); updateSummary(); }
        if (e.target.id === 'qty') { renderFlavours(); updateSummary(); }
        if (e.target.name === 'method') setMethod();
      });
      $('#flavour-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-flavour]'); if (b) stepFlavour(b); });
      $('#order-form').addEventListener('submit', submitOrder);
      $('#wait-form').addEventListener('submit', submitWait);
      const back = { paid: qs.get('paid'), stopped: qs.get('cancelled') || qs.get('failed') };
      if (back.paid || back.stopped) history.replaceState(null, '', location.pathname);
      if (back.paid) showPaid(back.paid);
      else {
        await refresh();
        if (back.stopped && current === 'order') formError('#form-err', "Your payment didn't go through and nothing was charged. Choose your order again to try again.");
      }
      setInterval(() => { if (!document.hidden && current !== 'success') refresh().catch(() => {}); }, 60000);
    } catch (_) {
      show('error');
    }
  }
  init();
})();
