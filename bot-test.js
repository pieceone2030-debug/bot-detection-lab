/**
 * Bot Detection Lab v3.1 — Anti-Cluster + Geo-Strict Edition
 * ─────────────────────────────────────────────────────────────
 * Fixes:
 *   • Robust geo detection (3 APIs + retry + cache)
 *   • Instance-level WebGL fingerprint override
 *   • Canvas noise injection
 *   • Session variance (bounce / reader / engaged)
 *   • Real referrers only (no fake Google/FB)
 *   • Reject session if geo unknown
 *   • Double jitter (launch + wave)
 *   • Persistent state across cron runs
 * ─────────────────────────────────────────────────────────────
 */
'use strict';

const { chromium } = require("patchright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AnonymizeUA = require("@zorilla/puppeteer-extra-plugin-anonymize-ua").default;

const chromiumExtra = addExtra(chromium);
chromiumExtra.use(StealthPlugin());
chromiumExtra.use(AnonymizeUA());

/* ═══════════════════════════════════════════════════════════════
   ⚙️  Config
   ═══════════════════════════════════════════════════════════════ */

const CFG = {
    targetUrl:        process.env.TARGET_URL        || "https://pog01.blogspot.com/",
    mode:             process.env.BOT_MODE          || "single",
    botCount:         intEnv("BOT_COUNT",           3),
    botId:            process.env.BOT_ID            || "1",
    parallelism:      intEnv("PARALLELISM",         3),
    windowMinutes:    intEnv("WINDOW_MINUTES",      30),
    minGapSec:        intEnv("MIN_GAP_SECONDS",     15),
    maxGapSec:        intEnv("MAX_GAP_SECONDS",     90),
    maxPerIp:         intEnv("MAX_PER_IP",          2),
    maxDurationMin:   intEnv("MAX_DURATION_MINUTES", 55),
    headless:         envBool("HEADLESS",           true),
    screenshots:      envBool("SCREENSHOTS",        true),
    dwellMin:         intEnv("DWELL_MIN",           12),
    dwellMax:         intEnv("DWELL_MAX",           17),
    stateDir:         process.env.STATE_DIR         || ".bot-state",
    cronMinGapMin:    intEnv("CRON_MIN_GAP_MINUTES", 20),
    geoStrict:        envBool("GEO_STRICT",         true),
    geoCacheDir:      process.env.GEO_CACHE_DIR     || ".geo-cache",
};

function intEnv(k, d) {
    const v = process.env[k];
    if (v === undefined || v === "") return d;
    const n = parseInt(v, 10);
    return isNaN(n) ? d : n;
}
function envBool(k, d) {
    const v = process.env[k];
    if (v === undefined) return d;
    return /^(1|true|yes|on)$/i.test(v);
}

const RUN_ID = process.env.RUN_ID || crypto.randomBytes(4).toString('hex');
const START_TS = Date.now();

/* ═══════════════════════════════════════════════════════════════
   📝  Logger
   ═══════════════════════════════════════════════════════════════ */

function ts() { return new Date().toISOString().substring(11, 19); }
const LOG = {
    info:  (id, m) => console.log(`[${ts()}] [${id}] ${m}`),
    warn:  (id, m) => console.warn(`[${ts()}] [${id}] ⚠️  ${m}`),
    error: (id, m) => console.error(`[${ts()}] [${id}] ❌ ${m}`),
    ok:    (id, m) => console.log(`[${ts()}] [${id}] ✅ ${m}`),
};

/* ═══════════════════════════════════════════════════════════════
   🎲  RNG
   ═══════════════════════════════════════════════════════════════ */

let rng = Math.random;
const rand    = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick    = arr => arr[Math.floor(rng() * arr.length)];
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const shuffle = arr => { const a = [...arr]; for (let i = a.length-1; i>0; i--) { const j = Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

/* ═══════════════════════════════════════════════════════════════
   🧬  Fingerprint Database (8 distinct profiles)
   ═══════════════════════════════════════════════════════════════ */

const BASE_FINGERPRINTS = [
    {
        name: "Win-Intel-UHD630",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080, availHeight: 1040 },
        gpuVendor: "Google Inc. (Intel)",
        gpuRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 8, memory: 8, colorDepth: 24, dsf: 1
    },
    {
        name: "Win-NVIDIA-RTX3060",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1536, height: 864 },
        screen: { width: 1536, height: 864, availHeight: 824 },
        gpuVendor: "Google Inc. (NVIDIA)",
        gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 12, memory: 16, colorDepth: 24, dsf: 1
    },
    {
        name: "Mac-M1",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "MacIntel",
        viewport: { width: 1512, height: 945 },
        screen: { width: 1512, height: 945, availHeight: 898 },
        gpuVendor: "Google Inc. (Apple)",
        gpuRenderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)",
        cores: 8, memory: 8, colorDepth: 30, dsf: 2
    },
    {
        name: "Win-Intel-Iris-Xe",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 2560, height: 1440 },
        screen: { width: 2560, height: 1440, availHeight: 1400 },
        gpuVendor: "Google Inc. (Intel)",
        gpuRenderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 16, memory: 32, colorDepth: 24, dsf: 1
    },
    {
        name: "Win-AMD-RX6600",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1366, height: 768 },
        screen: { width: 1366, height: 768, availHeight: 728 },
        gpuVendor: "Google Inc. (AMD)",
        gpuRenderer: "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 6, memory: 8, colorDepth: 24, dsf: 1
    },
    {
        name: "Win-NVIDIA-GTX1650",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1360, height: 768 },
        screen: { width: 1360, height: 768, availHeight: 728 },
        gpuVendor: "Google Inc. (NVIDIA)",
        gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 8, memory: 16, colorDepth: 24, dsf: 1
    },
    {
        name: "Mac-Intel-Iris-Plus",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        platform: "MacIntel",
        viewport: { width: 1680, height: 1050 },
        screen: { width: 1680, height: 1050, availHeight: 1000 },
        gpuVendor: "Google Inc. (Intel)",
        gpuRenderer: "ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)",
        cores: 4, memory: 8, colorDepth: 30, dsf: 2
    },
    {
        name: "Win-AMD-Vega8",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1600, height: 900 },
        screen: { width: 1600, height: 900, availHeight: 860 },
        gpuVendor: "Google Inc. (AMD)",
        gpuRenderer: "ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 8, memory: 8, colorDepth: 24, dsf: 1
    }
];

/* ═══════════════════════════════════════════════════════════════
   🌍  Geo Profiles (country → locale + timezones)
   ═══════════════════════════════════════════════════════════════ */

const GEO_PROFILES = {
    'US': { locale: 'en-US', languages: ['en-US', 'en'], timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'] },
    'CA': { locale: 'en-CA', languages: ['en-CA', 'en', 'fr'], timezones: ['America/Toronto', 'America/Vancouver'] },
    'GB': { locale: 'en-GB', languages: ['en-GB', 'en'], timezones: ['Europe/London'] },
    'DE': { locale: 'de-DE', languages: ['de-DE', 'de', 'en'], timezones: ['Europe/Berlin'] },
    'FR': { locale: 'fr-FR', languages: ['fr-FR', 'fr', 'en'], timezones: ['Europe/Paris'] },
    'NL': { locale: 'nl-NL', languages: ['nl-NL', 'nl', 'en'], timezones: ['Europe/Amsterdam'] },
    'ES': { locale: 'es-ES', languages: ['es-ES', 'es', 'en'], timezones: ['Europe/Madrid'] },
    'IT': { locale: 'it-IT', languages: ['it-IT', 'it', 'en'], timezones: ['Europe/Rome'] },
    'PL': { locale: 'pl-PL', languages: ['pl-PL', 'pl', 'en'], timezones: ['Europe/Warsaw'] },
    'AU': { locale: 'en-AU', languages: ['en-AU', 'en'], timezones: ['Australia/Sydney', 'Australia/Melbourne'] },
    'JP': { locale: 'ja-JP', languages: ['ja-JP', 'ja'], timezones: ['Asia/Tokyo'] },
    'KR': { locale: 'ko-KR', languages: ['ko-KR', 'ko', 'en'], timezones: ['Asia/Seoul'] },
    'IN': { locale: 'en-IN', languages: ['en-IN', 'en', 'hi'], timezones: ['Asia/Kolkata'] },
    'SG': { locale: 'en-SG', languages: ['en-SG', 'en'], timezones: ['Asia/Singapore'] },
    'BR': { locale: 'pt-BR', languages: ['pt-BR', 'pt', 'en'], timezones: ['America/Sao_Paulo'] },
    'MX': { locale: 'es-MX', languages: ['es-MX', 'es', 'en'], timezones: ['America/Mexico_City'] },
    'AR': { locale: 'es-AR', languages: ['es-AR', 'es', 'en'], timezones: ['America/Argentina/Buenos_Aires'] },
    'ZA': { locale: 'en-ZA', languages: ['en-ZA', 'en'], timezones: ['Africa/Johannesburg'] },
    'SA': { locale: 'ar-SA', languages: ['ar-SA', 'ar', 'en'], timezones: ['Asia/Riyadh'] },
    'AE': { locale: 'ar-AE', languages: ['ar-AE', 'ar', 'en'], timezones: ['Asia/Dubai'] },
    'TR': { locale: 'tr-TR', languages: ['tr-TR', 'tr', 'en'], timezones: ['Europe/Istanbul'] },
    'ID': { locale: 'id-ID', languages: ['id-ID', 'id', 'en'], timezones: ['Asia/Jakarta'] },
    'TH': { locale: 'th-TH', languages: ['th-TH', 'th', 'en'], timezones: ['Asia/Bangkok'] },
    'PH': { locale: 'en-PH', languages: ['en-PH', 'en', 'fil'], timezones: ['Asia/Manila'] },
    'VN': { locale: 'vi-VN', languages: ['vi-VN', 'vi', 'en'], timezones: ['Asia/Ho_Chi_Minh'] },
    'EG': { locale: 'ar-EG', languages: ['ar-EG', 'ar', 'en'], timezones: ['Africa/Cairo'] },
    'RU': { locale: 'ru-RU', languages: ['ru-RU', 'ru', 'en'], timezones: ['Europe/Moscow'] },
    'UA': { locale: 'uk-UA', languages: ['uk-UA', 'uk', 'ru', 'en'], timezones: ['Europe/Kiev'] }
};

const TZ_OFFSETS = {
    'America/New_York': 300, 'America/Chicago': 360, 'America/Denver': 420,
    'America/Phoenix': 420, 'America/Los_Angeles': 480, 'America/Toronto': 300,
    'America/Vancouver': 480, 'America/Mexico_City': 360, 'America/Sao_Paulo': 180,
    'America/Argentina/Buenos_Aires': 180,
    'Europe/London': 0, 'Europe/Berlin': -60, 'Europe/Paris': -60, 'Europe/Madrid': -60,
    'Europe/Rome': -60, 'Europe/Warsaw': -60, 'Europe/Amsterdam': -60,
    'Europe/Moscow': -180, 'Europe/Istanbul': -180, 'Europe/Kiev': -120,
    'Asia/Riyadh': -180, 'Asia/Dubai': -240, 'Asia/Kolkata': -330, 'Asia/Jakarta': -420,
    'Asia/Bangkok': -420, 'Asia/Singapore': -480, 'Asia/Tokyo': -540, 'Asia/Seoul': -540,
    'Asia/Manila': -480, 'Asia/Ho_Chi_Minh': -420,
    'Australia/Sydney': -600, 'Australia/Melbourne': -600,
    'Africa/Johannesburg': -120, 'Africa/Cairo': -120
};

function pickGeoProfile(countryCode) {
    const key = (countryCode || 'US').toUpperCase();
    return GEO_PROFILES[key] || GEO_PROFILES['US'];
}

/* ═══════════════════════════════════════════════════════════════
   🔗  Real Referrer Sources (only realistic ones)
   ═══════════════════════════════════════════════════════════════
   We only use referrers that CAN realistically exist for an
   unfindexed blog:
     • Direct (empty) — from bookmarks, messaging apps, direct typing
     • Blogger homepage — from blogger.com platform
     • Blogger dashboard — from the blog owner's dashboard
     • Internal navigation — between blog pages (already handled)
   ═══════════════════════════════════════════════════════════════ */

const REFERRER_SOURCES = [
    { name: 'direct',           weight: 75, referer: '' },
    { name: 'blogger-home',     weight: 12, referer: 'https://www.blogger.com/' },
    { name: 'blogger-dashboard',weight: 8,  referer: 'https://www.blogger.com/blog/posts/' },
    { name: 'blogger-feed',     weight: 3,  referer: 'https://www.blogger.com/feeds/posts/default' },
    { name: 'blogger-profile',  weight: 2,  referer: 'https://www.blogger.com/profile/' }
];

function pickReferrerSource() {
    const total = REFERRER_SOURCES.reduce((s, r) => s + r.weight, 0);
    let r = rng() * total;
    for (const src of REFERRER_SOURCES) {
        r -= src.weight;
        if (r <= 0) return src;
    }
    return REFERRER_SOURCES[0];
}

/* ═══════════════════════════════════════════════════════════════
   🌐  Proxy Pool
   ═══════════════════════════════════════════════════════════════ */

class ProxyPool {
    constructor(list) {
        this.proxies = list.map(p => ({ ...p, usage: 0, lastUsed: 0, failed: 0, geo: null }));
    }
    static fromEnv() {
        if (process.env.PROXIES_JSON) {
            try { return new ProxyPool(JSON.parse(process.env.PROXIES_JSON)); }
            catch (e) { console.error('PROXIES_JSON parse error:', e.message); }
        }
        if (process.env.PROXIES) return new ProxyPool(parseProxyLines(process.env.PROXIES));
        const file = path.join(process.cwd(), 'proxies.txt');
        if (fs.existsSync(file)) return new ProxyPool(parseProxyLines(fs.readFileSync(file, 'utf8')));
        return new ProxyPool([]);
    }
    size() { return this.proxies.length; }
    isEmpty() { return this.proxies.length === 0; }
    pickLeastUsed(maxPerIp = CFG.maxPerIp) {
        if (this.isEmpty()) return null;
        const ipCount = new Map();
        for (const p of this.proxies) {
            const ip = p.server.split(':')[0];
            ipCount.set(ip, (ipCount.get(ip) || 0) + p.usage);
        }
        const candidates = this.proxies.filter(p => {
            if (p.failed >= 3) return false;
            const ip = p.server.split(':')[0];
            return (ipCount.get(ip) || 0) < maxPerIp;
        });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.usage !== b.usage ? a.usage - b.usage : a.lastUsed - b.lastUsed);
        return candidates[0];
    }
    markUsed(p) { if (p) { p.usage++; p.lastUsed = Date.now(); } }
    markFailed(p) { if (p) p.failed++; }
}

function parseProxyLines(text) {
    return text.split(/[\n,;]+/).map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return null;
        const parts = t.split(':');
        if (parts.length === 4) return { server: `${parts[0]}:${parts[1]}`, username: parts[2], password: parts[3] };
        if (parts.length === 2) return { server: `${parts[0]}:${parts[1]}` };
        return null;
    }).filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════
   🌍  Robust Geo Detection (3 APIs + cache + retry)
   ═══════════════════════════════════════════════════════════════ */

function geoCacheKey(proxy) {
    return proxy ? crypto.createHash('md5').update(proxy.server).digest('hex').substring(0, 12) : 'local';
}

function loadGeocache(proxy) {
    try {
        const dir = path.join(process.cwd(), CFG.geoCacheDir);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${geoCacheKey(proxy)}.json`);
        if (!fs.existsSync(file)) return null;
        const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
        // cache valid for 6 hours
        if (Date.now() - entry.ts > 6 * 3600 * 1000) return null;
        return entry.geo;
    } catch (e) { return null; }
}

function saveGeocache(proxy, geo) {
    try {
        const dir = path.join(process.cwd(), CFG.geoCacheDir);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${geoCacheKey(proxy)}.json`);
        fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), geo }), 'utf8');
    } catch (e) {}
}

async function detectGeo(proxy) {
    // 1) check cache
    const cached = loadGeocache(proxy);
    if (cached) {
        LOG.info('GEO', `Cache hit ${proxy ? proxy.server : 'local'} → ${cached.city}, ${cached.country}`);
        return cached;
    }

    let browser;
    try {
        const opts = { headless: true };
        if (proxy) {
            opts.proxy = { server: `http://${proxy.server}`, username: proxy.username, password: proxy.password };
        }
        browser = await chromiumExtra.launch(opts);
        const ctx = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            proxy: opts.proxy
        });
        const page = await ctx.newPage();

        // 3 APIs in order of reliability
        const apis = [
            'https://ipapi.co/json/',
            'https://ipwho.is/',
            'https://api.ipify.org/?format=json'
        ];

        for (const apiUrl of apis) {
            try {
                await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                const data = await page.evaluate(() => {
                    try { return JSON.parse(document.body.innerText); } catch (e) { return null; }
                });
                if (!data) continue;

                let geo = null;
                // ipapi.co
                if (data.country_code !== undefined && data.ip) {
                    geo = {
                        ip: data.ip,
                        country: (data.country_code || '').toUpperCase(),
                        country_name: data.country_name,
                        timezone: data.timezone,
                        city: data.city,
                        org: data.org,
                        asn: data.asn,
                        source: 'ipapi'
                    };
                }
                // ipwho.is
                else if (data.success === true && data.ip) {
                    geo = {
                        ip: data.ip,
                        country: (data.country_code || '').toUpperCase(),
                        country_name: data.country,
                        timezone: data.timezone && data.timezone.id,
                        city: data.city,
                        org: data.connection && data.connection.org,
                        asn: data.connection && data.connection.asn,
                        source: 'ipwho'
                    };
                }
                // ipify (only IP, no geo)
                else if (data.ip && !data.country_code) {
                    LOG.warn('GEO', `ipify returned only IP: ${data.ip}`);
                    // continue to next API for geo
                    continue;
                }

                if (geo && geo.ip) {
                    LOG.ok('GEO', `${geo.city}, ${geo.country} (${geo.ip}) via ${geo.source}`);
                    saveGeocache(proxy, geo);
                    return geo;
                }
            } catch (e) { continue; }
        }

        LOG.warn('GEO', `All APIs failed for ${proxy ? proxy.server : 'local'}`);
        return null;
    } catch (e) {
        LOG.error('GEO', `Detection error: ${e.message}`);
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

/* ═══════════════════════════════════════════════════════════════
   🧬  Build geo-matched fingerprint
   ═══════════════════════════════════════════════════════════════ */

function buildFingerprintForGeo(baseFp, geo, options = {}) {
    const { requireGeo = CFG.geoStrict } = options;

    // ⚠️ Geo strict: if no geo, use SAFE fallback (US) — but log a warning
    let effectiveGeo = geo;
    if (!effectiveGeo) {
        if (requireGeo) {
            LOG.warn('FP', `No geo — using SAFE fallback (US)`);
        }
        effectiveGeo = { country: 'US', timezone: 'America/New_York' };
    }

    const fp = JSON.parse(JSON.stringify(baseFp));
    const profile = pickGeoProfile(effectiveGeo.country);

    fp.locale = profile.locale;
    fp.languages = [...profile.languages];

    // ⭐ Timezone MUST match IP
    if (effectiveGeo.timezone && TZ_OFFSETS[effectiveGeo.timezone] !== undefined) {
        fp.timezone = effectiveGeo.timezone;
    } else {
        // fallback: pick from profile but only if we truly have no IP timezone
        fp.timezone = pick(profile.timezones);
    }

    // Add subtle variation per bot (same base fingerprint, different tweaks)
    const v = rng();
    if (v < 0.30) {
        fp.viewport.width  = Math.round(fp.viewport.width  * 0.92);
        fp.viewport.height = Math.round(fp.viewport.height * 0.92);
    } else if (v < 0.55) {
        fp.screen.availHeight = fp.screen.height - randInt(20, 60);
    } else if (v < 0.75) {
        fp.userAgent = fp.userAgent.replace(/Chrome\/\d+/, `Chrome/${randInt(120, 133)}`);
    }

    return fp;
}

/* ═══════════════════════════════════════════════════════════════
   🛡️  Aggressive Stealth Script
   ═══════════════════════════════════════════════════════════════ */

function buildStealthScript(fp) {
    const cfg = JSON.stringify({
        ua: fp.userAgent,
        platform: fp.platform,
        languages: fp.languages,
        cores: fp.cores,
        memory: fp.memory,
        screen: fp.screen,
        colorDepth: fp.colorDepth,
        gpuVendor: fp.gpuVendor,
        gpuRenderer: fp.gpuRenderer,
        timezone: fp.timezone,
        tzOffset: TZ_OFFSETS[fp.timezone] !== undefined ? TZ_OFFSETS[fp.timezone] : 0
    });

    return `
    (function () {
        'use strict';
        const FP = ${cfg};

        // ═══════════ Navigator ═══════════
        const navProto = Navigator.prototype;
        const defProp = (obj, prop, getter) => {
            try { Object.defineProperty(obj, prop, { get: getter, configurable: true }); }
            catch (e) {}
        };
        defProp(navProto, 'userAgent', () => FP.ua);
        defProp(navProto, 'appVersion', () => FP.ua.replace('Mozilla/', ''));
        defProp(navProto, 'platform', () => FP.platform);
        defProp(navProto, 'vendor', () => 'Google Inc.');
        defProp(navProto, 'language', () => FP.languages[0]);
        defProp(navProto, 'languages', () => Object.freeze([...FP.languages]));
        defProp(navProto, 'hardwareConcurrency', () => FP.cores);
        defProp(navProto, 'deviceMemory', () => FP.memory);
        defProp(navProto, 'maxTouchPoints', () => 0);
        defProp(navProto, 'webdriver', () => undefined);

        // ═══════════ Plugins (real objects) ═══════════
        try {
            const mkMime = (type, suffixes, desc) => {
                const m = Object.create(MimeType.prototype);
                Object.defineProperty(m, 'type', { value: type });
                Object.defineProperty(m, 'suffixes', { value: suffixes });
                Object.defineProperty(m, 'description', { value: desc });
                Object.defineProperty(m, 'enabledPlugin', { value: null });
                return m;
            };
            const mkPlugin = (name, file, desc, mimes) => {
                const p = Object.create(Plugin.prototype);
                Object.defineProperty(p, 'name', { value: name });
                Object.defineProperty(p, 'filename', { value: file });
                Object.defineProperty(p, 'description', { value: desc });
                Object.defineProperty(p, 'length', { value: mimes.length });
                mimes.forEach((m, i) => Object.defineProperty(p, i, { value: m }));
                return p;
            };
            const pdf1 = mkMime('application/pdf', 'pdf', 'Portable Document Format');
            const pdf2 = mkMime('text/pdf', 'pdf', 'Portable Document Format');
            const plugins = [
                mkPlugin('PDF Viewer', 'internal-pdf-viewer', 'PDF', [pdf1, pdf2]),
                mkPlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'PDF', [pdf1, pdf2]),
                mkPlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'PDF', [pdf1, pdf2]),
                mkPlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'PDF', [pdf1, pdf2]),
                mkPlugin('WebKit built-in PDF', 'internal-pdf-viewer', 'PDF', [pdf1, pdf2]),
                mkPlugin('Native Client', 'internal-nacl-plugin', '', [])
            ];
            const arr = Object.create(PluginArray.prototype);
            plugins.forEach((p, i) => Object.defineProperty(arr, i, { value: p }));
            Object.defineProperty(arr, 'length', { value: plugins.length });
            Object.defineProperty(arr, 'item', { value: i => plugins[i] || null });
            Object.defineProperty(arr, 'namedItem', { value: n => plugins.find(p => p.name === n) || null });
            defProp(navProto, 'plugins', () => arr);
        } catch (e) {}

        // ═══════════ Screen ═══════════
        const sp = Screen.prototype;
        defProp(sp, 'width', () => FP.screen.width);
        defProp(sp, 'height', () => FP.screen.height);
        defProp(sp, 'availWidth', () => FP.screen.width);
        defProp(sp, 'availHeight', () => FP.screen.availHeight);
        defProp(sp, 'colorDepth', () => FP.colorDepth);
        defProp(sp, 'pixelDepth', () => FP.colorDepth);

        // ═══════════ WebGL — INSTANCE LEVEL ═══════════
        // Most aggressive: hook at getContext level so every WebGL instance
        // returns our fingerprint, regardless of how it's created.
        try {
            const patchCtx = (ctx) => {
                if (!ctx) return ctx;
                try {
                    const origGetParam = ctx.getParameter.bind(ctx);
                    Object.defineProperty(ctx, 'getParameter', {
                        value: function (p) {
                            if (p === 37445) return FP.gpuVendor;
                            if (p === 37446) return FP.gpuRenderer;
                            if (p === 7936) return 'WebKit';
                            if (p === 7937) return 'WebKit WebGL';
                            return origGetParam(p);
                        },
                        writable: false,
                        configurable: false
                    });
                } catch (e) {}
                return ctx;
            };
            const origGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, attrs) {
                const ctx = origGetContext.call(this, type, attrs);
                if (ctx && (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2')) {
                    return patchCtx(ctx);
                }
                return ctx;
            };
            // Also patch prototype for safety
            if (window.WebGLRenderingContext) {
                const gp = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (p) {
                    if (p === 37445) return FP.gpuVendor;
                    if (p === 37446) return FP.gpuRenderer;
                    if (p === 7936) return 'WebKit';
                    if (p === 7937) return 'WebKit WebGL';
                    return gp.call(this, p);
                };
            }
            if (window.WebGL2RenderingContext) {
                const gp2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function (p) {
                    if (p === 37445) return FP.gpuVendor;
                    if (p === 37446) return FP.gpuRenderer;
                    if (p === 7936) return 'WebKit';
                    if (p === 7937) return 'WebKit WebGL';
                    return gp2.call(this, p);
                };
            }
        } catch (e) {}

        // ═══════════ Canvas Noise (fingerprint defense) ═══════════
        try {
            const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
            CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
                const imgData = origGetImageData.call(this, x, y, w, h);
                // Add subtle noise to 0.01% of pixels
                const data = imgData.data;
                const pixelCount = data.length / 4;
                const noiseCount = Math.max(1, Math.floor(pixelCount * 0.0001));
                for (let i = 0; i < noiseCount; i++) {
                    const idx = Math.floor(Math.random() * pixelCount) * 4;
                    data[idx] = (data[idx] + 1) % 256;
                }
                return imgData;
            };
            if (CanvasRenderingContext2D.prototype.toDataURL) {
                const origToDataURL = CanvasRenderingContext2D.prototype.toDataURL;
                CanvasRenderingContext2D.prototype.toDataURL = function (...args) {
                    return origToDataURL.apply(this, args);
                };
            }
        } catch (e) {}

        // ═══════════ Timezone ═══════════
        try {
            const origResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
            Intl.DateTimeFormat.prototype.resolvedOptions = function () {
                const r = origResolved.call(this);
                if (r.timeZone) r.timeZone = FP.timezone;
                return r;
            };
            Date.prototype.getTimezoneOffset = function () { return FP.tzOffset; };
        } catch (e) {}

        // ═══════════ Permissions ═══════════
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const oq = navigator.permissions.query.bind(navigator.permissions);
                navigator.permissions.query = function (d) {
                    if (d && d.name === 'notifications') return Promise.resolve({ state: 'default', onchange: null });
                    return oq(d);
                };
            }
        } catch (e) {}

        // ═══════════ Chrome runtime ═══════════
        try {
            window.chrome = window.chrome || {};
            window.chrome.runtime = window.chrome.runtime || {};
            window.chrome.app = window.chrome.app || { isInstalled: false };
            window.chrome.csi = () => ({ onloadT: Date.now(), startE: Date.now(), pageT: 0, tran: 15 });
            window.chrome.loadTimes = () => ({ commitLoadTime: Date.now()/1000, finishLoadTime: Date.now()/1000, navigationType: 'Other' });
        } catch (e) {}

        // ═══════════ WebRTC leak ═══════════
        try {
            const oRTC = window.RTCPeerConnection;
            window.RTCPeerConnection = function (cfg) {
                if (cfg && cfg.iceServers) cfg.iceServers = [];
                return new oRTC(cfg || { iceServers: [] });
            };
        } catch (e) {}

        // ═══════════ Battery ═══════════
        try {
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
                    onchargingchange: null, onchargingtimechange: null,
                    ondischargingtimechange: null, onlevelchange: null
                });
            }
        } catch (e) {}
    })();
    `;
}

/* ═══════════════════════════════════════════════════════════════
   🎭  Behavior Engine
   ═══════════════════════════════════════════════════════════════ */

function makeBehaviorEngine(log) {
    let mouseX = randInt(300, 1200);
    let mouseY = randInt(200, 800);
    const pause = (page, a, b) => page.waitForTimeout(randInt(a, b));

    async function moveMouse(page, tx, ty) {
        const sx = mouseX, sy = mouseY;
        const dist = Math.hypot(tx - sx, ty - sy);
        if (dist < 2) return;
        const cX = (sx + tx) / 2 + (rng() - 0.5) * Math.min(dist * 0.4, 150);
        const cY = (sy + ty) / 2 + (rng() - 0.5) * Math.min(dist * 0.4, 150);
        const steps = Math.max(5, Math.min(35, Math.round(dist / 15) + randInt(2, 6)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cX + t * t * tx;
            const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cY + t * t * ty;
            await page.mouse.move(x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2);
            await page.waitForTimeout(randInt(4, 16));
        }
        mouseX = tx; mouseY = ty;
    }

    async function scrollDown(page, dy) {
        const chunks = randInt(3, 6);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, dy / chunks + (rng() - 0.5) * 30);
            await page.waitForTimeout(randInt(35, 110));
        }
    }
    async function scrollUp(page, dy) {
        const chunks = randInt(2, 4);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, -dy / chunks + (rng() - 0.5) * 20);
            await page.waitForTimeout(randInt(45, 120));
        }
    }
    async function microMoves(page, n) {
        for (let i = 0; i < n; i++) {
            await moveMouse(page, mouseX + (rng() - 0.5) * 60, mouseY + (rng() - 0.5) * 35);
            await pause(page, 80, 260);
        }
    }
    async function clickAt(page, x, y) {
        await moveMouse(page, x, y);
        if (rng() < 0.35) {
            await moveMouse(page, x + (rng() - 0.5) * 28, y + (rng() - 0.5) * 28);
            await pause(page, 100, 300);
            await moveMouse(page, x, y);
        }
        await pause(page, 50, 180);
        await page.mouse.move(x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2);
        await pause(page, 30, 90);
        await page.mouse.down();
        await page.waitForTimeout(randInt(45, 105));
        await page.mouse.up();
    }

    return { moveMouse, scrollDown, scrollUp, microMoves, clickAt, pause };
}

/* ═══════════════════════════════════════════════════════════════
   🔎  Page helpers
   ═══════════════════════════════════════════════════════════════ */

async function findCards(page) {
    let cards = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('img').forEach(img => {
            const a = img.closest('a');
            if (!a) return;
            const href = a.href || '';
            if (!href.includes('blogspot.com')) return;
            if (!/\/\d{4}\/\d{2}\//.test(href)) return;
            const r = img.getBoundingClientRect();
            if (r.width < 60 || r.height < 60) return;
            out.push({ href, x: r.x, y: r.y, w: r.width, h: r.height });
        });
        const s = new Set();
        return out.filter(o => { if (s.has(o.href)) return false; s.add(o.href); return true; });
    }).catch(() => []);
    if (cards.length >= 3) return cards;

    cards = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href || '';
            if (!href.includes('blogspot.com')) return;
            if (!/\/\d{4}\//.test(href)) return;
            const r = a.getBoundingClientRect();
            if (r.width < 80 || r.height < 80 || r.width > 900) return;
            out.push({ href, x: r.x, y: r.y, w: r.width, h: r.height });
        });
        const s = new Set();
        return out.filter(o => { if (s.has(o.href)) return false; s.add(o.href); return true; });
    }).catch(() => []);
    return cards;
}

async function scrollToHref(page, href) {
    try {
        await page.evaluate((h) => {
            for (const l of document.querySelectorAll('a[href]')) {
                if (l.href === h) { l.scrollIntoView({ behavior: 'instant', block: 'center' }); return; }
            }
        }, href);
    } catch (e) {}
}

async function boxOfHref(page, href) {
    try {
        return await page.evaluate((h) => {
            for (const l of document.querySelectorAll('a[href]')) {
                if (l.href === h) {
                    const r = l.getBoundingClientRect();
                    return { x: r.x, y: r.y, w: r.width, h: r.height };
                }
            }
            return null;
        }, href);
    } catch (e) { return null; }
}

async function findExternalLink(page) {
    try {
        return await page.evaluate(() => {
            const EXCL = ['blogspot.com','blogger.com','google.com','googlesyndication',
                'doubleclick','googleadservices','google-analytics','gstatic','googleusercontent',
                'facebook.com','fb.com','twitter.com','x.com','instagram.com','youtube.com',
                'youtu.be','whatsapp','telegram','t.me','pinterest','tiktok','linkedin','reddit.com'];
            const bad = h => EXCL.some(d => h.toLowerCase().includes(d));
            const scope = document.querySelector('.post-body') || document.querySelector('.entry-content') ||
                          document.querySelector('article') || document.body;
            const c = [];
            for (const a of scope.querySelectorAll('a[href^="http"]')) {
                const href = a.href;
                if (bad(href)) continue;
                const text = (a.textContent || '').trim();
                if (text.length < 3) continue;
                const s = getComputedStyle(a);
                if (s.display === 'none' || s.visibility === 'hidden') continue;
                const r = a.getBoundingClientRect();
                if (r.width < 30 || r.height < 12) continue;
                c.push({ href, text, x: r.x, y: r.y, w: r.width, h: r.height, area: r.width * r.height });
            }
            c.sort((a, b) => b.area - a.area);
            return c[0] || null;
        });
    } catch (e) { return null; }
}

async function clickGame(page, href, B, log) {
    log(`  -> Clicking: ${href.substring(0, 70)}...`);
    await scrollToHref(page, href);
    const box = await boxOfHref(page, href);
    if (!box || box.w < 30) { log("     ! box not found"); return false; }
    const cx = box.x + box.w * (0.3 + rng() * 0.4);
    const cy = box.y + box.h * (0.3 + rng() * 0.4);
    if (rng() < 0.7) {
        await B.moveMouse(page, cx, cy);
        await B.pause(page, 120, 400);
    }
    try {
        await Promise.all([
            page.waitForURL(/\/\d{4}\/\d{2}\//, { timeout: 15000 }).catch(() => {}),
            B.clickAt(page, cx, cy)
        ]);
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    } catch (e) {}
    if (/\/\d{4}\/\d{2}\//.test(page.url())) {
        log(`     ✓ on post: ${page.url().substring(0, 70)}...`);
        return true;
    }
    return false;
}

async function dwellOnPost(page, seconds, B, log) {
    log(`     Reading for >=${seconds}s...`);
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
        const r = rng();
        if (r < 0.4) { await B.scrollDown(page, randInt(150, 350)); await B.pause(page, 500, 1200); }
        else if (r < 0.6) { await B.scrollUp(page, randInt(100, 220)); await B.pause(page, 400, 900); }
        else { await B.microMoves(page, randInt(1, 3)); await B.pause(page, 400, 1000); }
    }
}

async function exitToGame(page, B, log) {
    log("     Looking for external link...");
    const link = await findExternalLink(page);
    if (!link) { log("     ! no external link"); return false; }
    log(`     Found: "${link.text.substring(0, 40)}"`);
    await scrollToHref(page, link.href);
    const box = await boxOfHref(page, link.href);
    if (!box || box.w < 20) return false;
    const cx = box.x + box.w * (0.35 + rng() * 0.3);
    const cy = box.y + box.h * (0.35 + rng() * 0.3);
    if (rng() < 0.6) {
        await B.moveMouse(page, cx, cy);
        await B.pause(page, 200, 500);
    }
    try {
        await Promise.all([
            page.waitForURL(u => !u.toString().includes('blogspot.com'), { timeout: 15000 }).catch(() => {}),
            B.clickAt(page, cx, cy)
        ]);
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    } catch (e) {}
    await B.pause(page, 1200, 2400);
    if (!page.url().includes('blogspot.com')) {
        log(`     ✓ LEFT -> ${page.url().substring(0, 60)}...`);
        await B.pause(page, 700, 1400);
        await B.microMoves(page, 2);
        await B.scrollDown(page, randInt(150, 350));
        await B.pause(page, 1000, 2000);
        return true;
    }
    return false;
}

/* ═══════════════════════════════════════════════════════════════
   🎬  Session Runner
   ═══════════════════════════════════════════════════════════════ */

async function runOneBot(botId, fingerprint, options = {}) {
    const { proxy = null, proxyGeo = null, referrerSource = null } = options;
    const tag = `BOT-${botId}`;
    const log = (m) => LOG.info(tag, m);
    const ok  = (m) => LOG.ok(tag, m);
    const err = (m) => LOG.error(tag, m);

    // Choose referrer
    const refSrc = referrerSource || pickReferrerSource();

    log(`Fingerprint: ${fingerprint.name}`);
    log(`  UA: ${fingerprint.userAgent.substring(0, 70)}...`);
    log(`  TZ: ${fingerprint.timezone} | Locale: ${fingerprint.locale}`);
    log(`  Arrival: ${refSrc.name}${refSrc.referer ? ` (${refSrc.referer})` : ' (direct)'}`);
    if (proxy) log(`  Proxy: ${proxy.server} → ${proxyGeo ? proxyGeo.city + ', ' + proxyGeo.country : '?'}`);

    const B = makeBehaviorEngine(log);
    const startTime = Date.now();

    let browser, context, page;
    try {
        const launchArgs = [
            `--user-agent=${fingerprint.userAgent}`,
            `--lang=${fingerprint.languages[0]}`,
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--no-first-run', '--no-zygote'
        ];
        const proxyConfig = proxy ? {
            server: `http://${proxy.server}`,
            username: proxy.username,
            password: proxy.password
        } : undefined;

        browser = await chromiumExtra.launch({ headless: CFG.headless, args: launchArgs, proxy: proxyConfig });
        context = await browser.newContext({
            viewport: fingerprint.viewport,
            screen: { width: fingerprint.screen.width, height: fingerprint.screen.height },
            userAgent: fingerprint.userAgent,
            locale: fingerprint.locale,
            timezoneId: fingerprint.timezone,
            deviceScaleFactor: fingerprint.dsf,
            colorScheme: 'light',
            proxy: proxyConfig
        });

        // Stealth script on context (applies to all future pages)
        await context.addInitScript(buildStealthScript(fingerprint));

        page = await context.newPage();
        // Also apply to current page
        await page.addInitScript(buildStealthScript(fingerprint));

        page.on("framenavigated", f => {
            if (f === page.mainFrame()) log(`  [NAV] ${f.url().substring(0, 80)}`);
        });

        // ⭐ Navigate with referrer
        const gotoOpts = { waitUntil: "domcontentloaded", timeout: 60000 };
        if (refSrc.referer) gotoOpts.referer = refSrc.referer;

        await page.goto(CFG.targetUrl, gotoOpts);
        log(`Loaded homepage via ${refSrc.name}`);

        // Verify fingerprint
        const liveFp = await page.evaluate(() => ({
            wd: navigator.webdriver,
            plugins: navigator.plugins.length,
            cores: navigator.hardwareConcurrency,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ref: document.referrer,
            gpu: (() => {
                try {
                    const c = document.createElement('canvas');
                    const gl = c.getContext('webgl');
                    if (!gl) return '?';
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).substring(0, 60) : '?';
                } catch (e) { return '?'; }
            })()
        }));
        log(`  CHECK: wd=${liveFp.wd}, plugins=${liveFp.plugins}, tz=${liveFp.tz}`);
        log(`  GPU: ${liveFp.gpu}`);
        log(`  Ref: ${liveFp.ref.substring(0, 70)}`);

        // ⭐ Session variance: bounce / reader / engaged
        const sessionType = (() => {
            const r = rng();
            if (r < 0.25) return 'bounce';   // 25%: quick bounce
            if (r < 0.85) return 'reader';   // 60%: normal reader
            return 'engaged';                // 15%: deep engagement
        })();
        log(`  Session type: ${sessionType}`);

        // Homepage browsing
        await B.microMoves(page, sessionType === 'bounce' ? 1 : 2);
        await B.pause(page, 150, 350);
        await B.scrollDown(page, randInt(
            sessionType === 'bounce' ? 100 : 200,
            sessionType === 'engaged' ? 600 : 380
        ));
        await B.pause(page, 250, 550);

        let cards = await findCards(page);
        log(`  Cards found: ${cards.length}`);
        if (cards.length === 0) {
            await B.scrollDown(page, 500);
            await B.pause(page, 500, 1000);
            cards = await findCards(page);
        }
        if (cards.length === 0) { log("  No cards — aborting"); return { status: 'no_cards', sessionType }; }

        // Plan
        let plan;
        if (sessionType === 'bounce') {
            plan = rng() < 0.6 ? 'single-exit' : 'single-return';
        } else if (sessionType === 'reader') {
            const r = rng();
            plan = r < 0.5 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
        } else { // engaged
            plan = rng() < 0.5 ? 'double' : 'single-return';
        }
        log(`  Plan: ${plan}`);

        // Choose games
        const firstIdx = randInt(0, Math.min(cards.length - 1, 5));
        const first = cards[firstIdx];
        const ok1 = await clickGame(page, first.href, B, log);
        if (!ok1) {
            await B.pause(page, 800, 1500);
            if (!/\/\d{4}\/\d{2}\//.test(page.url()) && cards.length > 1) {
                const alt = cards[randInt(0, Math.min(cards.length - 1, 5))];
                await clickGame(page, alt.href, B, log);
            }
        }

        // Post-page behavior
        if (/\/\d{4}\/\d{2}\//.test(page.url())) {
            const dwellSec = sessionType === 'bounce'
                ? randInt(3, 7)
                : (sessionType === 'engaged' ? randInt(15, 25) : randInt(CFG.dwellMin, CFG.dwellMax));

            await dwellOnPost(page, dwellSec, B, log);

            if (plan === 'single-exit' || plan === 'double') {
                const left = await exitToGame(page, B, log);
                if (!left && plan === 'single-exit') {
                    try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                    await B.pause(page, 700, 1400);
                }
            } else {
                log("  Returning home");
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                await B.pause(page, 700, 1400);
            }
        }

        // Second game (double plan)
        if (plan === 'double' && page.url().includes('blogspot.com') && !/\/\d{4}\/\d{2}\//.test(page.url())) {
            await B.pause(page, 500, 1200);
            await B.scrollDown(page, randInt(150, 320));
            await B.pause(page, 400, 900);
            const fresh = await findCards(page);
            const remaining = fresh.filter(c => c.href !== first.href);
            if (remaining.length) {
                const second = remaining[randInt(0, Math.min(remaining.length - 1, 5))];
                if (await clickGame(page, second.href, B, log)) {
                    const dwellSec = randInt(CFG.dwellMin, CFG.dwellMax);
                    await dwellOnPost(page, dwellSec, B, log);
                    const left = await exitToGame(page, B, log);
                    if (!left) { try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {} }
                }
            }
        }

        const duration = Date.now() - startTime;
        ok(`Session done in ${Math.round(duration / 1000)}s | type: ${sessionType} | source: ${refSrc.name}`);

        if (CFG.screenshots) {
            const dir = path.join(process.cwd(), "screenshots");
            fs.mkdirSync(dir, { recursive: true });
            await page.screenshot({
                path: path.join(dir, `run-${RUN_ID}-bot-${botId}.png`),
                fullPage: true
            }).catch(() => {});
        }

        await B.pause(page, 1500, 2500);
        return { status: 'ok', duration, sessionType, source: refSrc.name };

    } catch (e) {
        err(`Session error: ${e.message}`);
        return { status: 'error', error: e.message, duration: Date.now() - startTime };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

/* ═══════════════════════════════════════════════════════════════
   ⏰  Poisson Scheduler with double jitter
   ═══════════════════════════════════════════════════════════════ */

function poissonTimes(count, windowMs) {
    const times = [];
    const avgGap = windowMs / count;
    let t = 0;
    for (let i = 0; i < count; i++) {
        const gap = -Math.log(rng() || 0.0001) * avgGap;
        t += gap;
        times.push(Math.min(t, windowMs));
    }
    return times.sort((a, b) => a - b);
}

/* ═══════════════════════════════════════════════════════════════
   🗂️  State (persistent across cron runs)
   ═══════════════════════════════════════════════════════════════ */

class State {
    constructor() {
        this.dir = path.join(process.cwd(), CFG.stateDir);
        this.file = path.join(this.dir, 'state.json');
        this.data = this.load();
    }
    load() {
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            if (fs.existsSync(this.file)) return JSON.parse(fs.readFileSync(this.file, 'utf8'));
        } catch (e) {}
        return { lastRunAt: 0, totalRuns: 0, totalBots: 0, fingerprintUsage: {}, recentRuns: [] };
    }
    save() {
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            this.data.recentRuns = (this.data.recentRuns || []).slice(-50);
            fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {}
    }
    recordRun(summary) {
        this.data.lastRunAt = Date.now();
        this.data.totalRuns++;
        this.data.totalBots += summary.botCount || 0;
        this.data.recentRuns.push({ runId: RUN_ID, ...summary, timestamp: new Date().toISOString() });
        this.save();
    }
    shouldSkipCron() {
        const elapsedMin = (Date.now() - this.data.lastRunAt) / 60000;
        return elapsedMin < CFG.cronMinGapMin;
    }
}

/* ═══════════════════════════════════════════════════════════════
   🎭  Orchestrators
   ═══════════════════════════════════════════════════════════════ */

async function runSingle() {
    const pool = ProxyPool.fromEnv();
    let proxy = null, proxyGeo = null;
    if (!pool.isEmpty()) {
        proxy = pool.pickLeastUsed();
        if (proxy) proxyGeo = await detectGeo(proxy);
    }
    if (!proxyGeo) proxyGeo = await detectGeo(null);

    if (CFG.geoStrict && !proxyGeo) {
        LOG.error('MAIN', 'GEO_STRICT: cannot determine IP — aborting');
        return { status: 'aborted_no_geo' };
    }

    const baseFp = pick(BASE_FINGERPRINTS);
    const fp = buildFingerprintForGeo(baseFp, proxyGeo);
    return await runOneBot(CFG.botId, fp, { proxy, proxyGeo });
}

async function runParallel() {
    LOG.info('MAIN', `Parallel: ${CFG.botCount} bots, concurrency ${CFG.parallelism}`);
    const pool = ProxyPool.fromEnv();
    const limit = Math.max(1, CFG.parallelism);
    const geoCaches = new Map();

    async function getGeo(proxy) {
        const key = proxy ? proxy.server : '__local__';
        if (geoCaches.has(key)) return geoCaches.get(key);
        const g = await detectGeo(proxy);
        geoCaches.set(key, g);
        return g;
    }

    const queue = Array.from({ length: CFG.botCount }, (_, i) => i + 1);
    const results = [];
    const running = new Set();

    async function launchBot(id) {
        // Small random delay before each bot (avoid simultaneous starts)
        await sleep(randInt(0, 3000));

        const proxy = pool.isEmpty() ? null : pool.pickLeastUsed();
        const geo = await getGeo(proxy);
        if (proxy) pool.markUsed(proxy);

        if (CFG.geoStrict && !geo) {
            LOG.warn('MAIN', `Bot ${id}: no geo — skipping`);
            results.push({ id, status: 'no_geo' });
            return;
        }

        const baseFp = BASE_FINGERPRINTS[(id - 1) % BASE_FINGERPRINTS.length];
        const fp = buildFingerprintForGeo(baseFp, geo);
        const res = await runOneBot(id, fp, { proxy, proxyGeo: geo });
        results.push({ id, ...res });
    }

    while (queue.length > 0 || running.size > 0) {
        while (running.size < limit && queue.length > 0) {
            const id = queue.shift();
            const p = launchBot(id).finally(() => running.delete(p));
            running.add(p);
        }
        if (running.size > 0) await Promise.race([...running]);
    }
    return { status: 'ok', results };
}

async function runSequential() {
    LOG.info('MAIN', `Sequential: ${CFG.botCount} bots`);
    const pool = ProxyPool.fromEnv();
    const results = [];
    for (let i = 1; i <= CFG.botCount; i++) {
        const proxy = pool.isEmpty() ? null : pool.pickLeastUsed();
        let geo = proxy ? await detectGeo(proxy) : await detectGeo(null);
        if (proxy) pool.markUsed(proxy);
        if (CFG.geoStrict && !geo) {
            LOG.warn('MAIN', `Bot ${i}: no geo — skipping`);
            results.push({ id: i, status: 'no_geo' });
            continue;
        }
        const baseFp = BASE_FINGERPRINTS[(i - 1) % BASE_FINGERPRINTS.length];
        const fp = buildFingerprintForGeo(baseFp, geo);
        const res = await runOneBot(i, fp, { proxy, proxyGeo: geo });
        results.push({ id: i, ...res });

        if (i < CFG.botCount) {
            const gap = randInt(CFG.minGapSec, CFG.maxGapSec) * 1000;
            LOG.info('MAIN', `Gap ${(gap / 1000).toFixed(0)}s`);
            await sleep(gap);
        }
    }
    return { status: 'ok', results };
}

async function runDistributed() {
    const windowMs = CFG.windowMinutes * 60 * 1000;
    const pool = ProxyPool.fromEnv();
    LOG.info('MAIN', `Distributed: ${CFG.botCount} bots over ${CFG.windowMinutes}m`);
    const times = poissonTimes(CFG.botCount, windowMs);
    LOG.info('MAIN', `Scheduled: ${times.map(t => (t / 60000).toFixed(1) + 'm').join(', ')}`);
    const t0 = Date.now();
    const results = [];

    const tasks = times.map((offset, idx) => (async () => {
        const wait = offset - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        // Extra jitter (0-90s) to avoid synchronized starts
        await sleep(randInt(0, 90000));

        const proxy = pool.isEmpty() ? null : pool.pickLeastUsed();
        let geo = proxy ? await detectGeo(proxy) : await detectGeo(null);
        if (proxy) pool.markUsed(proxy);
        if (CFG.geoStrict && !geo) {
            results.push({ id: idx + 1, status: 'no_geo' });
            return;
        }
        const baseFp = BASE_FINGERPRINTS[idx % BASE_FINGERPRINTS.length];
        const fp = buildFingerprintForGeo(baseFp, geo);
        const res = await runOneBot(idx + 1, fp, { proxy, proxyGeo: geo });
        results.push({ id: idx + 1, ...res });
    })());

    await Promise.all(tasks);
    return { status: 'ok', results };
}

async function runCampaign() {
    LOG.info('MAIN', `Campaign: ${CFG.botCount} bots over ${CFG.windowMinutes}m`);
    const windowMs = CFG.windowMinutes * 60 * 1000;

    // Generate waves with varying sizes
    const waves = [];
    let remaining = CFG.botCount;
    while (remaining > 0) {
        const size = Math.min(remaining, randInt(2, 6));
        waves.push(size);
        remaining -= size;
    }
    LOG.info('MAIN', `Waves: ${waves.join(' + ')} = ${waves.reduce((a, b) => a + b, 0)}`);

    // Poisson times for wave starts
    const waveStarts = poissonTimes(waves.length, windowMs * 0.80);
    const t0 = Date.now();
    const results = [];

    for (let wi = 0; wi < waves.length; wi++) {
        const wait = waveStarts[wi] - (Date.now() - t0);
        if (wait > 0) {
            LOG.info('MAIN', `Waiting ${(wait / 60000).toFixed(1)}m for wave ${wi + 1}`);
            await sleep(wait);
        }
        // Random jitter (0-60s) before wave
        await sleep(randInt(0, 60000));

        LOG.info('MAIN', `▶ Wave ${wi + 1}/${waves.length}: ${waves[wi]} bots`);
        const savedCount = CFG.botCount;
        CFG.botCount = waves[wi];
        const r = await runParallel();
        CFG.botCount = savedCount;
        results.push(...(r.results || []));

        if (wi < waves.length - 1) {
            const gap = randInt(60, 240) * 1000;
            LOG.info('MAIN', `Wave gap ${(gap / 1000).toFixed(0)}s`);
            await sleep(gap);
        }
    }
    return { status: 'ok', results, waves };
}

async function runAuto() {
    const state = new State();
    if (state.shouldSkipCron()) {
        const ago = Math.round((Date.now() - state.data.lastRunAt) / 60000);
        LOG.info('MAIN', `Skipping: last run was ${ago}m ago (min gap ${CFG.cronMinGapMin}m)`);
        return { status: 'skipped', reason: 'recent_run' };
    }

    const modes = ['parallel', 'sequential', 'distributed', 'campaign'];
    const chosenMode = pick(modes);
    const count = randInt(3, Math.max(4, Math.min(15, CFG.botCount || 8)));

    LOG.info('MAIN', `Auto: mode=${chosenMode}, count=${count}`);

    const originalMode = CFG.mode;
    const originalCount = CFG.botCount;
    CFG.mode = chosenMode;
    CFG.botCount = count;

    let result;
    try {
        if (chosenMode === 'parallel') result = await runParallel();
        else if (chosenMode === 'sequential') result = await runSequential();
        else if (chosenMode === 'distributed') result = await runDistributed();
        else if (chosenMode === 'campaign') result = await runCampaign();
    } finally {
        CFG.mode = originalMode;
        CFG.botCount = originalCount;
    }

    state.recordRun({ mode: chosenMode, botCount: count, status: result?.status || 'unknown' });
    return result || { status: 'ok' };
}

/* ═══════════════════════════════════════════════════════════════
   🚀  Main
   ═══════════════════════════════════════════════════════════════ */

function printBanner() {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║  BLOGGER BOT DETECTION LAB v3.1 — Geo-Strict        ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log(`  Run ID:        ${RUN_ID}`);
    console.log(`  Target:        ${CFG.targetUrl}`);
    console.log(`  Mode:          ${CFG.mode}`);
    console.log(`  Bot count:     ${CFG.botCount}`);
    console.log(`  Parallelism:   ${CFG.parallelism}`);
    console.log(`  Window:        ${CFG.windowMinutes} min`);
    console.log(`  Geo strict:    ${CFG.geoStrict}`);
    console.log(`  Max per IP:    ${CFG.maxPerIp}`);
    console.log(`  Max duration:  ${CFG.maxDurationMin} min`);
    console.log(`  Headless:      ${CFG.headless}`);
    console.log("──────────────────────────────────────────────────────");
}

async function main() {
    printBanner();

    const timeout = setTimeout(() => {
        LOG.warn('MAIN', `MAX_DURATION_MINUTES reached — exiting`);
        process.exit(0);
    }, CFG.maxDurationMin * 60 * 1000);
    timeout.unref();

    let summary;
    try {
        switch (CFG.mode) {
            case 'parallel':    summary = await runParallel(); break;
            case 'sequential':  summary = await runSequential(); break;
            case 'distributed': summary = await runDistributed(); break;
            case 'campaign':    summary = await runCampaign(); break;
            case 'auto':        summary = await runAuto(); break;
            case 'single':
            default:            summary = await runSingle();
        }
        const okCount = (summary?.results || []).filter(r => r.status === 'ok').length;
        LOG.ok('MAIN', `Done in ${Math.round((Date.now() - START_TS) / 1000)}s | OK: ${okCount}`);
    } catch (e) {
        LOG.error('MAIN', `Fatal: ${e.message}`);
        process.exitCode = 1;
    }

    clearTimeout(timeout);
    await sleep(500);
    process.exit(process.exitCode || 0);
}

main();
