// Storage for the site's editable content.
//
// Vercel runs this app as a serverless function on a read-only, disposable
// filesystem, so the admin control board had no way to save anything in
// production — every write threw. This picks a backend at startup:
//
//   local  → db/*.json on disk. Used in development.
//   blob   → Vercel Blob. Used in production, but ONLY if BLOB_READ_WRITE_TOKEN
//            is present. Creating a Blob store in the Vercel dashboard injects
//            that variable automatically; there is nothing to paste by hand.
//   none   → production with no store configured. Reads fall back to defaults
//            and writes throw a readable error rather than pretending to work.
//
// Reads are cached in memory because /api/content is hit on every page load and
// a Blob round trip per visitor would be absurd. Writes invalidate their own key.

const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'db');
const isServerless = !!process.env.VERCEL;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

const BACKEND = !isServerless ? 'local' : (hasBlob ? 'blob' : 'none');

const CACHE_TTL = 60 * 1000;
const cache = new Map();      // name -> { data, at }
const blobUrls = new Map();   // name -> public URL, so we only look it up once

let blobApi = null;
if (BACKEND === 'blob') {
    try {
        blobApi = require('@vercel/blob');
    } catch (_) {
        // Dependency missing in the bundle — treat as unconfigured rather than crashing.
        console.warn('[storage] @vercel/blob could not be loaded; writes are disabled.');
    }
}

if (BACKEND === 'none') {
    console.warn('[storage] No BLOB_READ_WRITE_TOKEN — the control board can read but not save. ' +
                 'Create a Blob store in the Vercel dashboard and redeploy.');
}

function noStorageError() {
    const err = new Error(
        'Saving is not configured for this deployment. Create a Blob store in the ' +
        'Vercel dashboard (Storage → Create → Blob), then redeploy. Nothing was saved.'
    );
    err.code = 'no_persistent_storage';
    return err;
}

// ── local ──

function localRead(name, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(dbDir, name + '.json'), 'utf8')); }
    catch (_) { return fallback; }
}

function localWrite(name, data) {
    try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }); } catch (_) {}
    fs.writeFileSync(path.join(dbDir, name + '.json'), JSON.stringify(data, null, 2));
}

// ── blob ──

async function blobUrlFor(name) {
    if (blobUrls.has(name)) return blobUrls.get(name);
    const { blobs } = await blobApi.list({ prefix: name + '.json', limit: 1 });
    const url = blobs && blobs.length ? blobs[0].url : null;
    if (url) blobUrls.set(name, url);
    return url;
}

async function blobRead(name, fallback) {
    const url = await blobUrlFor(name);
    if (!url) return fallback;                       // never written yet
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return fallback;
    try { return await res.json(); } catch (_) { return fallback; }
}

async function blobWrite(name, data) {
    // allowOverwrite + no random suffix keeps the pathname stable, so the same
    // document is updated in place instead of accumulating copies.
    const { url } = await blobApi.put(name + '.json', JSON.stringify(data, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
    });
    blobUrls.set(name, url);
}

// ── public API ──

async function read(name, fallback) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

    let data;
    if (BACKEND === 'local') data = localRead(name, fallback);
    else if (BACKEND === 'blob' && blobApi) {
        try { data = await blobRead(name, fallback); }
        catch (e) {
            // A storage blip must not take the public site down — serve the
            // last good copy if we have one, otherwise the shipped defaults.
            console.warn('[storage] read failed for ' + name + ': ' + e.message);
            return hit ? hit.data : fallback;
        }
    } else data = fallback;

    cache.set(name, { data, at: Date.now() });
    return data;
}

async function write(name, data) {
    if (BACKEND === 'local') localWrite(name, data);
    else if (BACKEND === 'blob' && blobApi) await blobWrite(name, data);
    else throw noStorageError();
    cache.set(name, { data, at: Date.now() });
}

module.exports = { read, write, BACKEND, canWrite: BACKEND !== 'none' };
