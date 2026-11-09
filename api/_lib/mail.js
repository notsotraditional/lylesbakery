// Email through Resend (https://resend.com). If RESEND_API_KEY is not set, emails are skipped.
const { esc } = require('./util');
const FROM = () => process.env.FROM_EMAIL || "Lyle's Bakery <onboarding@resend.dev>";

async function resend(path, payload) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true };
  const r = await fetch('https://api.resend.com' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`resend_${r.status}`);
  return r.json().catch(() => ({}));
}

const sendMail = ({ to, subject, html }) => resend('/emails', { from: FROM(), to: [].concat(to), subject, html });
const sendMany = (messages) => resend('/emails/batch', messages.map((m) => ({ from: FROM(), to: [m.to], subject: m.subject, html: m.html })));

const wrap = (inner) => `<div style="background:#F2EEE3;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#A82A1E">
<div style="max-width:520px;margin:0 auto;background:#FBF8F1;border:3px solid #D93A2B;border-radius:18px;padding:28px">
<div style="font-size:34px;font-style:italic;font-weight:bold;color:#D93A2B;letter-spacing:.5px">Lyle's Bakery</div>
<div style="font-size:12px;letter-spacing:4px;margin:2px 0 20px">EST. 2026 &middot; CAPE TOWN</div>${inner}</div></div>`;

module.exports = { sendMail, sendMany, wrap, esc };
