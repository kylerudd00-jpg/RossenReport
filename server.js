const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const { getScamFeed } = require('./lib/scamFeed');

const app  = express();
const PORT = process.env.PORT || 3000;

// Vercel runs this as a serverless function on a READ-ONLY filesystem, and any
// instance is thrown away between requests. Reads still work (the db/*.json files
// ship with the deployment), but writes cannot persist. Rather than accept a
// write and silently drop a real advertiser lead, writes fail loudly here — see
// writeDB below.
const EPHEMERAL_FS = !!process.env.VERCEL;

// ── JSON FILE DATABASE ──
const dbDir = path.join(__dirname, 'db');
try {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
} catch (e) {
    if (!EPHEMERAL_FS) throw e;   // read-only FS in prod is expected
}

const SUBSCRIBERS_FILE = path.join(dbDir, 'subscribers.json');
const CONTACTS_FILE    = path.join(dbDir, 'contacts.json');
const DEALS_FILE       = path.join(dbDir, 'deals.json');
const CONTENT_FILE     = path.join(dbDir, 'content.json');

const DEFAULT_CONTENT = {
    hero: {
        eyebrow: 'Award-Winning Consumer Journalist',
        taglineLine1: 'Saving you money, exposing scams, and revealing the best deals.',
        taglineLine2: 'Your trusted guide to living smarter.',
        stats: [
            { value: '2.4', suffix: 'M+', label: 'Followers' },
            { value: '40', suffix: 'K+', label: 'Subscribers' },
            { value: '15', suffix: '+', label: 'Years on Air' },
        ],
    },
    about: {
        quote: "I'll save you money by revealing the best deals, and exposing the worst scams — the stories that actually matter to your life.",
        credentials: [
            { num: '15+', label: 'Years as a National News Correspondent (NBC & Hearst)' },
            { num: 'Peabody & Murrow', label: 'Award Winner for 9/11 Coverage, Plus an Emmy' },
            { num: 'Best-Selling', label: 'Author of Rossen to the Rescue — Get the Book' },
            { num: '2.4M+', label: 'Followers Across All Platforms' },
        ],
    },
    testimonials: [
        { quote: "Jeff's tip about hidden cable fees saved me $87 a month. I called my provider and they dropped the charges immediately.", name: 'Linda M., Ohio' },
        { quote: "I almost fell for a fake IRS scam call. Watched Jeff's segment that morning and knew exactly what to do. He literally saved me $2,000.", name: 'Dave K., Florida' },
        { quote: 'Bought a security camera Jeff recommended on Amazon — half the price of the brand-name ones and works even better.', name: 'Maria T., Texas' },
        { quote: "Jeff showed us the hidden fees on travel booking sites. Booked directly and saved $340 on our family vacation.", name: 'The Hendersons, New York' },
        { quote: "My mom almost wired $3,000 to a scammer. I'd watched Rossen Reports the week before and recognized every red flag.", name: 'Rachel S., Illinois' },
        { quote: "Used Jeff's grocery savings tricks for one month and cut my weekly bill from $180 to $115. Every single week now.", name: 'Tom B., Michigan' },
        { quote: 'Jeff exposed a contractor scam targeting seniors in my neighborhood. Shared the episode and three families avoided getting ripped off.', name: 'Carol W., Pennsylvania' },
        { quote: 'I negotiated my medical bill down 40% using exactly the script Jeff laid out. The hospital agreed without a fight.', name: 'James R., Georgia' },
    ],
};

// ships hardcoded so a fresh clone (db/ is gitignored) still renders the site
// correctly before anyone has used the admin editor to change anything.
const DEFAULT_DEALS = [
    { icon: 'fa-shield-alt',   category: 'Home Security',   name: 'Best Security Cameras This Week',
      desc: "Jeff tested dozens — these are the cameras that actually protect your home without breaking the bank.",
      href: 'https://www.amazon.com/shop/jeffrossen', cta: 'Shop Now' },
    { icon: 'fa-shopping-cart', category: 'Grocery Savings', name: 'Stop Overpaying at the Store',
      desc: "Walmart deals most shoppers walk right past — Jeff's picks for maximum savings on everyday essentials.",
      href: 'https://www.walmart.com/creator/storefront?creator=rossenreports', cta: 'See Deals' },
    { icon: 'fa-plane',        category: 'Travel Steals',    name: "Hidden Travel Deals Airlines Won't Tell You",
      desc: "The prices airlines and hotels don't advertise — exposed by Jeff's consumer investigations team.",
      href: 'https://dealseek.com/collections/rossen_reports', cta: 'See Deals' },
    { icon: 'fa-microchip',    category: 'Top Tech',         name: 'Best Tech Under $50',
      desc: "Consumer gadgets that actually deliver on their promises — vetted and recommended by Jeff's team.",
      href: 'https://www.amazon.com/shop/jeffrossen', cta: 'Explore' },
];

function readDB(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return fallback !== undefined ? fallback : []; }
}

function writeDB(file, data) {
    if (EPHEMERAL_FS) {
        // Deliberately throws. A 500 the team can see and fix beats a 200 that
        // quietly discards a newsletter signup or an advertiser inquiry.
        const err = new Error('Storage is not configured for this deployment, so this could not be saved.');
        err.code = 'no_persistent_storage';
        throw err;
    }
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
        res.json({ videos: [{ id: 'pVH0evvebRw', title: 'Latest Episode', published: '' }] });
    }
});

// ── API: Live scam alerts (federal consumer-protection agencies only) ──
// Read-only and cached in memory by the module, so this works fine on the
// ephemeral filesystem that blocks the write-backed endpoints below.
app.get('/api/scams', async (req, res) => {
    try {
        res.json(await getScamFeed());
    } catch (err) {
        // An empty list renders as "check back soon" rather than a broken section.
        res.json({ alerts: [], updatedAt: null, sources: [] });
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

// ── ADMIN: control board (login-gated) ──
// derived from the password, not random, so a server restart doesn't log everyone out
// No hardcoded fallback in production — a default password baked into source is
// a default password on the public internet. Local dev keeps the convenience.
const ADMIN_KEY = process.env.ADMIN_KEY || (process.env.VERCEL ? null : 'Rossen!');
if (!ADMIN_KEY) console.warn('[admin] ADMIN_KEY is not set — the control board is disabled.');
const ADMIN_TOKEN = ADMIN_KEY ? crypto.createHash('sha256').update(ADMIN_KEY).digest('hex') : null;
const ADMIN_COOKIE = 'rr_admin';

function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}
function isAdmin(req) { return !!ADMIN_TOKEN && parseCookies(req)[ADMIN_COOKIE] === ADMIN_TOKEN; }
function requireAdmin(req, res, next) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    next();
}

app.post('/admin/login', (req, res) => {
    const { key } = req.body || {};
    // The !ADMIN_KEY guard matters: without it a posted null would equal an unset
    // key and authenticate.
    if (!ADMIN_KEY || typeof key !== 'string' || key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Incorrect password' });
    }
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${ADMIN_TOKEN}; Max-Age=${60 * 60 * 24 * 365}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ ok: true });
});
app.post('/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Max-Age=0; Path=/`);
    res.json({ ok: true });
});
app.get('/api/admin/session', (req, res) => res.json({ authed: isAdmin(req) }));

app.get('/api/admin/subscribers', requireAdmin, (req, res) => {
    const rows = readDB(SUBSCRIBERS_FILE);
    res.json({ count: rows.length, subscribers: rows });
});

app.delete('/api/admin/subscribers/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const rows = readDB(SUBSCRIBERS_FILE);
    const next = rows.filter(r => r.id !== id);
    if (next.length === rows.length) return res.status(404).json({ error: 'not found' });
    writeDB(SUBSCRIBERS_FILE, next);
    res.json({ ok: true });
});

app.get('/api/admin/contacts', requireAdmin, (req, res) => {
    const rows = readDB(CONTACTS_FILE);
    res.json({ count: rows.length, contacts: rows });
});

app.patch('/api/admin/contacts/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (status !== 'new' && status !== 'handled') return res.status(400).json({ error: 'status must be "new" or "handled"' });
    const rows = readDB(CONTACTS_FILE);
    const row = rows.find(r => r.id === id);
    if (!row) return res.status(404).json({ error: 'not found' });
    row.status = status;
    writeDB(CONTACTS_FILE, rows);
    res.json({ ok: true });
});

app.delete('/api/admin/contacts/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const rows = readDB(CONTACTS_FILE);
    const next = rows.filter(r => r.id !== id);
    if (next.length === rows.length) return res.status(404).json({ error: 'not found' });
    writeDB(CONTACTS_FILE, next);
    res.json({ ok: true });
});

// ── SITE CONTENT: hero / about / testimonials — public read, admin-only write ──
app.get('/api/content', (req, res) => {
    res.json(readDB(CONTENT_FILE, DEFAULT_CONTENT));
});

app.post('/api/admin/content', requireAdmin, (req, res) => {
    const content = req.body || {};
    if (!content.hero || !content.about || !Array.isArray(content.testimonials)) {
        return res.status(400).json({ error: 'content must include hero, about, and testimonials' });
    }
    writeDB(CONTENT_FILE, content);
    res.json({ ok: true });
});

// ── DEALS OF THE WEEK: public read, admin-only write ──
app.get('/api/deals', (req, res) => {
    res.json({ deals: readDB(DEALS_FILE, DEFAULT_DEALS) });
});

app.post('/api/admin/deals', requireAdmin, (req, res) => {
    const { deals } = req.body || {};
    if (!Array.isArray(deals) || !deals.length) {
        return res.status(400).json({ error: 'deals must be a non-empty array' });
    }
    for (const d of deals) {
        if (!d.category || !d.name || !d.desc || !d.href || !d.cta) {
            return res.status(400).json({ error: 'each deal needs category, name, desc, href, and cta' });
        }
    }
    writeDB(DEALS_FILE, deals);
    res.json({ ok: true });
});

// Surfaces the "can't persist here" case as a readable 503. Express forwards
// synchronous throws from route handlers here automatically, so no per-route
// wrapping is needed. Must stay last, after every route.
app.use((err, req, res, next) => {
    if (err && err.code === 'no_persistent_storage') {
        return res.status(503).json({ error: err.code, message: err.message });
    }
    return next(err);
});

// On Vercel this module is imported by api/index.js and the platform owns the
// listener; only bind a port when run directly (local dev).
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Rossen Reports running at http://localhost:${PORT}`);
    });
}

module.exports = app;
