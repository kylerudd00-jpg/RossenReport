// Jeff's Substack posts, read from its public RSS feed, for the homepage's
// "This week's circular". The deal posts are the circular; scam posts are left
// to the scam-alerts section.
//
// Cached in memory: Substack publishes a few times a week, so a 30-minute TTL
// is plenty, and a failed fetch serves the last good copy.

const FEED_URL = 'https://rossenreports.substack.com/feed';
const TTL = 30 * 60 * 1000;

// Matched against title + subtitle. Scam words win over deal words, so
// "Amazon Return WARNING" does not land in the circular.
const DEAL_WORDS = /\b(deals?|promo|codes?|% ?off|sale|price|prices|save|savings|discount|coupons?|black friday|cyber monday|prime day|clearance|dollar tree|costco|walmart|target|full price|cheap|bargain)\b/i;
const SCAM_WORDS = /\b(scam|scammer|fraud|warning|stolen|hack|hacked|dark web|leak|leaked|recall|danger)\b/i;

let cache = { data: null, at: 0 };

// fromCodePoint throws past U+10FFFF, and one bad entity must not sink the feed.
const cp = n => (n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : '');

function decode(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => cp(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
        .replace(/&amp;/g, '&')
        .trim();
}

function tag(xml, name) {
    const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
    return m ? decode(m[1]) : '';
}

function parse(xml) {
    const items = xml.split(/<item>/i).slice(1).map(chunk => {
        const body = chunk.split(/<\/item>/i)[0];
        const title = tag(body, 'title');
        const subtitle = tag(body, 'description').replace(/<[^>]+>/g, '').slice(0, 220);
        const link = tag(body, 'link');
        const published = new Date(tag(body, 'pubDate'));
        const enc = body.match(/<enclosure[^>]+url="([^"]+)"/i);
        const text = title + ' ' + subtitle;
        return {
            title,
            subtitle,
            url: /^https:\/\/rossenreports\.substack\.com\//.test(link) ? link : '',
            published: isNaN(published) ? null : published.toISOString(),
            image: enc && /^https:\/\//.test(enc[1]) ? enc[1] : '',
            isDeal: DEAL_WORDS.test(text) && !SCAM_WORDS.test(text),
        };
    });
    return items.filter(i => i.title && i.url);
}

async function getNewsletterFeed() {
    if (cache.data && Date.now() - cache.at < TTL) return cache.data;
    try {
        const r = await fetch(FEED_URL, { headers: { 'User-Agent': 'RossenReportsSite/1.0' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const posts = parse(await r.text());
        const data = {
            deals: posts.filter(p => p.isDeal).slice(0, 6),
            updatedAt: new Date().toISOString(),
        };
        cache = { data, at: Date.now() };
        return data;
    } catch (e) {
        if (cache.data) return cache.data;      // stale beats blank
        throw e;
    }
}

module.exports = { getNewsletterFeed, parse };
