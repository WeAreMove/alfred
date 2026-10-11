const { list } = require('@vercel/blob');
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_KEY = 'editor/translation-editor.html';
const LOCAL_PATH = path.join(__dirname, '..', 'editor', 'translation-editor.html');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // Local fallback — no Blob token (dev mode)
  if (!TOKEN) {
    if (!fs.existsSync(LOCAL_PATH)) {
      return res.status(404).send(
        '<h1 style="font-family:sans-serif;color:#c00">Translation editor not uploaded yet.</h1>' +
        '<p style="font-family:sans-serif">Place the editor HTML at <code>editor/translation-editor.html</code> or upload via Admin.</p>'
      );
    }
    return res.send(fs.readFileSync(LOCAL_PATH, 'utf8'));
  }

  try {
    const { blobs } = await list({ prefix: BLOB_KEY, token: TOKEN });
    const blob = blobs.find(b => b.pathname === BLOB_KEY);

    if (!blob) {
      return res.status(404).send(
        '<h1 style="font-family:sans-serif;color:#c00">Translation editor not uploaded yet.</h1>' +
        '<p style="font-family:sans-serif">Go to the Admin panel and upload the editor HTML file.</p>'
      );
    }

    const r = await fetch(blob.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) return res.status(502).send('<h1>Failed to fetch editor from storage</h1>');

    return res.send(await r.text());
  } catch (err) {
    return res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`);
  }
};
