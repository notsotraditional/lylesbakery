(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const VIEWS = ['loading', 'error', 'order', 'soldout', 'success'];
  let site, status, current = 'loading';

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
    if (demo === 'open') return { soldOut: false, remaining: 60, label: 'Saturday batch', sizes: { 4: true, 6: true, 12: true } };
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

  function updateSummary() {
    const size = selectedSize();
    const el = $('#summary');
    if (!size) { el.textContent = 'Choose a box to get started'; return; }
    const qty = Number($('#qty').value) || 1;
    const p = site.prices && site.prices[size];
    el.textContent = `${qty} × ${size}-box · ${size * qty} donuts` + (p != null ? ` · ${money(p * qty)}` : '');
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
      street: f.get('street') || '', complex: f.get('complex') || '', suburb: f.get('suburb') || '', instructions: f.get('instructions') || '', company: f.get('company') || '' };
    const errs = validateOrder(d);
    if (Object.keys(errs).length) { showErrors(form, errs); const k = Object.keys(errs)[0]; if (k === 'size' || k === 'method') $('#err-' + k).scrollIntoView({ block: 'center' }); return; }

    const btn = $('#submit');
    btn.disabled = true; btn.textContent = 'Placing order…';
    try {
      const r = await post('/api/order', d);
      if (r.ok) return showSuccess(d, r.data);
      if (r.status === 422 && r.data.errors) return showErrors(form, r.data.errors);
      if (r.status === 409) {
        if (r.data.error === 'sold_out') { status = { soldOut: true }; return show('soldout'); }
        formError('#form-err', "Sorry, there aren't enough donuts left for that order. Please choose a smaller box.");
        return refresh().catch(() => {});
      }
      formError('#form-err', 'Something went wrong on our side. Please try again in a moment.');
    } catch (_) {
      formError('#form-err', "We couldn't reach the server. Check your connection and try again.");
    } finally {
      btn.disabled = false; btn.textContent = 'Place order';
    }
  }

  function showSuccess(d, res) {
    $('#ok-ref').textContent = res.ref;
    $('#ok-detail').textContent = `${d.qty} × ${d.size}-box (${res.donuts} donuts)` + (res.total != null ? ` · ${money(res.total)}` : '') + ' · ' + (d.method === 'delivery' ? `Delivery to ${d.suburb}` : 'Collection');
    $('#ok-note').textContent = d.method === 'collection' ? `${site.collectionNote} ${site.afterOrderNote}` : site.afterOrderNote;
    $('#ok-email').textContent = d.email;
    show('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        if (e.target.name === 'size') { updateQty(); updateSummary(); }
        if (e.target.id === 'qty') updateSummary();
        if (e.target.name === 'method') setMethod();
      });
      $('#order-form').addEventListener('submit', submitOrder);
      $('#wait-form').addEventListener('submit', submitWait);
      await refresh();
      setInterval(() => { if (!document.hidden && current !== 'success') refresh().catch(() => {}); }, 60000);
    } catch (_) {
      show('error');
    }
  }
  init();
})();
