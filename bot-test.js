const { chromium } = require("patchright");
const fs = require("fs");
const path = require("path");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AnonymizeUA = require("@zorilla/puppeteer-extra-plugin-anonymize-ua").default;

const chromiumExtra = addExtra(chromium);
chromiumExtra.use(StealthPlugin());
chromiumExtra.use(AnonymizeUA());

const TARGET_URL = process.env.TARGET_URL || "https://pog01.blogspot.com/";
const BOT_MODE = process.env.BOT_MODE || "single";
const BOT_COUNT = parseInt(process.env.BOT_COUNT || "1", 10);
const BOT_ID = process.env.BOT_ID || "1";           // يُستخدم في matrix mode
const WINDOW_MINUTES = parseInt(process.env.WINDOW_MINUTES || "30", 10);
const MAX_PER_IP = parseInt(process.env.MAX_PER_IP || "2", 10);

/* ============================================================
   🎨 مخزون البصمات الأساسية (دون locale/timezone)
   ============================================================ */

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
    }
];

/* ============================================================
   🌍 خريطة الدولة → locale + timezones
   ============================================================ */

const GEO_PROFILES = {
    'US': { locale: 'en-US', languages: ['en-US', 'en'], timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'] },
    'GB': { locale: 'en-GB', languages: ['en-GB', 'en'], timezones: ['Europe/London'] },
    'DE': { locale: 'de-DE', languages: ['de-DE', 'de', 'en'], timezones: ['Europe/Berlin'] },
    'FR': { locale: 'fr-FR', languages: ['fr-FR', 'fr', 'en'], timezones: ['Europe/Paris'] },
    'CA': { locale: 'en-CA', languages: ['en-CA', 'en', 'fr'], timezones: ['America/Toronto', 'America/Vancouver'] },
    'AU': { locale: 'en-AU', languages: ['en-AU', 'en'], timezones: ['Australia/Sydney', 'Australia/Melbourne'] },
    'NL': { locale: 'nl-NL', languages: ['nl-NL', 'nl', 'en'], timezones: ['Europe/Amsterdam'] },
    'JP': { locale: 'ja-JP', languages: ['ja-JP', 'ja'], timezones: ['Asia/Tokyo'] },
    'IN': { locale: 'en-IN', languages: ['en-IN', 'en', 'hi'], timezones: ['Asia/Kolkata'] },
    'BR': { locale: 'pt-BR', languages: ['pt-BR', 'pt', 'en'], timezones: ['America/Sao_Paulo'] },
    'SA': { locale: 'ar-SA', languages: ['ar-SA', 'ar', 'en'], timezones: ['Asia/Riyadh'] },
    'AE': { locale: 'ar-AE', languages: ['ar-AE', 'ar', 'en'], timezones: ['Asia/Dubai'] },
    'SG': { locale: 'en-SG', languages: ['en-SG', 'en'], timezones: ['Asia/Singapore'] },
    'ES': { locale: 'es-ES', languages: ['es-ES', 'es', 'en'], timezones: ['Europe/Madrid'] },
    'IT': { locale: 'it-IT', languages: ['it-IT', 'it', 'en'], timezones: ['Europe/Rome'] },
    'PL': { locale: 'pl-PL', languages: ['pl-PL', 'pl', 'en'], timezones: ['Europe/Warsaw'] },
    'KR': { locale: 'ko-KR', languages: ['ko-KR', 'ko', 'en'], timezones: ['Asia/Seoul'] },
    'MX': { locale: 'es-MX', languages: ['es-MX', 'es', 'en'], timezones: ['America/Mexico_City'] },
    'AR': { locale: 'es-AR', languages: ['es-AR', 'es', 'en'], timezones: ['America/Argentina/Buenos_Aires'] },
    'ZA': { locale: 'en-ZA', languages: ['en-ZA', 'en'], timezones: ['Africa/Johannesburg'] },
    'TR': { locale: 'tr-TR', languages: ['tr-TR', 'tr', 'en'], timezones: ['Europe/Istanbul'] },
    'ID': { locale: 'id-ID', languages: ['id-ID', 'id', 'en'], timezones: ['Asia/Jakarta'] },
    'TH': { locale: 'th-TH', languages: ['th-TH', 'th', 'en'], timezones: ['Asia/Bangkok'] }
};

function pickGeoProfile(countryCode) {
    const key = (countryCode || 'US').toUpperCase();
    return GEO_PROFILES[key] || GEO_PROFILES['US'];
}

/* ============================================================
   🌐 إدارة مجموعة البروكسيات
   ============================================================ */

class ProxyPool {
    constructor(list) {
        this.proxies = list.map(p => ({ ...p, usage: 0, lastUsed: 0, geo: null, failed: 0 }));
    }

    static fromEnv() {
        // 1) PROXIES_JSON = '[{"server":"1.2.3.4:8080","username":"u","password":"p"}]'
        if (process.env.PROXIES_JSON) {
            try {
                const arr = JSON.parse(process.env.PROXIES_JSON);
                return new ProxyPool(arr);
            } catch (e) {
                console.error('PROXIES_JSON parse error:', e.message);
            }
        }
        // 2) PROXIES = 'host1:port1:user1:pass1\nhost2:port2' (multi-line)
        if (process.env.PROXIES) {
            const list = parseProxyLines(process.env.PROXIES);
            return new ProxyPool(list);
        }
        // 3) proxies.txt
        const file = path.join(process.cwd(), 'proxies.txt');
        if (fs.existsSync(file)) {
            const list = parseProxyLines(fs.readFileSync(file, 'utf8'));
            return new ProxyPool(list);
        }
        return new ProxyPool([]);
    }

    size() { return this.proxies.length; }
    isEmpty() { return this.proxies.length === 0; }

    pickLeastUsed() {
        if (this.isEmpty()) return null;
        const sorted = [...this.proxies].sort((a, b) => {
            if (a.failed >= 3) return 1;
            if (b.failed >= 3) return -1;
            if (a.usage !== b.usage) return a.usage - b.usage;
            return a.lastUsed - b.lastUsed;
        });
        return sorted[0];
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

/* ============================================================
   🌍 تحديد موقع البروكسي تلقائياً (IP + timezone)
   ============================================================ */

async function detectProxyGeo(browser, proxy) {
    // نفتح متصفح مؤقت لفحص الـ IP
    const ctx = await browser.newContext({
        proxy: proxy ? {
            server: `http://${proxy.server}`,
            username: proxy.username,
            password: proxy.password
        } : undefined,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    });
    const page = await ctx.newPage();
    try {
        await page.goto('https://ipapi.co/json/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const data = await page.evaluate(() => {
            try { return JSON.parse(document.body.innerText); } catch (e) { return null; }
        });
        await ctx.close();
        if (!data) return null;
        return {
            ip: data.ip,
            country: (data.country_code || '').toUpperCase(),
            country_name: data.country_name,
            timezone: data.timezone,
            city: data.city,
            org: data.org,
            asn: data.asn
        };
    } catch (e) {
        await ctx.close().catch(() => {});
        return null;
    }
}

/* ============================================================
   🧬 بناء بصمة متوافقة مع موقع IP
   ============================================================ */

function buildFingerprintForGeo(baseFp, geo) {
    const fp = JSON.parse(JSON.stringify(baseFp));
    const profile = pickGeoProfile(geo ? geo.country : 'US');

    fp.locale = profile.locale;
    fp.languages = [...profile.languages];

    // نستخدم timezone IP إن وُجد، وإلا نختار من قائمة الدولة
    if (geo && geo.timezone) {
        fp.timezone = geo.timezone;
    } else {
        fp.timezone = profile.timezones[Math.floor(Math.random() * profile.timezones.length)];
    }

    // بعض التعديلات الصغيرة على البصمة (لكل بوت على نفس الـIP)
    // حتى تبدو أجهزة مختلفة على نفس الشبكة
    const variation = Math.random();
    if (variation < 0.3) {
        // نفس البصمة
    } else if (variation < 0.6) {
        // تصغير viewport
        fp.viewport.width = Math.round(fp.viewport.width * 0.9);
        fp.viewport.height = Math.round(fp.viewport.height * 0.9);
    } else if (variation < 0.8) {
        // تغيير دقة الشاشة قليلاً
        fp.screen.availHeight = fp.screen.height - 30 - Math.floor(Math.random() * 30);
    } else {
        // نفس البصمة بدون تغيير
    }

    return fp;
}

/* ============================================================
   🛡️ سكربت التخفي (نفس السابق، مُحسَّن)
   ============================================================ */

function buildStealthScript(fp) {
    return `
    (function () {
        'use strict';
        const FP = ${JSON.stringify(fp)};
        const navProto = Navigator.prototype;
        try {
            Object.defineProperty(navProto, 'userAgent', { get: () => FP.userAgent, configurable: true });
            Object.defineProperty(navProto, 'appVersion', { get: () => FP.userAgent.replace('Mozilla/', ''), configurable: true });
            Object.defineProperty(navProto, 'platform', { get: () => FP.platform, configurable: true });
            Object.defineProperty(navProto, 'vendor', { get: () => 'Google Inc.', configurable: true });
            Object.defineProperty(navProto, 'language', { get: () => FP.languages[0], configurable: true });
            Object.defineProperty(navProto, 'languages', { get: () => Object.freeze([...FP.languages]), configurable: true });
            Object.defineProperty(navProto, 'hardwareConcurrency', { get: () => FP.cores, configurable: true });
            Object.defineProperty(navProto, 'deviceMemory', { get: () => FP.memory, configurable: true });
            Object.defineProperty(navProto, 'maxTouchPoints', { get: () => 0, configurable: true });
            Object.defineProperty(navProto, 'webdriver', { get: () => undefined, configurable: true });
        } catch (e) {}
        try {
            function mkPlugin(name, filename, desc, mimes) {
                const p = Object.create(Plugin.prototype);
                Object.defineProperty(p, 'name', { value: name });
                Object.defineProperty(p, 'filename', { value: filename });
                Object.defineProperty(p, 'description', { value: desc });
                Object.defineProperty(p, 'length', { value: mimes.length });
                mimes.forEach((m, i) => Object.defineProperty(p, i, { value: m }));
                return p;
            }
            function mkMime(type, suffixes, desc) {
                const m = Object.create(MimeType.prototype);
                Object.defineProperty(m, 'type', { value: type });
                Object.defineProperty(m, 'suffixes', { value: suffixes });
                Object.defineProperty(m, 'description', { value: desc });
                Object.defineProperty(m, 'enabledPlugin', { value: null });
                return m;
            }
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
            Object.defineProperty(navProto, 'plugins', { get: () => arr, configurable: true });
        } catch (e) {}
        try {
            const sp = Screen.prototype;
            Object.defineProperty(sp, 'width', { get: () => FP.screen.width });
            Object.defineProperty(sp, 'height', { get: () => FP.screen.height });
            Object.defineProperty(sp, 'availWidth', { get: () => FP.screen.width });
            Object.defineProperty(sp, 'availHeight', { get: () => FP.screen.availHeight });
            Object.defineProperty(sp, 'colorDepth', { get: () => FP.colorDepth });
            Object.defineProperty(sp, 'pixelDepth', { get: () => FP.colorDepth });
        } catch (e) {}
        try {
            const gp = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (p) {
                if (p === 37445) return FP.gpuVendor;
                if (p === 37446) return FP.gpuRenderer;
                if (p === 7936) return 'WebKit';
                if (p === 7937) return 'WebKit WebGL';
                return gp.call(this, p);
            };
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
        try {
            const origResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
            Intl.DateTimeFormat.prototype.resolvedOptions = function () {
                const r = origResolved.call(this);
                if (r.timeZone) r.timeZone = FP.timezone;
                return r;
            };
            const tzMap = {
                'America/New_York': 300, 'America/Chicago': 360, 'America/Denver': 420,
                'America/Los_Angeles': 480, 'Europe/London': 0, 'Europe/Berlin': -60,
                'Europe/Paris': -60, 'Asia/Riyadh': -180, 'Asia/Dubai': -240,
                'Asia/Tokyo': -540, 'Asia/Kolkata': -330, 'Asia/Singapore': -480,
                'Australia/Sydney': -600, 'America/Sao_Paulo': 180, 'Asia/Seoul': -540,
                'America/Toronto': 300, 'America/Vancouver': 480, 'Asia/Jakarta': -420,
                'Asia/Bangkok': -420, 'Europe/Madrid': -60, 'Europe/Rome': -60,
                'Europe/Warsaw': -60, 'Europe/Amsterdam': -60, 'Africa/Johannesburg': -120,
                'Europe/Istanbul': -180, 'America/Mexico_City': 360,
                'America/Argentina/Buenos_Aires': 180
            };
            Date.prototype.getTimezoneOffset = function () { return tzMap[FP.timezone] !== undefined ? tzMap[FP.timezone] : 0; };
        } catch (e) {}
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const oq = navigator.permissions.query.bind(navigator.permissions);
                navigator.permissions.query = function (d) {
                    if (d && d.name === 'notifications') return Promise.resolve({ state: 'default', onchange: null });
                    return oq(d);
                };
            }
        } catch (e) {}
        try {
            window.chrome = window.chrome || {};
            window.chrome.runtime = window.chrome.runtime || {};
            window.chrome.app = window.chrome.app || { isInstalled: false };
            window.chrome.csi = function () { return { onloadT: Date.now(), startE: Date.now(), pageT: 0, tran: 15 }; };
            window.chrome.loadTimes = function () { return { commitLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000, navigationType: 'Other' }; };
        } catch (e) {}
        try {
            const oRTC = window.RTCPeerConnection;
            window.RTCPeerConnection = function (cfg) {
                if (cfg && cfg.iceServers) cfg.iceServers = [];
                return new oRTC(cfg || { iceServers: [] });
            };
        } catch (e) {}
    })();
    `;
}

/* ============================================================
   🎭 جلسة بوت واحد
   ============================================================ */

async function runOneBot(botId, fingerprint, options = {}) {
    const { proxy = null, proxyGeo = null } = options;
    const log = (m) => console.log(`[BOT-${botId}] ${m}`);
    const tag = `BOT-${botId}`;

    log(`Fingerprint: ${fingerprint.name}`);
    log(`  UA: ${fingerprint.userAgent.substring(0, 70)}...`);
    log(`  TZ: ${fingerprint.timezone} | Locale: ${fingerprint.locale}`);
    log(`  GPU: ${fingerprint.gpuRenderer.substring(0, 60)}...`);
    if (proxy) log(`  Proxy: ${proxy.server} | Geo: ${proxyGeo ? proxyGeo.city + ',' + proxyGeo.country : '?'}`);

    let mouseX = Math.floor(300 + Math.random() * 800);
    let mouseY = Math.floor(200 + Math.random() * 500);

    const pause = (page, a, b) => page.waitForTimeout(Math.floor(a + Math.random() * (b - a)));

    async function moveMouse(page, tx, ty) {
        const sx = mouseX, sy = mouseY;
        const dist = Math.hypot(tx - sx, ty - sy);
        if (dist < 2) return;
        const cX = (sx + tx) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 150);
        const cY = (sy + ty) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 150);
        const steps = Math.max(5, Math.min(35, Math.round(dist / 15) + Math.floor(2 + Math.random() * 6)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cX + t * t * tx;
            const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cY + t * t * ty;
            await page.mouse.move(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2);
            await page.waitForTimeout(Math.floor(4 + Math.random() * 12));
        }
        mouseX = tx; mouseY = ty;
    }

    async function scrollDown(page, dy) {
        const chunks = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, dy / chunks + (Math.random() - 0.5) * 30);
            await page.waitForTimeout(Math.floor(35 + Math.random() * 75));
        }
    }

    async function scrollUp(page, dy) {
        const chunks = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, -dy / chunks + (Math.random() - 0.5) * 20);
            await page.waitForTimeout(Math.floor(45 + Math.random() * 75));
        }
    }

    async function microMoves(page, n) {
        for (let i = 0; i < n; i++) {
            await moveMouse(page, mouseX + (Math.random() - 0.5) * 60, mouseY + (Math.random() - 0.5) * 35);
            await pause(page, 80, 260);
        }
    }

    async function clickAt(page, x, y) {
        await moveMouse(page, x, y);
        if (Math.random() < 0.35) {
            await moveMouse(page, x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 28);
            await pause(page, 100, 300);
            await moveMouse(page, x, y);
        }
        await pause(page, 50, 180);
        await page.mouse.move(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2);
        await pause(page, 30, 90);
        await page.mouse.down();
        await page.waitForTimeout(Math.floor(45 + Math.random() * 60));
        await page.mouse.up();
    }

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
            await pause(page, 300, 700);
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

    async function clickGame(page, href) {
        log(`  -> Clicking: ${href.substring(0, 70)}...`);
        await scrollToHref(page, href);
        const box = await boxOfHref(page, href);
        if (!box || box.w < 30) { log("     ! box not found"); return false; }
        const cx = box.x + box.w * (0.3 + Math.random() * 0.4);
        const cy = box.y + box.h * (0.3 + Math.random() * 0.4);
        if (Math.random() < 0.7) {
            await moveMouse(page, cx, cy);
            await pause(page, 120, 400);
        }
        try {
            await Promise.all([
                page.waitForURL(/\/\d{4}\/\d{2}\//, { timeout: 15000 }).catch(() => {}),
                clickAt(page, cx, cy)
            ]);
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        } catch (e) {
            log(`     ! click error: ${e.message.substring(0, 60)}`);
        }
        if (/\/\d{4}\/\d{2}\//.test(page.url())) {
            log(`     ✓ on post: ${page.url().substring(0, 70)}...`);
            return true;
        }
        log(`     ! not on post`);
        return false;
    }

    async function dwellOnPost(page, minSeconds) {
        log(`     Reading for >=${minSeconds}s...`);
        const startT = Date.now();
        while (Date.now() - startT < minSeconds * 1000) {
            const r = Math.random();
            if (r < 0.4) { await scrollDown(page, 150 + Math.random() * 200); await pause(page, 500, 1200); }
            else if (r < 0.6) { await scrollUp(page, 100 + Math.random() * 120); await pause(page, 400, 900); }
            else { await microMoves(page, 1 + Math.floor(Math.random() * 3)); await pause(page, 400, 1000); }
        }
        log(`     Done (${Math.round((Date.now() - startT) / 1000)}s)`);
    }

    async function exitToGame(page) {
        log("     Looking for external link...");
        const link = await findExternalLink(page);
        if (!link) { log("     ! no external link"); return false; }
        log(`     Found: "${link.text.substring(0, 40)}"`);
        await scrollToHref(page, link.href);
        const box = await boxOfHref(page, link.href);
        if (!box || box.w < 20) return false;
        const cx = box.x + box.w * (0.35 + Math.random() * 0.3);
        const cy = box.y + box.h * (0.35 + Math.random() * 0.3);
        if (Math.random() < 0.6) {
            await moveMouse(page, cx, cy);
            await pause(page, 200, 500);
        }
        try {
            await Promise.all([
                page.waitForURL(u => !u.toString().includes('blogspot.com'), { timeout: 15000 }).catch(() => {}),
                clickAt(page, cx, cy)
            ]);
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        } catch (e) {}
        await pause(page, 1200, 2400);
        if (!page.url().includes('blogspot.com')) {
            log(`     ✓ LEFT -> ${page.url().substring(0, 60)}...`);
            await pause(page, 700, 1400);
            await microMoves(page, 2);
            await scrollDown(page, 150 + Math.random() * 200);
            await pause(page, 1000, 2000);
            return true;
        }
        return false;
    }

    // ===== إطلاق المتصفح =====
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

    const browser = await chromiumExtra.launch({
        headless: true,
        args: launchArgs,
        proxy: proxyConfig
    });

    const context = await browser.newContext({
        viewport: fingerprint.viewport,
        screen: { width: fingerprint.screen.width, height: fingerprint.screen.height },
        userAgent: fingerprint.userAgent,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezone,
        deviceScaleFactor: fingerprint.dsf,
        colorScheme: 'light',
        proxy: proxyConfig
    });

    await context.addInitScript(buildStealthScript(fingerprint));

    const page = await context.newPage();
    page.on("framenavigated", f => {
        if (f === page.mainFrame()) log(`  [NAV] ${f.url().substring(0, 80)}`);
    });

    const start = Date.now();

    try {
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        log(`Loaded homepage`);

        const liveFp = await page.evaluate(() => ({
            wd: navigator.webdriver,
            plugins: navigator.plugins.length,
            cores: navigator.hardwareConcurrency,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            langs: navigator.languages.join(','),
            gpu: (() => {
                try {
                    const c = document.createElement('canvas');
                    const gl = c.getContext('webgl');
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).substring(0, 55);
                } catch (e) { return '?'; }
            })()
        }));
        log(`  CHECK: wd=${liveFp.wd}, plugins=${liveFp.plugins}, cores=${liveFp.cores}, tz=${liveFp.tz}, langs=${liveFp.langs}`);
        log(`  GPU: ${liveFp.gpu}`);

        await microMoves(page, 2);
        await pause(page, 150, 350);
        await scrollDown(page, 200 + Math.random() * 180);
        await pause(page, 250, 550);

        let cards = await findCards(page);
        log(`  Cards: ${cards.length}`);
        if (cards.length === 0) {
            await scrollDown(page, 500);
            await pause(page, 500, 1000);
            cards = await findCards(page);
            log(`  Retry cards: ${cards.length}`);
        }
        if (cards.length === 0) { log("  ABORT"); await browser.close(); return; }

        const r = Math.random();
        const plan = r < 0.6 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
        log(`  Plan: ${plan}`);

        const first = cards[Math.floor(Math.random() * Math.min(cards.length, 6))];
        const ok1 = await clickGame(page, first.href);
        if (!ok1) {
            await pause(page, 800, 1500);
            if (!/\/\d{4}\/\d{2}\//.test(page.url()) && cards.length > 1) {
                await clickGame(page, cards[Math.floor(Math.random() * Math.min(cards.length, 6))].href);
            }
        }

        if (/\/\d{4}\/\d{2}\//.test(page.url())) {
            await dwellOnPost(page, 12 + Math.floor(Math.random() * 5));
            if (plan === 'single-exit' || plan === 'double') {
                const left = await exitToGame(page);
                if (!left && plan === 'single-exit') {
                    try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                    await pause(page, 700, 1400);
                }
            } else {
                log("  Returning home");
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                await pause(page, 700, 1400);
            }
        }

        if (plan === 'double' && page.url().includes('blogspot.com') && !/\/\d{4}\/\d{2}\//.test(page.url())) {
            await pause(page, 500, 1200);
            await scrollDown(page, 150 + Math.random() * 170);
            await pause(page, 400, 900);
            const fresh = await findCards(page);
            if (fresh.length > 1) {
                const second = fresh[Math.floor(Math.random() * Math.min(fresh.length, 6))];
                if (await clickGame(page, second.href)) {
                    await dwellOnPost(page, 12 + Math.floor(Math.random() * 5));
                    const left = await exitToGame(page);
                    if (!left) { try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {} }
                }
            }
        }

        log(`  Session done in ${Math.round((Date.now() - start) / 1000)}s`);

        const dir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({
            path: path.join(dir, `${tag}-${fingerprint.name.replace(/[^a-z0-9]/gi, '_')}.png`),
            fullPage: true
        }).catch(() => {});

        await pause(page, 1500, 2500);

    } catch (error) {
        log(`ERROR: ${error.message}`);
    } finally {
        await browser.close().catch(() => {});
    }
}

/* ============================================================
   ⏰ المُوزِّع الزمني (يمنع الأنماط المنتظمة)
   ============================================================ */

function generateLaunchTimes(count, windowMs) {
    // Poisson-like distribution — يمنع الأنماط المنتظمة
    const times = [];
    const avgGap = windowMs / count;
    let t = 0;
    for (let i = 0; i < count; i++) {
        // توزيع أسي (Poisson process)
        const gap = -Math.log(Math.random()) * avgGap;
        t += gap;
        times.push(Math.min(t, windowMs));
    }
    return times.sort((a, b) => a - b);
}

/* ============================================================
   🎭 الأوضاع
   ============================================================ */

// ===== وضع single (بوت واحد) =====
async function runSingle() {
    const pool = ProxyPool.fromEnv();
    let proxy = null, proxyGeo = null;

    if (!pool.isEmpty()) {
        proxy = pool.pickLeastUsed();
        if (proxy) {
            // فحص سريع لـ IP + الموقع
            const tempBrowser = await chromiumExtra.launch({ headless: true });
            proxyGeo = await detectProxyGeo(tempBrowser, proxy);
            await tempBrowser.close();
            if (proxyGeo) {
                console.log(`\n🌐 Proxy ${proxy.server} → ${proxyGeo.city}, ${proxyGeo.country} (${proxyGeo.ip})`);
            }
        }
    }

    const baseFp = BASE_FINGERPRINTS[Math.floor(Math.random() * BASE_FINGERPRINTS.length)];
    const fp = buildFingerprintForGeo(baseFp, proxyGeo);
    await runOneBot(BOT_ID, fp, { proxy, proxyGeo });
}

// ===== وضع distributed (موزّع زمنياً عبر بروكسيات) =====
async function runDistributed() {
    const windowMs = WINDOW_MINUTES * 60 * 1000;
    const pool = ProxyPool.fromEnv();

    console.log(`\n🌐 DISTRIBUTED MODE`);
    console.log(`   Bots: ${BOT_COUNT}`);
    console.log(`   Window: ${WINDOW_MINUTES} minutes`);
    console.log(`   Max per IP: ${MAX_PER_IP}`);
    console.log(`   Proxies: ${pool.size()}\n`);

    if (pool.isEmpty()) {
        console.log("⚠️  No proxies provided — falling back to spreading over time only.");
        console.log("   Set PROXIES_JSON or PROXIES env, or place proxies.txt\n");
    }

    // خريطة: ip → آخر استخدامات
    const ipUsage = new Map();

    // توليد أوقات الإطلاق (توزيع Poisson)
    const times = generateLaunchTimes(BOT_COUNT, windowMs);

    console.log("Scheduled launch times (minutes from now):");
    times.forEach((t, i) => console.log(`  Bot ${i + 1}: ${(t / 60000).toFixed(1)}m`));

    const startTime = Date.now();
    const usedFpNames = new Set();

    const tasks = times.map((tOffset, i) => new Promise(async (resolve) => {
        const waitMs = tOffset - (Date.now() - startTime);
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

        // اختر بروكسي بأقل استخدام
        let proxy = null;
        let proxyGeo = null;

        if (!pool.isEmpty()) {
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = pool.pickLeastUsed();
                if (!candidate) break;

                // تحقق من حد IP
                const ipKey = candidate.server.split(':')[0];
                const uses = ipUsage.get(ipKey) || 0;
                if (uses >= MAX_PER_IP) {
                    await new Promise(r => setTimeout(r, 15000));
                    continue;
                }

                proxy = candidate;
                ipUsage.set(ipKey, uses + 1);
                break;
            }
        }

        // فحص الموقع الجغرافي للبروكسي
        if (proxy) {
            try {
                const tempBrowser = await chromiumExtra.launch({ headless: true });
                proxyGeo = await detectProxyGeo(tempBrowser, proxy);
                await tempBrowser.close();
                if (proxyGeo) {
                    console.log(`[BOT-${i + 1}] Proxy geo: ${proxyGeo.city}, ${proxyGeo.country} (${proxyGeo.ip})`);
                }
                pool.markUsed(proxy);
            } catch (e) {
                pool.markFailed(proxy);
            }
        }

        // اختر بصمة أساسية متنوعة
        let baseFp;
        let tries = 0;
        do {
            baseFp = BASE_FINGERPRINTS[Math.floor(Math.random() * BASE_FINGERPRINTS.length)];
            tries++;
        } while (usedFpNames.has(baseFp.name) && tries < 5);
        usedFpNames.add(baseFp.name);

        const fp = buildFingerprintForGeo(baseFp, proxyGeo);
        await runOneBot(i + 1, fp, { proxy, proxyGeo });

        resolve();
    }));

    await Promise.all(tasks);
}

// ===== وضع matrix (GitHub Actions Matrix = runner منفصل لكل بوت) =====
async function runMatrix() {
    // في هذا الوضع، كل runner يشغّل بوت واحد فقط
    // لكن البصمة تعتمد على BOT_ID لضمان التنوع
    const pool = ProxyPool.fromEnv();
    let proxy = null, proxyGeo = null;

    if (!pool.isEmpty()) {
        proxy = pool.pickLeastUsed();
        if (proxy) {
            const tempBrowser = await chromiumExtra.launch({ headless: true });
            proxyGeo = await detectProxyGeo(tempBrowser, proxy);
            await tempBrowser.close();
        }
    }

    // اختر بصمة مبنية على BOT_ID + العشوائية
    const botNum = parseInt(BOT_ID, 10) || 1;
    const baseIdx = (botNum - 1) % BASE_FINGERPRINTS.length;
    const baseFp = BASE_FINGERPRINTS[baseIdx];

    const fp = buildFingerprintForGeo(baseFp, proxyGeo);

    console.log(`\n🌐 MATRIX MODE — BOT_ID: ${BOT_ID}`);
    if (proxyGeo) console.log(`   Proxy → ${proxyGeo.city}, ${proxyGeo.country} (${proxyGeo.ip})`);

    await runOneBot(BOT_ID, fp, { proxy, proxyGeo });
}

/* ============================================================
   🚀 main
   ============================================================ */

async function main() {
    console.log("=================================");
    console.log("BLOGGER BOT DETECTION LAB — ANTI-CLUSTER");
    console.log("=================================");
    console.log("Target:", TARGET_URL);
    console.log("Mode:", BOT_MODE);
    console.log("Bot ID:", BOT_ID);
    console.log("Count:", BOT_COUNT);

    const start = Date.now();

    try {
        if (BOT_MODE === "distributed") {
            await runDistributed();
        } else if (BOT_MODE === "matrix") {
            await runMatrix();
        } else {
            await runSingle();
        }
    } catch (e) {
        console.error("MAIN ERROR:", e);
        process.exitCode = 1;
    }

    console.log(`\n✅ DONE in ${Math.round((Date.now() - start) / 1000)}s`);
}

main();
