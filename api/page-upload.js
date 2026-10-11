const { put, list } = require('@vercel/blob');
const path = require('path');
const fs   = require('fs');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function blobKey(client, page) { return `pages/${client}/${page}.html`; }
function localPath(client, page) {
  return path.join(__dirname, '..', 'pages', client, `${page}.html`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { client, page } = req.query;
  if (!client || !/^[a-z0-9_-]+$/i.test(client)) return res.status(400).json({ error: 'Invalid client' });
  if (!page   || !/^[a-z0-9_-]+$/i.test(page))   return res.status(400).json({ error: 'Invalid page' });

  // ── GET — check upload status ───────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!TOKEN) {
      const p = localPath(client, page);
      if (!fs.existsSync(p)) return res.json({ exists: false });
      const stat = fs.statSync(p);
      return res.json({ exists: true, uploadedAt: stat.mtime.toISOString(), size: stat.size });
    }
    try {
      const { blobs } = await list({ prefix: blobKey(client, page), token: TOKEN });
      const blob = blobs.find(b => b.pathname === blobKey(client, page));
      if (!blob) return res.json({ exists: false });
      return res.json({ exists: true, uploadedAt: blob.uploadedAt, size: blob.size });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — upload HTML ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { htmlContent } = req.body || {};
    if (!htmlContent || typeof htmlContent !== 'string') {
      return res.status(400).json({ error: 'Missing htmlContent' });
    }

    if (!TOKEN) {
      // Local fallback
      const dir = path.dirname(localPath(client, page));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(localPath(client, page), htmlContent, 'utf8');
      return res.json({ ok: true, uploadedAt: new Date().toISOString(), size: htmlContent.length });
    }

    try {
      await put(blobKey(client, page), htmlContent, {
        access: 'private',
        contentType: 'text/html; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: TOKEN,
      });
      return res.json({ ok: true, uploadedAt: new Date().toISOString(), size: htmlContent.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
