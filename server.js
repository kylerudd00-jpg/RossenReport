const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { getScamFeed } = require('./lib/scamFeed');
const { getNewsletterFeed } = require('./lib/newsletterFeed');
const storage = require('./lib/storage');

const app  = express();
app.disable('x-powered-by');   // don't advertise the framework
const PORT = process.env.PORT || 3000;

// Where content actually lives is lib/storage's problem: disk in development,
// Vercel Blob in production when a store is configured. Vercel's filesystem is
// read-only and disposable, which is why writes cannot simply go to db/*.json.

const DEFAULT_CONTENT = {
    hero: {
        eyebrow: 'This week',
        taglineLine1: 'Jeff Rossen tracks down the deals worth your money. Every week, free.',
        taglineLine2: '',
        // The stat band was cut in the Nov 2026 redesign. Kept as an empty list
        // because the control board's save endpoint still sends the field.
        stats: [],
    },
    about: {
        quote: "I'll save you money by revealing the best deals, and exposing the worst scams, the stories that actually matter to your life.",
        // Printed as the receipt in the About section: label on the left, num on
        // the right. A label containing "subscriber" picks up the live YouTube count.
        credentials: [
            { num: '2001', label: 'WABC-TV New York' },
            { num: '2008-19', label: 'NBC News / TODAY' },
            { num: '2019-24', label: 'Hearst Television' },
            { num: '2017', label: 'Book: Rossen to the Rescue' },
            { num: '773K', label: 'YouTube subscribers' },
        ],
    },
    // Testimonials were cut in the Nov 2026 redesign (none could be verified).
    testimonials: [],

    // Order the sections appear in on the homepage. The server rebuilds
    // index.html to match, so DOM order always equals visual order — using CSS
    // `order` instead would leave keyboard and screen-reader users navigating a
    // different sequence from the one everyone else sees.
    // 'home' is deliberately absent: the hero is always first.
    sectionOrder: ['deals', 'subscribe', 'latest', 'alerts', 'about', 'follow'],

    // 'auto' tracks the newest upload on the channel. 'manual' pins a specific
    // video, for when the newest upload isn't the one to lead with.
    // posterUrl overrides the YouTube thumbnail for the hero image only. YouTube
    // caps maxresdefault at 1280x720, which is 1.82x upscaled at the size this is
    // drawn on a 2x display — there is no higher thumbnail to ask for, so the only
    // way to a sharp hero is to supply the image.
    featuredVideo: { mode: 'auto', videoId: '', posterUrl: '' },

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
    // Shown as the "Shop with Jeff" line under the circular: short store names.
    { icon: 'fa-amazon', category: 'Storefront', name: 'Amazon', desc: "Jeff's Amazon picks",
      href: 'https://www.amazon.com/shop/jeffrossen', cta: 'Shop' },
    { icon: 'fa-store', category: 'Storefront', name: 'Walmart', desc: "Everyday essentials",
      href: 'https://www.walmart.com/creator/storefront?creator=rossenreports', cta: 'Shop' },
    { icon: 'fa-tag', category: 'Storefront', name: 'DealSeek', desc: "Deal collection",
      href: 'https://dealseek.com/collections/rossen_reports', cta: 'Shop' },
];

// Named documents, not file paths — lib/storage picks disk or Blob per environment.
const DOC = { deals: 'deals', content: 'content' };

const readDB  = (doc, fallback) => storage.read(doc, fallback !== undefined ? fallback : []);

// Storage is async now. Express 4 does not forward a rejected promise to the
// error middleware, so handlers are wrapped instead of relying on the
// synchronous throw that the old filesystem writes used.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── MIDDLEWARE ──

// ── CDN CACHING ──
// Every request on Vercel runs this function, so without these headers each
// visitor re-ran it for the page, every image and every feed. s-maxage lets
// Vercel's CDN answer repeat requests itself; a new deploy clears that cache.
// Pages and the editable content refresh within a minute; feeds within five.
const PAGE_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
const PUBLIC_API_CACHE = {
    '/api/content': PAGE_CACHE,
    '/api/deals': PAGE_CACHE,
    '/api/youtube': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    '/api/scams': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    '/api/newsletter': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    '/api/stats': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
};
app.use((req, res, next) => {
    if (req.method === 'GET' && PUBLIC_API_CACHE[req.path]) res.set('Cache-Control', PUBLIC_API_CACHE[req.path]);
    next();
});

// Security headers on every response. The CSP lists every origin the pages
// load from; inline scripts and styles are allowed because the pages are built
// from them. Adding a new third-party script, font or embed means adding it here.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: https:",
    "frame-src https://www.youtube-nocookie.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
].join('; ');
app.use((req, res, next) => {
    res.set({
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'SAMEORIGIN',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
});

// Server internals are bundled next to the public files, so express.static
// would hand them out. Instead of blocking known names (which encoded paths
// like /%73erver.js slipped past), static files are served only from an
// allowlist, checked on the decoded, normalised path the file server sees.
const PUBLIC_FILE = /^\/(?:[\w.-]+\.(?:html|png|jpe?g|webp)|jeff\/[\w.-]+\.(?:js|css|json|webp))$/;
function isPublicFile(rawPath) {
    let p;
    try { p = path.posix.normalize(decodeURIComponent(rawPath)); } catch (_) { return false; }
    return PUBLIC_FILE.test(p) && !p.includes('..');
}

// ── robots.txt, sitemap, favicon ──
// Served from code because the function bundle only includes html/png/jpg.
const SITE = 'https://www.rossenreports.com';
app.get('/robots.txt', (req, res) => {
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
        .send(`User-agent: *\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
        .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}/</loc><changefreq>daily</changefreq></url>\n<url><loc>${SITE}/deals</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n<url><loc>${SITE}/privacy</loc><changefreq>yearly</changefreq></url>\n</urlset>\n`);
});
// Browsers ask for /favicon.ico on their own; without this every visit 404s through the function.
app.get('/favicon.ico', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800').type('image/png').sendFile(path.join(__dirname, 'rossenlogo.png'));
});

// Friendly 404 in the site's look, pointing people at the deals. Cached
// briefly so scanners probing random paths mostly hit the CDN.
function notFound(req, res) {
    res.status(404).set('Cache-Control', 'public, max-age=0, s-maxage=300').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | Rossen Reports</title><meta name="robots" content="noindex"><link rel="icon" href="/rossenlogo.png"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f2f5;color:#0a0f1a;font:400 1.0625rem/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:16px}main{max-width:440px;background:#fff;border-radius:16px;padding:32px 24px;text-align:center;box-shadow:0 1px 1px #0b2c6b0d,0 6px 12px #0b2c6b12}img{height:44px;width:auto}h1{font-size:1.75rem;margin:16px 0 8px}p{margin:0 0 24px;color:#4a4f58}a.btn{display:inline-flex;align-items:center;min-height:52px;padding:0 24px;border-radius:16px;background:#ffd100;color:#0b2c6b;font-weight:600;text-decoration:none}a.home{display:block;margin-top:16px;color:#0a58c1}:focus-visible{outline:3px solid #0a58c1;outline-offset:2px}</style></head><body><main><img src="/rossenlogo-trim.png" alt="Rossen Reports" width="73" height="44"><h1>Page not found</h1><p>That page doesn’t exist, but Jeff’s deals do.</p><a class="btn" href="/deals">See Jeff’s deals</a><a class="home" href="/">Go to the home page</a></main></body></html>`);
}

// ── HOMEPAGE: sections reordered server-side ──
// Reordering here rather than in the browser keeps DOM order identical to
// visual order. Doing it with CSS `order` would be far less code but would
// leave keyboard and screen-reader users moving through the page in a
// different sequence from the one shown, which is a WCAG 1.3.2 failure.
const INDEX_PATH = path.join(__dirname, 'index.html');

function reorderSections(html, order) {
    const START = '<!-- ── SECTIONS START ── -->';
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

// ── /deals: Jeff's full deal list ──
// The list lives in db/deal-list.json (edited by hand for now) and is rendered
// into deals.html here, so the page works and is indexable without scripts.
const DEALS_PAGE = path.join(__dirname, 'deals.html');
const DEAL_LIST  = path.join(__dirname, 'db', 'deal-list.json');
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function renderDealsPage(opts) {
    const data = JSON.parse(fs.readFileSync(DEAL_LIST, 'utf8'));
    const cats = (data.categories || []).filter(c => c.deals && c.deals.length);
    const total = cats.reduce((n, c) => n + c.deals.length, 0);
    // Numbered in the video's order, so "deal 12" in the video is #12 here.
    let num = 0;
    cats.forEach(c => c.deals.forEach(d => { d.num = ++num; }));
    const money = n => '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const priceLine = d => {
        const p = Number(d.price), w = Number(d.was);
        if (!(p > 0)) return '';
        const off = w > p ? Math.round((w - p) / w * 100) : 0;
        return `<span class="deal-price"><span class="now">${money(p)}</span>` +
            (off >= 5 ? `<span class="was"><span class="sr-only">was </span>${money(w)}</span><span class="off">-${off}%</span>` : '') + '</span>';
    };
    const safe = u => (/^https:\/\//.test(u) ? u : '#');
    const chips = ['<button type="button" data-cat="all" aria-pressed="true">All <span>' + total + '</span></button>']
        .concat(cats.map(c => `<button type="button" data-cat="cat-${slug(c.name)}" aria-pressed="false">${escHtml(c.name)} <span>${c.deals.length}</span></button>`))
        .join('');
    // Missing photo: a light brand-blue tile with a tag icon (style guide), never a broken image.
    const NOPIC = '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .53.21 1.04.59 1.41l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.82ZM6.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
    // Walmart only resizes to sizes it knows: 500 isn't one, so ?odnHeight=500
    // returned the original (up to 3.5MB a photo). 640 comes back around 40KB.
    const sized = u => u.replace(/odnHeight=\d+&odnWidth=\d+/, 'odnHeight=640&odnWidth=640');
    const pic = (d, eager) => (/^https:\/\/(m\.media-amazon\.com|i5\.walmartimages\.com)\//.test(d.image || '')
        ? `<img src="${escHtml(sized(d.image))}" alt="" width="250" height="250"${eager ? '' : ' loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`
        : `<span class="nopic">${NOPIC}</span>`);
    const saved = d => { const p = Number(d.price), w = Number(d.was); return w > p && p > 0 ? Math.round(w - p) : 0; };
    const offPct = d => { const p = Number(d.price), w = Number(d.was); return w > p && p > 0 ? Math.round((w - p) / w * 100) : 0; };
    // SAVE sticker (style guide): whole dollars, only when the saving is real money.
    const sticker = d => saved(d) >= 5 ? `<span class="save" aria-hidden="true"><span>Save<br><b>$${saved(d).toLocaleString('en-US')}</b></span></span>` : '';
    const card = (d, catId, cls, eager) => `            <li class="deal${cls || ''}" data-num="${d.num}" data-price="${Number(d.price) || 0}" data-off="${offPct(d)}" data-saved="${saved(d)}" data-store="${escHtml(d.store)}"${d.top ? ' data-top="1"' : ''} data-cat="${catId}"><a href="${escHtml(safe(d.url))}" target="_blank" rel="sponsored noopener">
                <span class="deal-pic">${pic(d, eager)}${sticker(d)}</span>
                <span class="deal-num">#${d.num}${d.top ? '<span class="pick"> · ★ Jeff’s top pick</span>' : ''}</span>
                <span class="deal-name">${escHtml(d.name)}</span>
                ${priceLine(d)}${saved(d) >= 5 ? `<span class="sr-only">, you save $${saved(d)}</span>` : ''}
                <span class="deal-store">Buy at ${escHtml(d.store)}<span class="sr-only"> (opens in a new tab)</span></span>
            </a></li>`;
    const all = [];
    const sections = cats.map(c => {
        const id = 'cat-' + slug(c.name);
        c.deals.forEach(d => all.push({ d, id }));
        const rows = c.deals.map(d => card(d, id)).join('\n');   // Jeff's order, as in the video
        return `        <section class="cat" id="${id}" data-name="${escHtml(c.name)}" aria-labelledby="${id}-h">
            <div class="cat-head"><h2 id="${id}-h">${escHtml(c.name)}</h2><span class="cat-count">${c.deals.length} deals</span></div>
            <ul class="list">
${rows}
            </ul>
        </section>`;
    }).join('\n');
    // Biggest savings: the five deepest discounts, shown big before the grid.
    const top = all.filter(x => offPct(x.d) > 0).sort((a, b) => offPct(b.d) - offPct(a.d)).slice(0, 5);
    const featured = top.length ? `        <section class="featured" id="biggest" aria-labelledby="biggest-h">
            <div class="cat-head"><h2 id="biggest-h">Biggest savings</h2><span class="cat-count">Up to ${offPct(top[0].d)}% off</span></div>
            <ul class="list feat-list">
${top.map(x => card(x.d, x.id, ' feat', true)).join('\n')}
            </ul>
        </section>` : '';
    // The home page shows the same top cards, linking through to /deals.
    if (opts && opts.topOnly) return { cards: top.map(x => card(x.d, x.id, ' feat')).join('\n'), total, maxOff: top.length ? offPct(top[0].d) : 0 };
    const updated = new Date((data.updated || '') + 'T12:00:00Z');
    const valid = !isNaN(updated);
    return fs.readFileSync(DEALS_PAGE, 'utf8')
        .replace('<!--CHIPS-->', chips)
        .replace('<!--DEALS-->', sections)
        .replace('<!--FEATURED-->', featured)
        .replace(/<!--DEAL_COUNT-->/g, String(total))
        .replace('<!--PICK_COUNT-->', String(all.filter(x => x.d.top).length))
        .replace('<!--AMAZON_COUNT-->', String(all.filter(x => x.d.store === 'Amazon').length))
        .replace('<!--WALMART_COUNT-->', String(all.filter(x => x.d.store === 'Walmart').length))
        .replace('<!--PRICES_AT-->', data.pricesAt ? 'Prices checked ' + escHtml(data.pricesAt) + '. ' : '')
        .replace('<!--VERIFIED-->', data.pricesAt ? `<p class="verified"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>Prices checked ${escHtml(data.pricesAt)}</p>` : '')
        .replace('<!--VIDEO-->', /^[\w-]{6,20}$/.test(data.video || '') ? `<a class="watch" href="https://www.youtube.com/watch?v=${data.video}" target="_blank" rel="noopener">Watch Jeff’s video<span class="sr-only"> (opens in a new tab)</span></a>` : '')
        .replace('<!--UPDATED_ISO-->', valid ? data.updated : '')
        .replace('<!--UPDATED-->', valid ? updated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'recently');
}
// Built pages are kept until a source file changes. Links shared on social
// carry a unique ?fbclid, which misses the CDN, so on launch day most page
// views reach this code; rebuilding 75 cards from disk each time capped it at
// a few hundred pages a second.
const built = new Map();    // key -> { stamp, html }
function memo(key, files, build) {
    const stamp = files.map(f => fs.statSync(f).mtimeMs).join();
    const hit = built.get(key);
    if (hit && hit.stamp === stamp) return hit.html;
    const html = build();
    built.set(key, { stamp, html });
    return html;
}
app.get(['/deals', '/deals/'], (req, res, next) => {
    try {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', PAGE_CACHE);
        res.send(memo('deals', [DEALS_PAGE, DEAL_LIST], () => renderDealsPage()));
    } catch (e) {
        console.error('deals page:', e.message);
        next();
    }
});
app.get('/deals.html', (req, res) => res.redirect(301, '/deals'));
// Privacy and affiliate disclosures, linked from every footer.
app.get(['/privacy', '/privacy/'], (req, res) => {
    res.set('Cache-Control', PAGE_CACHE).sendFile(path.join(__dirname, 'privacy.html'));
});
app.get('/privacy.html', (req, res) => res.redirect(301, '/privacy'));

app.get(['/', '/index.html'], async (req, res, next) => {
    try {
        const content = await getContent();
        const order = Array.isArray(content.sectionOrder) && content.sectionOrder.length
            ? content.sectionOrder
            : DEFAULT_CONTENT.sectionOrder;
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', PAGE_CACHE);
        res.send(memo('home:' + order.join(','), [INDEX_PATH, DEAL_LIST], () => {
            let html = reorderSections(fs.readFileSync(INDEX_PATH, 'utf8'), order);
            try {
                const t = renderDealsPage({ topOnly: true });
                html = html.replace('<!--HOME_DEALS-->', t.cards).replace(/<!--HOME_DEAL_COUNT-->/g, String(t.total));
            } catch (e) { console.error('home deals:', e.message); }
            return html;
        }));
    } catch (e) {
        next();     // fall through to the static handler below
    }
});

const serveStatic = express.static(__dirname, {
    index: 'index.html', dotfiles: 'deny',
    // Images, scripts and styles: browsers keep them an hour, the CDN a day.
    setHeaders: (res, file) => res.setHeader('Cache-Control', /\.html$/.test(file)
        ? PAGE_CACHE
        : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'),
});
// Only allowlisted paths reach the file server; everything else carries on to
// the API routes below and, failing those, the 404 page.
app.use((req, res, next) => (req.path === '/' || isPublicFile(req.path) ? serveStatic(req, res, next) : next()));

// ── YOUTUBE CACHE ──
const YT_CHANNEL_ID = 'UC7PYy5Tx1WhbnGKc3KJeRKw';
const YT_CACHE_TTL  = 60 * 60 * 1000; // 1 hour
let ytCache = { data: null, fetchedAt: 0 };

async function fetchYouTubeVideos() {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

// Look up a title for a video that isn't in the recent-uploads feed. oEmbed is
// public and unkeyed, so pinning an older video costs nothing.
async function fetchVideoTitle(id) {
    try {
        const r = await fetch('https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return null;
        const j = await r.json();
        return j.title || null;
    } catch (_) { return null; }
}

// ── API: YouTube feed ──
app.get('/api/youtube', wrap(async (req, res) => {
    const now = Date.now();
    let payload;
    if (ytCache.data && now - ytCache.fetchedAt < YT_CACHE_TTL) {
        payload = ytCache.data;
    } else {
        try {
            const videos = await fetchYouTubeVideos();
            ytCache = { data: { videos }, fetchedAt: now };
            payload = ytCache.data;
        } catch (err) {
            payload = ytCache.data || { videos: [{ id: 'pVH0evvebRw', title: 'Latest Episode', published: '' }] };
        }
    }

    // A pinned episode is promoted to the front rather than replacing the list,
    // so the archive strip still shows everything.
    let videos = payload.videos;
    try {
        const { featuredVideo } = await getContent();
        if (featuredVideo && featuredVideo.mode === 'manual' && featuredVideo.videoId) {
            const id = featuredVideo.videoId;
            const existing = videos.find(v => v.id === id);
            if (existing) videos = [existing].concat(videos.filter(v => v.id !== id));
            else {
                const title = await fetchVideoTitle(id);
                if (title) videos = [{ id, title, published: '' }].concat(videos);
            }
        }
    } catch (_) { /* pinning is a nicety; never break the feed over it */ }

    // Sent alongside rather than baked into the video object: it belongs to the
    // hero slot, not to the video, and the archive strip must keep using its own
    // per-video thumbnails.
    let featuredPoster = '';
    try {
        const { featuredVideo } = await getContent();
        const u = featuredVideo && featuredVideo.posterUrl;
        // http(s) only. This string lands in an img src on the public page.
        if (u && /^https?:\/\//i.test(u)) featuredPoster = u;
    } catch (_) { /* falls back to the YouTube thumbnail */ }

    res.json({ videos, featuredPoster });
}));

// ── API: Live channel stats ──
// The hero's subscriber figure was a number typed in by hand. This reads the
// real one. Note YouTube itself only publishes the count to three significant
// figures, so it already arrives rounded — asking for finer precision than
// that isn't possible through the public API.
const STATS_TTL = 5 * 60 * 1000;
let statsCache = { data: null, at: 0 };

app.get('/api/stats', wrap(async (req, res) => {
    const key = process.env.YT_API_KEY;
    if (!key) return res.json({ subscribers: null });

    if (statsCache.data && Date.now() - statsCache.at < STATS_TTL) {
        return res.json(statsCache.data);
    }
    try {
        const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics&id=' +
            YT_CHANNEL_ID + '&key=' + key, { signal: AbortSignal.timeout(5000) });
        const j = await r.json();
        const stats = j && j.items && j.items[0] && j.items[0].statistics;
        if (!stats) throw new Error('no statistics in response');

        const subs = Number(stats.subscriberCount);
        const data = {
            subscribers: subs,
            // Rounded to the nearest thousand for display.
            subscribersRounded: Math.round(subs / 1000) * 1000,
            videos: Number(stats.videoCount) || null,
            views: Number(stats.viewCount) || null,
            fetchedAt: new Date().toISOString(),
        };
        statsCache = { data, at: Date.now() };
        res.json(data);
    } catch (_) {
        // Stale beats blank; blank beats a wrong number.
        res.json(statsCache.data || { subscribers: null });
    }
}));

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

// ── API: Jeff's newsletter deal posts (the homepage circular) ──
app.get('/api/newsletter', async (req, res) => {
    try {
        res.json(await getNewsletterFeed());
    } catch (err) {
        // The page keeps its static fallback picks when this is empty.
        res.json({ deals: [], updatedAt: null });
    }
});

// ── SITE CONTENT: public read (edits saved earlier still apply) ──
// A document saved before a field existed simply won't have it, so stored
// content is layered over the defaults rather than replacing them. Without
// this, every field added from here on would read as undefined for anyone who
// had already used the control board once.
function withDefaults(stored) {
    const merged = Object.assign({}, DEFAULT_CONTENT, stored || {});
    // An order saved before a redesign can name sections that no longer exist,
    // which would then fail validation on every admin save. Keep the known ids,
    // and append any new sections the saved order doesn't mention.
    const known = DEFAULT_CONTENT.sectionOrder;
    const saved = Array.isArray(merged.sectionOrder) ? merged.sectionOrder.filter(id => known.includes(id)) : [];
    merged.sectionOrder = saved.concat(known.filter(id => !saved.includes(id)));
    return merged;
}

async function getContent() {
    return withDefaults(await readDB(DOC.content, null));
}

app.get('/api/content', wrap(async (req, res) => {
    res.json(await getContent());
}));

// ── DEALS OF THE WEEK (shop links): public read ──
app.get('/api/deals', wrap(async (req, res) => {
    res.json({ deals: await readDB(DOC.deals, DEFAULT_DEALS) });
}));

// Anything no route or file matched.
app.use(notFound);

// On Vercel this module is imported by api/index.js and the platform owns the
// listener; only bind a port when run directly (local dev).
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Rossen Reports running at http://localhost:${PORT}`);
    });
}

module.exports = app;
