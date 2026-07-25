const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const { getScamFeed } = require('./lib/scamFeed');
const storage = require('./lib/storage');

const app  = express();
const PORT = process.env.PORT || 3000;

// Where content actually lives is lib/storage's problem: disk in development,
// Vercel Blob in production when a store is configured. Vercel's filesystem is
// read-only and disposable, which is why writes cannot simply go to db/*.json.

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

    // Order the sections appear in on the homepage. The server rebuilds
    // index.html to match, so DOM order always equals visual order — using CSS
    // `order` instead would leave keyboard and screen-reader users navigating a
    // different sequence from the one everyone else sees.
    // 'home' is deliberately absent: the hero is always first.
    sectionOrder: ['latest', 'alerts', 'deals', 'wins', 'subscribe', 'follow', 'shop', 'about', 'contact'],

    // 'auto' tracks the newest upload on the channel. 'manual' pins a specific
    // video, for when the newest upload isn't the one to lead with.
    featuredVideo: { mode: 'auto', videoId: '' },

    socialLinks: {
        featured: {
            name: 'YouTube', handle: '@RossenReports',
            desc: 'New episodes every Wednesday & Friday — subscribe for alerts',
            url: 'https://www.youtube.com/@RossenReports',
        },
        links: [
            { name: 'Instagram', handle: '@jeffrossen', url: 'https://www.instagram.com/jeffrossen/', icon: 'fab fa-instagram', color: '#e1306c' },
            { name: 'TikTok', handle: '@rossen.reports', url: 'https://www.tiktok.com/@rossen.reports', icon: 'fab fa-tiktok', color: '#ff0050' },
            { name: 'Facebook', handle: '@rossenreports', url: 'https://www.facebook.com/rossenreports', icon: 'fab fa-facebook-f', color: '#1877f2' },
            { name: 'X / Twitter', handle: '@jeffrossen', url: 'https://x.com/jeffrossen', icon: 'fab fa-x-twitter', color: '#ffffff' },
            { name: 'Substack', handle: 'Rossen Reports Newsletter', url: 'https://rossenreports.substack.com/', icon: 'fas fa-newspaper', color: '#ff6719' },
            { name: 'Podcast', handle: 'Rossen Reports on Apple Podcasts', url: 'https://podcasts.apple.com/us/podcast/rossen-reports/id1861532501', icon: 'fas fa-podcast', color: '#fc3c44' },
            // #3f9ae0 rather than LinkedIn's #0a66c2: the brand blue is 2.58:1 on
            // the card's hover background, under the 3:1 needed for a UI element.
            { name: 'LinkedIn', handle: 'Jeff Rossen — Rossen Media', url: 'https://www.linkedin.com/in/jeffrossen/', icon: 'fab fa-linkedin-in', color: '#3f9ae0' },
        ],
    },

    shopLinks: [
        { platform: 'Amazon', name: "Jeff's Amazon Shop", desc: "Hand-picked products, deals, and recommendations straight from Jeff's consumer investigations.", url: 'https://www.amazon.com/shop/jeffrossen' },
        { platform: 'Walmart', name: 'Walmart Storefront', desc: "Jeff's curated Walmart picks — quality products at prices that actually make sense.", url: 'https://www.walmart.com/creator/storefront?creator=rossenreports' },
        { platform: 'DealSeek', name: 'DealSeek Collection', desc: 'Exclusive deals and steals curated by the Rossen Reports team. Updated regularly.', url: 'https://dealseek.com/collections/rossen_reports' },
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

// Named documents, not file paths — lib/storage picks disk or Blob per environment.
const DOC = { subscribers: 'subscribers', contacts: 'contacts', deals: 'deals', content: 'content' };

const readDB  = (doc, fallback) => storage.read(doc, fallback !== undefined ? fallback : []);
const writeDB = (doc, data) => storage.write(doc, data);

// Storage is async now. Express 4 does not forward a rejected promise to the
// error middleware, so handlers are wrapped instead of relying on the
// synchronous throw that the old filesystem writes used.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── MIDDLEWARE ──
app.use(express.json());

// serve static files from root, block server internals
app.use(function (req, res, next) {
    const blocked = ['/server.js', '/package.json', '/package-lock.json'];
    if (blocked.includes(req.path)) return res.status(403).end();
    next();
});

// ── HOMEPAGE: sections reordered server-side ──
// Reordering here rather than in the browser keeps DOM order identical to
// visual order. Doing it with CSS `order` would be far less code but would
// leave keyboard and screen-reader users moving through the page in a
// different sequence from the one shown, which is a WCAG 1.3.2 failure.
const INDEX_PATH = path.join(__dirname, 'index.html');
let orderedPage = { key: null, html: null };

function reorderSections(html, order) {
    const START = '<!-- ── LATEST EPISODE ── -->';
    const END = '\n</main>';
    const i = html.indexOf(START), j = html.indexOf(END);
    if (i < 0 || j < 0 || j < i) return html;         // markup moved; serve as-is

    const blocks = html.slice(i, j).split(/\n(?=<!-- ── )/);
    const byId = {};
    for (const b of blocks) {
        const m = b.match(/<section[^>]*\sid="([\w-]+)"/);
        if (m) byId[m[1]] = b.replace(/\s+$/, '');
    }
    // Anything the saved order doesn't mention still gets rendered, appended in
    // its original position — a stale order must never silently drop a section.
    const ids = order.filter(id => byId[id]);
    for (const id of Object.keys(byId)) if (!ids.includes(id)) ids.push(id);
    if (!ids.length) return html;

    return html.slice(0, i) + ids.map(id => byId[id]).join('\n\n') + '\n' + html.slice(j);
}

app.get(['/', '/index.html'], async (req, res, next) => {
    try {
        const content = await getContent();
        const order = Array.isArray(content.sectionOrder) && content.sectionOrder.length
            ? content.sectionOrder
            : DEFAULT_CONTENT.sectionOrder;
        const key = order.join(',');
        if (orderedPage.key !== key) {
            orderedPage = { key, html: reorderSections(fs.readFileSync(INDEX_PATH, 'utf8'), order) };
        }
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        res.send(orderedPage.html);
    } catch (e) {
        next();     // fall through to the static handler below
    }
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
app.post('/api/subscribe', wrap(async (req, res) => {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }
    const normalized = email.toLowerCase().trim();
    const subscribers = await readDB(DOC.subscribers);

    if (subscribers.some(s => s.email === normalized)) {
        return res.json({ ok: true }); // already subscribed — success to user
    }

    subscribers.push({ id: Date.now(), email: normalized, created_at: new Date().toISOString() });
    await writeDB(DOC.subscribers, subscribers);
    res.json({ ok: true });
}));

// ── API: Contact form ──
app.post('/api/contact', wrap(async (req, res) => {
    const { name, email, type, message } = req.body || {};
    if (!email || !message) {
        return res.status(400).json({ error: 'Email and message are required' });
    }
    const contacts = await readDB(DOC.contacts);
    contacts.push({
        id:         Date.now(),
        name:       name || null,
        email:      email.toLowerCase().trim(),
        type:       type || null,
        message,
        created_at: new Date().toISOString()
    });
    await writeDB(DOC.contacts, contacts);
    res.json({ ok: true });
}));

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

app.get('/api/admin/subscribers', requireAdmin, wrap(async (req, res) => {
    const rows = await readDB(DOC.subscribers);
    res.json({ count: rows.length, subscribers: rows });
}));

app.delete('/api/admin/subscribers/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await readDB(DOC.subscribers);
    const next = rows.filter(r => r.id !== id);
    if (next.length === rows.length) return res.status(404).json({ error: 'not found' });
    await writeDB(DOC.subscribers, next);
    res.json({ ok: true });
}));

app.get('/api/admin/contacts', requireAdmin, wrap(async (req, res) => {
    const rows = await readDB(DOC.contacts);
    res.json({ count: rows.length, contacts: rows });
}));

app.patch('/api/admin/contacts/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (status !== 'new' && status !== 'handled') return res.status(400).json({ error: 'status must be "new" or "handled"' });
    const rows = await readDB(DOC.contacts);
    const row = rows.find(r => r.id === id);
    if (!row) return res.status(404).json({ error: 'not found' });
    row.status = status;
    await writeDB(DOC.contacts, rows);
    res.json({ ok: true });
}));

app.delete('/api/admin/contacts/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await readDB(DOC.contacts);
    const next = rows.filter(r => r.id !== id);
    if (next.length === rows.length) return res.status(404).json({ error: 'not found' });
    await writeDB(DOC.contacts, next);
    res.json({ ok: true });
}));

// ── SITE CONTENT: public read, admin-only write ──
// A document saved before a field existed simply won't have it, so stored
// content is layered over the defaults rather than replacing them. Without
// this, every field added from here on would read as undefined for anyone who
// had already used the control board once.
function withDefaults(stored) {
    return Object.assign({}, DEFAULT_CONTENT, stored || {});
}

async function getContent() {
    return withDefaults(await readDB(DOC.content, null));
}

app.get('/api/content', wrap(async (req, res) => {
    res.json(await getContent());
}));

app.post('/api/admin/content', requireAdmin, wrap(async (req, res) => {
    const content = req.body || {};
    if (!content.hero || !content.about || !Array.isArray(content.testimonials)) {
        return res.status(400).json({ error: 'content must include hero, about, and testimonials' });
    }
    if (content.sectionOrder !== undefined) {
        const known = DEFAULT_CONTENT.sectionOrder;
        const order = content.sectionOrder;
        if (!Array.isArray(order) || order.some(id => !known.includes(id)) || new Set(order).size !== order.length) {
            return res.status(400).json({ error: 'sectionOrder must be a list of known section ids with no duplicates' });
        }
    }
    // Merge so a panel that only edits one area can't blank out the others.
    await writeDB(DOC.content, Object.assign({}, await getContent(), content));
    res.json({ ok: true });
}));

// ── DEALS OF THE WEEK: public read, admin-only write ──
app.get('/api/deals', wrap(async (req, res) => {
    res.json({ deals: await readDB(DOC.deals, DEFAULT_DEALS) });
}));

app.post('/api/admin/deals', requireAdmin, wrap(async (req, res) => {
    const { deals } = req.body || {};
    if (!Array.isArray(deals) || !deals.length) {
        return res.status(400).json({ error: 'deals must be a non-empty array' });
    }
    for (const d of deals) {
        if (!d.category || !d.name || !d.desc || !d.href || !d.cta) {
            return res.status(400).json({ error: 'each deal needs category, name, desc, href, and cta' });
        }
    }
    await writeDB(DOC.deals, deals);
    res.json({ ok: true });
}));

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
