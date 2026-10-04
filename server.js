const express = require('express');
const cors = require('cors');
const yts = require('yt-search');

const app = express();
app.use(cors({ origin: '*' }));

app.get('/', (req, res) => {
  res.json({ status: 'BeatWave API running ✓', time: new Date().toISOString() });
});

// YouTube search
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// SoundCloud search - returns real track URLs for widget embed
app.get('/api/soundcloud', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    // Use SoundCloud's public search API (no key needed for widget client_id)
    const CLIENT_ID = 'iZIs9mchVcX5lhVRyQNGAu6399c0Bb2z';
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${CLIENT_ID}&limit=20&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('SC API ' + r.status);
    const d = await r.json();
    const tracks = (d.collection || []).filter(t => t.permalink_url && t.streamable).map(t => ({
      id: 'sc_' + t.id,
      title: t.title || '?',
      artist: t.user?.username || '',
      art: (t.artwork_url || '').replace('-large', '-t300x300'),
      url: t.permalink_url,
      src: 'SoundCloud',
      dur: Math.round((t.duration || 0) / 1000)
    }));
    res.json({ results: tracks });
  } catch(e) {
    // fallback client_id
    try {
      const CID = 'a3e059563d7fd3372b49b37f00a00bcf';
      const url2 = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${CID}&limit=20`;
      const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r2.ok) throw new Error('SC fallback ' + r2.status);
      const d2 = await r2.json();
      const tracks2 = (d2.collection || []).filter(t => t.permalink_url && t.streamable).map(t => ({
        id: 'sc_' + t.id, title: t.title || '?', artist: t.user?.username || '',
        art: (t.artwork_url || '').replace('-large', '-t300x300'),
        url: t.permalink_url, src: 'SoundCloud', dur: Math.round((t.duration || 0) / 1000)
      }));
      res.json({ results: tracks2 });
    } catch(e2) { res.status(500).json({ error: e.message + ' / ' + e2.message }); }
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
