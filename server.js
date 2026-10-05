const express = require('express');
const cors = require('cors');
const yts = require('yt-search');

const app = express();
app.use(cors({ origin: '*' }));

app.get('/', (req, res) => {
  res.json({ status: 'BeatWave API running ✓', time: new Date().toISOString() });
});

// Get SoundCloud client_id dynamically from their page
async function getSCClientId() {
  try {
    const r = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const html = await r.text();
    // Find script URLs
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    // Check last few scripts for client_id
    for (const scriptUrl of scripts.slice(-5)) {
      try {
        const sr = await fetch(scriptUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
        });
        const js = await sr.text();
        const match = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match) return match[1];
      } catch(e) { continue; }
    }
  } catch(e) {}
  // Fallback known client_ids
  return 'iZIs9mchVcX5lhVRyQNGAu6399c0Bb2z';
}

let cachedClientId = null;
let clientIdExpiry = 0;

async function getClientId() {
  if (cachedClientId && Date.now() < clientIdExpiry) return cachedClientId;
  cachedClientId = await getSCClientId();
  clientIdExpiry = Date.now() + 60 * 60 * 1000; // cache 1 hour
  console.log('SC client_id:', cachedClientId);
  return cachedClientId;
}

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  const out = {};
  try {
    const r = await fetch('https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&format=json&limit=1&search=love&audioformat=mp32');
    const d = await r.json();
    out.jamendo = { ok: r.ok, count: d.results?.length, warning: d.headers?.warnings };
  } catch(e) { out.jamendo = { ok: false, error: e.message }; }
  try {
    const r = await yts('love song');
    out.youtube = { ok: true, count: r.videos?.length, first: r.videos?.[0]?.title };
  } catch(e) { out.youtube = { ok: false, error: e.message }; }
  try {
    const cid = await getClientId();
    out.soundcloud_client_id = cid;
    const r = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=love&client_id=${cid}&limit=2`, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' }
    });
    const d = await r.json();
    out.soundcloud = { ok: r.ok, status: r.status, count: d.collection?.length, first: d.collection?.[0]?.title };
  } catch(e) { out.soundcloud = { ok: false, error: e.message }; }
  res.json(out);
});

// YouTube search
app.get('/api/youtube', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    const r = await yts(q);
    const videos = (r.videos || []).slice(0, 25).map(v => ({
      videoId: v.videoId, title: v.title, author: v.author?.name || '',
      lengthSeconds: v.seconds || 0, thumbnail: v.thumbnail
    })).filter(v => v.videoId);
    res.json({ results: videos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// SoundCloud search - gets real track URLs for widget embed
app.get('/api/soundcloud', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    const cid = await getClientId();
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=20&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', 'Accept': 'application/json' }
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: `SoundCloud API ${r.status}: ${txt.slice(0, 100)}` });
    }
    const d = await r.json();
    const tracks = (d.collection || []).filter(t => t.permalink_url).map(t => ({
      id: 'sc_' + t.id,
      title: t.title || '?',
      artist: t.user?.username || '',
      art: (t.artwork_url || '').replace('-large', '-t300x300'),
      url: t.permalink_url, // SoundCloud track URL - used by widget
      src: 'SoundCloud',
      dur: Math.round((t.duration || 0) / 1000)
    }));
    res.json({ results: tracks });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Jamendo
app.get('/api/jamendo', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    const r = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&format=json&limit=30&search=${encodeURIComponent(q)}&audioformat=mp32&imagesize=200`);
    const d = await r.json();
    res.json(d);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BeatWave on :' + PORT));
