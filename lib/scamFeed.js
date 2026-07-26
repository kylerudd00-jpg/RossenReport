// Live scam-alert feed, sourced exclusively from federal consumer-protection agencies.
//
// Why government-only: this feed publishes automatically under Jeff's byline. His
// credibility is the product, so nothing reaches the page unless a federal agency
// already vetted and published it. That constraint is enforced twice here — by the
// SOURCES list, and again by isGovUrl() on every individual item — so a redirect or
// a mangled feed entry can't sneak a non-.gov link onto the site.

const SOURCES = [
    {
        id: 'ftc-alerts',
        agency: 'FTC',
        label: 'Federal Trade Commission',
        url: 'https://consumer.ftc.gov/blog/rss',
        // The FTC's consumer-alerts blog exists to warn people about scams; its
        // entire output is on-topic, so it skips the keyword gate below.
        trusted: true,
    },
    {
        id: 'ftc-press',
        agency: 'FTC',
        label: 'Federal Trade Commission',
        url: 'https://www.ftc.gov/feeds/press-release.xml',
        trusted: false,
    },
    {
        id: 'cfpb',
        agency: 'CFPB',
        label: 'Consumer Financial Protection Bureau',
        url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/',
        trusted: false,
    },
    {
        // Prosecutions rather than warnings — a useful second angle when DOJ
        // announces a robocall shutdown or an elder-fraud sweep.
        //
        // But this feed is every federal press release, and the shared SCAM_TERMS
        // gate is far too loose for it: on a sample of 25 it let through an
        // immigration case and a voting case, because their summaries happened to
        // say "fraudulently". Those must never appear on a consumer scam page. So
        // this source carries its own narrower rules — the headline has to be
        // about defrauding ordinary people, and anything in the deny list is
        // dropped outright even if it matches.
        //
        // Expect it to contribute nothing most weeks. That is the intended
        // behaviour: silence is the correct output when there is no consumer
        // scam story, and a false positive here costs more than a missed one.
        id: 'doj',
        agency: 'DOJ',
        label: 'U.S. Department of Justice',
        url: 'https://www.justice.gov/news/rss?type=press_release',
        trusted: false,
        requires: /\b(scams?|romance scam|elder fraud|tech support fraud|robocalls?|telemarketing|identity theft|ponzi|pyramid scheme|consumer fraud|deceptive marketing|lottery fraud|sweepstakes|imposters?|impersonat\w*|grandparent scam|investment fraud|charity fraud)\b/i,
        excludes: /\b(immigration|immigrant|alien|visa|deport\w*|naturaliz\w*|voting|election|ballot|firearms?|narcotics?|drug traffick\w*|methamphetamine|fentanyl|cocaine|child|minor|sexual|terror\w*|espionage|classified|human traffick\w*|assault|murder|homicide|kidnap\w*)\b/i,
    },
];

// Applied only to broad newsroom feeds, which mix scam enforcement in with mergers,
// rulemaking, and data releases. Deliberately tight — a false negative just means one
// fewer item, while a false positive puts an off-topic headline under Jeff's name.
const SCAM_TERMS = [
    'scam', 'fraud', 'deceptive', 'deception', 'phishing', 'imposter', 'impostor',
    'impersonat', 'robocall', 'telemarketing', 'identity theft', 'bogus', 'sham',
    'ponzi', 'pyramid scheme', 'deceived', 'defraud', 'ripped off', 'con artist',
    'unlawful', 'illegal charges', 'hidden fees', 'junk fees', 'refunds to consumers',
    'returns money to consumers', 'money to consumers harmed',
];

// Drives the coloured chip on each card so the feed is scannable at a glance.
// First match wins, so the most specific patterns are listed first and the loosest
// (Shopping) is last. Every term is \b-anchored: without that, FTC's constant legal
// use of "orders" and phrases like "substance use disorder" both matched a bare
// "order" and mislabelled health stories as shopping.
const CATEGORIES = [
    ['Payments', /\b(gift cards?|wire transfers?|crypto\w*|bitcoin|bank transfers?|payment apps?|zelle|venmo|cash app|money orders?)\b/i],
    ['Imposter', /\b(imposters?|impostors?|impersonat\w*|posing as|pretending to be|irs|social security|medicare|government grants?)\b/i],
    ['Phishing', /\b(phishing|smishing|text messages?|robocalls?|spoof\w*|malware|hacked?|suspicious links?)\b/i],
    ['Health',   /\b(health|medical|clinics?|treatments?|supplements?|prescriptions?|weight loss|insurance)\b/i],
    ['Housing',  /\b(rentals?|renting|landlords?|mortgages?|evictions?|moving compan\w*|apartments?)\b/i],
    ['Jobs',     /\b(jobs?|work from home|employment|hiring|business opportunit\w*)\b/i],
    ['Money',    /\b(loans?|debt|credit|investments?|investing|financial|banking|refunds?|money|fees|billing|charges)\b/i],
    ['Shopping', /\b(shopping|stores?|retail\w*|products?|deliver\w*|packages?|marketplace|sellers?|purchases?)\b/i],
];

const CACHE_TTL = 30 * 60 * 1000; // 30 min
const MAX_ITEMS = 9;
const FETCH_TIMEOUT = 8000;

let cache = { data: null, fetchedAt: 0 };

// ── parsing helpers ──

function decodeEntities(s) {
    if (!s) return '';
    // Run twice: these feeds double-encode (the raw XML carries "&amp;nbsp;", which
    // is an XML-escaped HTML entity and needs both layers stripped).
    let out = String(s);
    for (let pass = 0; pass < 2; pass++) {
        out = out
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
            .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }
    return out;
}

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' '); }
function clean(s) { return decodeEntities(stripTags(decodeEntities(s))).replace(/\s+/g, ' ').trim(); }

function tag(item, name) {
    const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() : '';
}

// The FTC consumer-alerts feed is malformed: <title> contains a full anchor tag and
// <link> holds a double-URL-encoded fragment that doesn't resolve. The only reliable
// canonical URL in the entry is the href inside that title anchor, so prefer it.
function extractLink(item) {
    const rawTitle = tag(item, 'title');
    const href = rawTitle.match(/href=["']([^"']+)["']/i);
    if (href) return decodeEntities(href[1]);

    const link = decodeEntities(tag(item, 'link'));
    if (link && !link.includes('%3C')) return link; // %3C = an encoded "<", i.e. mangled

    const guid = decodeEntities(tag(item, 'guid'));
    return guid.startsWith('http') ? guid : '';
}

function isGovUrl(url) {
    try {
        const u = new URL(url);
        // Any agency added to SOURCES must be added here too, or every one of its
        // items is silently dropped by this check.
        return u.protocol === 'https:' &&
            /(^|\.)(ftc|consumerfinance|usa|fcc|cfpb|justice)\.gov$/.test(u.hostname);
    } catch (_) { return false; }
}

function categorize(text) {
    for (const [name, re] of CATEGORIES) if (re.test(text)) return name;
    return 'Consumer Alert';
}

function isRelevant(text) {
    const lower = text.toLowerCase();
    return SCAM_TERMS.some(t => lower.includes(t));
}

// ── fetching ──

async function fetchSource(src) {
    const res = await fetch(src.url, {
        headers: { 'User-Agent': 'RossenReports/1.0 (+https://rossenreports.tv)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) throw new Error(`${src.id} ${res.status}`);
    const xml = await res.text();

    const out = [];
    for (const [item] of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
        const title = clean(tag(item, 'title'));
        const link = extractLink(item);
        const summary = clean(tag(item, 'description'));
        const published = tag(item, 'pubDate');
        const ts = Date.parse(published);

        if (!title || !isGovUrl(link) || !Number.isFinite(ts)) continue;

        const blob = `${title} ${summary}`;
        // A source may carry its own rules where the shared gate is too blunt.
        // excludes wins over requires: a deny-listed subject is dropped even if
        // it also matches, because those are the items that most need keeping out.
        if (src.excludes && src.excludes.test(blob)) continue;
        if (src.requires) {
            if (!src.requires.test(blob)) continue;
        } else if (!src.trusted && !isRelevant(blob)) continue;

        out.push({
            title,
            url: link,
            summary: summary.length > 260 ? summary.slice(0, 257).trimEnd() + '…' : summary,
            agency: src.agency,
            agencyLabel: src.label,
            category: categorize(`${title} ${summary}`),
            published: new Date(ts).toISOString(),
        });
    }
    return out;
}

async function buildFeed() {
    const settled = await Promise.allSettled(SOURCES.map(fetchSource));

    const seenUrl = new Set();
    const seenTitle = new Set();
    const items = [];
    for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        for (const it of r.value) {
            const urlKey = it.url.toLowerCase();
            // DOJ syndicates one release across every district that touched it,
            // each with its own URL, so a URL check alone lets duplicates through.
            const titleKey = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            if (seenUrl.has(urlKey) || seenTitle.has(titleKey)) continue;
            seenUrl.add(urlKey);
            seenTitle.add(titleKey);
            items.push(it);
        }
    }

    if (!items.length) throw new Error('no items from any source');

    items.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

    // Newest-first alone hands every slot to whichever agency publishes most —
    // in practice the FTC, which buried the others entirely. Cap any single
    // agency's share so the feed actually reads as multi-source, then backfill
    // from what's left so a quiet week still fills the section.
    const perAgencyCap = Math.max(1, Math.ceil(MAX_ITEMS * 0.6));
    const counts = {};
    const picked = [];
    for (const it of items) {
        if (picked.length >= MAX_ITEMS) break;
        const n = counts[it.agency] || 0;
        if (n >= perAgencyCap) continue;
        counts[it.agency] = n + 1;
        picked.push(it);
    }
    for (const it of items) {
        if (picked.length >= MAX_ITEMS) break;
        if (!picked.includes(it)) picked.push(it);
    }

    return {
        alerts: picked,
        updatedAt: new Date().toISOString(),
        // deduped: two of the sources are separate FTC feeds and shouldn't be
        // credited twice in the "Sources:" line.
        sources: [...new Set(SOURCES.filter((_, i) => settled[i].status === 'fulfilled').map(s => s.label))],
    };
}

// Cached in memory only. The deployment target has a read-only filesystem, so there
// is nothing to write to — and a warm serverless container keeps this across requests
// anyway. A cold start just refetches, which costs one round trip.
async function getScamFeed() {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL) return cache.data;
    try {
        const data = await buildFeed();
        cache = { data, fetchedAt: now };
        return data;
    } catch (err) {
        if (cache.data) return cache.data; // stale beats empty
        throw err;
    }
}

module.exports = { getScamFeed };
