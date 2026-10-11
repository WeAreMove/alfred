const { put } = require('@vercel/blob');
const { checkAdminAuth } = require('./_auth');
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_KEY = 'editor/translation-editor.html';
const LOCAL_PATH = path.join(__dirname, '..', 'editor', 'translation-editor.html');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password, x-session-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return current editor metadata
  if (req.method === 'GET') {
    if (TOKEN && !checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

    if (!TOKEN) {
      // Local fallback
      if (!fs.existsSync(LOCAL_PATH)) return res.json({ exists: false });
      const stat = fs.statSync(LOCAL_PATH);
      return res.json({ exists: true, uploadedAt: stat.mtime.toISOString(), size: stat.size });
    }

    try {
      const { list } = require('@vercel/blob');
      const { blobs } = await list({ prefix: BLOB_KEY, token: TOKEN });
      const blob = blobs.find(b => b.pathname === BLOB_KEY);
      if (!blob) return res.json({ exists: false });
      return res.json({ exists: true, uploadedAt: blob.uploadedAt, size: blob.size });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — upload new editor HTML
  if (req.method === 'POST') {
    if (TOKEN && !checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body || {};
    const { htmlContent } = body;

    if (!htmlContent || typeof htmlContent !== 'string') {
      return res.status(400).json({ error: 'Missing htmlContent string in body' });
    }
    if (!htmlContent.includes('<html') && !htmlContent.includes('<!DOCTYPE')) {
      return res.status(400).json({ error: 'Content does not appear to be valid HTML' });
    }

    if (!TOKEN) {
      // Local fallback — save to editor/ directory
      try {
        const dir = path.dirname(LOCAL_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_PATH, htmlContent, 'utf8');
        return res.json({ ok: true, uploadedAt: new Date().toISOString(), size: htmlContent.length });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    try {
      const result = await put(BLOB_KEY, htmlContent, {
        access: 'private',
        contentType: 'text/html; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: TOKEN,
      });
      return res.json({ ok: true, uploadedAt: new Date().toISOString(), size: htmlContent.length, url: result.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
