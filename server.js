const express = require('express');
const cors = require('cors');
const yts = require('yt-search');

const app = express();
app.use(cors({ origin: '*' }));

app.get('/', (req, res) => {
  res.json({ status: 'BeatWave API running', node: process.version, time: new Date().toISOString() });
});

app.get('/api/debug', async (req, res) => {
  const out = {};
  try {
    // Try multiple Jamendo client IDs
    const ids = ['b6747d04', '01b21b22', 'a6747d04'];
    for (const id of ids) {
      const r = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${id}&format=json&limit=2&search=love&audioformat=mp32`);
      const d = await r.json();
      if (d.results?.length > 0) {
        out.jamendo = { ok: true, client_id: id, count: d.results.length, first: d.results[0].name };
        break;
      } else {
        out['jamendo_'+id] = { count: 0, warning: d.headers?.warnings };
      }
    }
    if (!out.jamendo) out.jamendo = { ok: false, error: 'All client IDs rate limited' };
  } catch(e) { out.jamendo = { ok: false, error: e.message }; }
  try {
    const r = await yts('love song');
    out.youtube = { ok: true, count: r.videos?.length, first: r.videos?.[0]?.title };
  } catch(e) { out.youtube = { ok: false, error: e.message }; }
  res.json(out);
});

app.get('/api/jamendo', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  // Try multiple client IDs until one works
  const clientIds = ['b6747d04', '01b21b22', 'b6747d04'];
  for (const clientId of clientIds) {
    try {
      const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=30&search=${encodeURIComponent(q)}&audioformat=mp32&imagesize=200`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.results?.length > 0) return res.json(d);
    } catch(e) { continue; }
  }
  // If all rate limited, return empty but valid response
  res.json({ results: [], headers: { warnings: 'Jamendo rate limited - try again in a few minutes or register for a free API key at developer.jamendo.com' } });
});

app.get('/api/youtube', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    const r = await yts(q);
    const videos = (r.videos || []).slice(0, 25).map(v => ({
      videoId: v.videoId,
      title: v.title,
      author: v.author?.name || '',
      lengthSeconds: v.seconds || 0,
      thumbnail: v.thumbnail
    })).filter(v => v.videoId);
    res.json({ results: videos });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BeatWave API on port ' + PORT));

// SoundCloud search via scraping their public API
app.get('/api/soundcloud', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    // SoundCloud public search - no API key needed for this endpoint
    const r = await fetch(
      `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html' } }
    );
    const html = await r.text();
    // Extract track URLs from the page
    const matches = [...html.matchAll(/"url":"(https:\/\/soundcloud\.com\/[^"]+\/[^"]+)","kind":"track"/g)];
    const titleMatches = [...html.matchAll(/"title":"([^"]+)","permalink"/g)];
    const artMatches = [...html.matchAll(/"artwork_url":"([^"]+)"/g)];
    const userMatches = [...html.matchAll(/"username":"([^"]+)"/g)];
    const results = matches.slice(0, 20).map((m, i) => ({
      id: 'sc_' + i,
      title: titleMatches[i]?.[1] || 'Track ' + (i+1),
      artist: userMatches[i]?.[1] || '',
      art: (artMatches[i]?.[1] || '').replace('-large', '-t300x300').replace(/\\\//g, '/'),
      url: m[1],
      src: 'SoundCloud'
    }));
    if (results.length) return res.json({ results });
    // Fallback: return a search result
    res.json({ results: [{ id: 'sc_0', title: 'Search on SoundCloud', artist: q, art: '', url: 'https://soundcloud.com/search?q='+encodeURIComponent(q), src: 'SoundCloud', isBrowse: true }] });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
