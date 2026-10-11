const { put, list } = require('@vercel/blob');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(__dirname, '..', 'translations');

function blobKey(clientId, page) {
  return `translations/${clientId}/${page}.json`;
}

function localPath(clientId, page) {
  return path.join(LOCAL_DIR, clientId, `${page}.json`);
}

async function loadTranslations(clientId, page) {
  if (!TOKEN) {
    // Local fallback
    try {
      const p = localPath(clientId, page);
      if (!fs.existsSync(p)) return {};
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { return {}; }
  }
  try {
    const key = blobKey(clientId, page);
    const { blobs } = await list({ prefix: key, token: TOKEN });
    const blob = blobs.find(b => b.pathname === key);
    if (!blob) return {};
    const r = await fetch(blob.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

async function saveTranslations(clientId, page, data) {
  if (!TOKEN) {
    // Local fallback
    const dir = path.join(LOCAL_DIR, clientId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath(clientId, page), JSON.stringify(data, null, 2), 'utf8');
    return;
  }
  await put(blobKey(clientId, page), JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: TOKEN,
  });
}

async function sendSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch { /* ignore */ }
}

async function sendEmail(subject, html) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_USER,
    to: 'amiado@wearemove.io',
    subject,
    html,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { client, page, action } = req.query;

  if (!client || !/^[a-z0-9_-]+$/i.test(client)) {
    return res.status(400).json({ error: 'Missing or invalid client' });
  }
  if (!page || !/^[a-z0-9_-]+$/i.test(page)) {
    return res.status(400).json({ error: 'Missing or invalid page' });
  }

  // GET — load all translations for client/page
  if (req.method === 'GET') {
    const data = await loadTranslations(client, page);
    return res.json(data);
  }

  // POST — save a key or complete a session
  if (req.method === 'POST') {
    const body = req.body || {};

    // action=done — summary notification after session ends
    if (action === 'done') {
      const changes = Array.isArray(body.changes) ? body.changes : [];

      if (changes.length > 0) {
        const rows = changes.map(c =>
          `<tr>
            <td style="padding:6px 10px;border:1px solid #ddd;font-family:monospace;font-size:13px">${escHtml(c.key)}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;color:#888">${escHtml(String(c.old ?? ''))}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;font-weight:500">${escHtml(String(c.value ?? ''))}</td>
          </tr>`
        ).join('');

        const emailHtml = `
          <div style="font-family:sans-serif;max-width:700px">
            <h2 style="color:#152656">Translation Session Complete</h2>
            <p><strong>${escHtml(client)}</strong> — ${escHtml(page)} — ${changes.length} key(s) updated</p>
            <table style="border-collapse:collapse;width:100%">
              <thead>
                <tr style="background:#f5f7fa">
                  <th style="padding:6px 10px;border:1px solid #ddd;text-align:left">Key</th>
                  <th style="padding:6px 10px;border:1px solid #ddd;text-align:left">Previous</th>
                  <th style="padding:6px 10px;border:1px solid #ddd;text-align:left">Updated</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;

        const slackText = `*Translation session complete — ${client} / ${page}*\n${changes.length} key(s) updated:\n` +
          changes.map(c => `• \`${c.key}\`: "${c.value}"`).join('\n');

        await Promise.allSettled([
          sendEmail(`Translation session complete — ${client} / ${page}`, emailHtml),
          sendSlack(slackText),
        ]);
      }

      return res.json({ ok: true });
    }

    // Single key save
    const { key, value } = body;
    if (typeof key !== 'string' || !key) {
      return res.status(400).json({ error: 'Missing key' });
    }
    if (!TOKEN) return res.status(503).json({ error: 'Blob not configured' });

    const existing = await loadTranslations(client, page);
    const oldValue = existing[key];
    existing[key] = value;
    await saveTranslations(client, page, existing);

    const changeDesc = oldValue !== undefined && oldValue !== value
      ? `"${oldValue}" → "${value}"`
      : `"${value}"`;
    const slackText = `*[${client}] ${page}* — \`${key}\` updated\n${changeDesc}`;
    await sendSlack(slackText).catch(() => {});

    return res.json({ ok: true, saved: { [key]: value } });
  }

  res.status(405).end();
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
