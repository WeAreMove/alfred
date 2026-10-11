const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1puihDnHDUkrXhIWrNKpB6P4JsxZ6FRRUe5Y6oJBWz0I';

// Simple in-memory cache (5 minutes)
let cache = null;
let cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  // Bust cache with ?refresh=1
  if (req.query && req.query.refresh) { cache = null; cacheAt = 0; }

  if (cache && Date.now() - cacheAt < CACHE_MS) {
    return res.json(cache);
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
    const r = await fetch(csvUrl, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: `Sheet fetch failed: ${r.status}` });

    const csv = await r.text();
    const rows = parseCSV(csv);
    if (rows.length < 2) return res.status(502).json({ error: 'Sheet appears empty' });

    const [header] = rows;
    // header: ['Filename', 'Translation code', 'bg', 'de', 'en', 'he', 'ro', 'tr']
    const langCols = header.slice(2);
    const bundles = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const bundle = (row[0] || '').trim();
      const key    = (row[1] || '').trim();
      if (!bundle || !key) continue;

      if (!bundles[bundle]) bundles[bundle] = [];
      const entry = { key };
      langCols.forEach((lang, idx) => {
        entry[lang.trim()] = (row[2 + idx] || '').trim();
      });
      bundles[bundle].push(entry);
    }

    cache = { languages: langCols.map(l => l.trim()), bundles };
    cacheAt = Date.now();
    return res.json(cache);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ─── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } // escaped quote
        inQ = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\r') {
        // skip
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else {
        cell += ch;
      }
    }
    i++;
  }
  // last cell / row
  row.push(cell);
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}
