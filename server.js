const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── JSON FILE DATABASE ──
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const SUBSCRIBERS_FILE = path.join(dbDir, 'subscribers.json');
const CONTACTS_FILE    = path.join(dbDir, 'contacts.json');

function readDB(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return []; }
}

function writeDB(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── MIDDLEWARE ──
app.use(express.json());

// serve static files from root, block server internals
app.use(function (req, res, next) {
    const blocked = ['/server.js', '/package.json', '/package-lock.json'];
    if (blocked.includes(req.path)) return res.status(403).end();
    next();
});
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));

// ── YOUTUBE CACHE ──
const YT_CHANNEL_ID = 'UC7PYy5Tx1WhbnGKc3KJeRKw';
const YT_CACHE_TTL  = 60 * 60 * 1000; // 1 hour
let ytCache = { data: null, fetchedAt: 0 };

async function fetchYouTubeVideos() {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
    const xml = await res.text();

    const ids    = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
    const titles = [...xml.matchAll(/<media:title>([^<]+)<\/media:title>/g)].map(m => m[1]);
    const dates  = [...xml.matchAll(/<published>([^<]+)<\/published>/g)].map(m => m[1]);
    if (!ids.length) throw new Error('no videos in feed');

    return ids.slice(0, 8).map((id, i) => ({
        id,
        title:     titles[i] || 'Episode',
        published: dates[i + 1] || dates[0] || ''
    }));
}

// ── API: YouTube feed ──
app.get('/api/youtube', async (req, res) => {
    const now = Date.now();
    if (ytCache.data && now - ytCache.fetchedAt < YT_CACHE_TTL) {
        return res.json(ytCache.data);
    }
    try {
        const videos = await fetchYouTubeVideos();
        ytCache = { data: { videos }, fetchedAt: now };
        res.json({ videos });
    } catch (err) {
        if (ytCache.data) return res.json(ytCache.data); // serve stale on error
        res.status(502).json({ error: 'Could not fetch YouTube feed' });
    }
});

// ── API: Email subscribe ──
app.post('/api/subscribe', (req, res) => {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }
    const normalized = email.toLowerCase().trim();
    const subscribers = readDB(SUBSCRIBERS_FILE);

    if (subscribers.some(s => s.email === normalized)) {
        return res.json({ ok: true }); // already subscribed — success to user
    }

    subscribers.push({ id: Date.now(), email: normalized, created_at: new Date().toISOString() });
    writeDB(SUBSCRIBERS_FILE, subscribers);
    res.json({ ok: true });
});

// ── API: Contact form ──
app.post('/api/contact', (req, res) => {
    const { name, email, type, message } = req.body || {};
    if (!email || !message) {
        return res.status(400).json({ error: 'Email and message are required' });
    }
    const contacts = readDB(CONTACTS_FILE);
    contacts.push({
        id:         Date.now(),
        name:       name || null,
        email:      email.toLowerCase().trim(),
        type:       type || null,
        message,
        created_at: new Date().toISOString()
    });
    writeDB(CONTACTS_FILE, contacts);
    res.json({ ok: true });
});

// ── ADMIN: view data ──
app.get('/api/admin/subscribers', (req, res) => {
    const rows = readDB(SUBSCRIBERS_FILE);
    res.json({ count: rows.length, subscribers: rows });
});

app.get('/api/admin/contacts', (req, res) => {
    const rows = readDB(CONTACTS_FILE);
    res.json({ count: rows.length, contacts: rows });
});

app.listen(PORT, () => {
    console.log(`Rossen Reports running at http://localhost:${PORT}`);
});
