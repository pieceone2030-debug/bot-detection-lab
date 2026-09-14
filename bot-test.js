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
const BOT_COUNT = parseInt(process.env.BOT_COUNT || "3", 10);

/* ============================================================
   🎨 مخزون بصمات واقعية (كل بوت يأخذ واحدة)
   ============================================================ */

const FINGERPRINTS = [
    {
        name: "Win-Intel-UHD630",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080, availHeight: 1040 },
        windowOuter: { width: 1920, height: 1165 },
        locale: "en-US",
        languages: ["en-US", "en"],
        timezone: "America/New_York",
        gpuVendor: "Google Inc. (Intel)",
        gpuRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 8,
        memory: 8,
        colorDepth: 24,
        dsf: 1
    },
    {
        name: "Win-NVIDIA-RTX3060",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1536, height: 864 },
        screen: { width: 1536, height: 864, availHeight: 824 },
        windowOuter: { width: 1536, height: 949 },
        locale: "en-US",
        languages: ["en-US", "en"],
        timezone: "America/Chicago",
        gpuVendor: "Google Inc. (NVIDIA)",
        gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 12,
        memory: 16,
        colorDepth: 24,
        dsf: 1
    },
    {
        name: "Mac-M1",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "MacIntel",
        viewport: { width: 1512, height: 945 },
        screen: { width: 1512, height: 945, availHeight: 898 },
        windowOuter: { width: 1512, height: 1006 },
        locale: "en-US",
        languages: ["en-US", "en"],
        timezone: "America/Los_Angeles",
        gpuVendor: "Google Inc. (Apple)",
        gpuRenderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)",
        cores: 8,
        memory: 8,
        colorDepth: 30,
        dsf: 2
    },
    {
        name: "Win-Intel-Iris-Xe",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 2560, height: 1440 },
        screen: { width: 2560, height: 1440, availHeight: 1400 },
        windowOuter: { width: 2560, height: 1525 },
        locale: "en-GB",
        languages: ["en-GB", "en"],
        timezone: "Europe/London",
        gpuVendor: "Google Inc. (Intel)",
        gpuRenderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 16,
        memory: 32,
        colorDepth: 24,
        dsf: 1
    },
    {
        name: "Win-AMD-RX6600",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "Win32",
        viewport: { width: 1366, height: 768 },
        screen: { width: 1366, height: 768, availHeight: 728 },
        windowOuter: { width: 1366, height: 853 },
        locale: "en-US",
        languages: ["en-US", "en"],
        timezone: "America/Denver",
        gpuVendor: "Google Inc. (AMD)",
        gpuRenderer: "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        cores: 6,
        memory: 8,
        colorDepth: 24,
        dsf: 1
    }
];

/* ============================================================
   أدوات عامة
   ============================================================ */

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeLogger(id) {
    return (m) => console.log(`[BOT-${id}] ${m}`);
}

/* ============================================================
   🧬 سكربت التخفي — يُحقن قبل أي سكربت آخر
   ============================================================ */

function buildStealthScript(fp) {
    return `
    (function () {
        'use strict';
        const FP = ${JSON.stringify(fp)};

        // ===== 1. navigator basics =====
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

        // ===== 2. Plugins (كائنات حقيقية) =====
        try {
            function makePlugin(name, filename, desc, mimes) {
                const plugin = Object.create(Plugin.prototype);
                Object.defineProperty(plugin, 'name', { value: name });
                Object.defineProperty(plugin, 'filename', { value: filename });
                Object.defineProperty(plugin, 'description', { value: desc });
                Object.defineProperty(plugin, 'length', { value: mimes.length });
                mimes.forEach((m, i) => {
                    Object.defineProperty(plugin, i, { value: m });
                    Object.defineProperty(plugin, m.type, { value: m });
                });
                return plugin;
            }
            function makeMime(type, suffixes, desc, pluginName) {
                const m = Object.create(MimeType.prototype);
                Object.defineProperty(m, 'type', { value: type });
                Object.defineProperty(m, 'suffixes', { value: suffixes });
                Object.defineProperty(m, 'description', { value: desc });
                Object.defineProperty(m, 'enabledPlugin', { value: null });
                return m;
            }
            const pdf1 = makeMime('application/pdf', 'pdf', 'Portable Document Format', 'Chrome PDF Plugin');
            const pdf2 = makeMime('text/pdf', 'pdf', 'Portable Document Format', 'Chrome PDF Viewer');
            const nacl1 = makeMime('application/x-nacl', '', 'Native Client Executable', 'Native Client');
            const nacl2 = makeMime('application/x-pnacl', '', 'Portable Native Client Executable', 'Native Client');
            const plugins = [
                makePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [pdf1, pdf2]),
                makePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [pdf1, pdf2]),
                makePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [pdf1, pdf2]),
                makePlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [pdf1, pdf2]),
                makePlugin('WebKit built-in PDF', 'internal-pdf-viewer', 'Portable Document Format', [pdf1, pdf2]),
                makePlugin('Native Client', 'internal-nacl-plugin', '', [nacl1, nacl2])
            ];
            const pluginArray = Object.create(PluginArray.prototype);
            plugins.forEach((p, i) => Object.defineProperty(pluginArray, i, { value: p }));
            Object.defineProperty(pluginArray, 'length', { value: plugins.length });
            Object.defineProperty(pluginArray, 'item', { value: i => plugins[i] || null });
            Object.defineProperty(pluginArray, 'namedItem', { value: n => plugins.find(p => p.name === n) || null });
            Object.defineProperty(navProto, 'plugins', { get: () => pluginArray, configurable: true });
        } catch (e) {}

        // ===== 3. Screen =====
        try {
            const screenProto = Screen.prototype;
            Object.defineProperty(screenProto, 'width', { get: () => FP.screen.width });
            Object.defineProperty(screenProto, 'height', { get: () => FP.screen.height });
            Object.defineProperty(screenProto, 'availWidth', { get: () => FP.screen.width });
            Object.defineProperty(screenProto, 'availHeight', { get: () => FP.screen.availHeight });
            Object.defineProperty(screenProto, 'colorDepth', { get: () => FP.colorDepth });
            Object.defineProperty(screenProto, 'pixelDepth', { get: () => FP.colorDepth });
        } catch (e) {}

        // ===== 4. WebGL =====
        try {
            const getParam = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (p) {
                if (p === 37445) return FP.gpuVendor;
                if (p === 37446) return FP.gpuRenderer;
                if (p === 7936) return 'WebKit';
                if (p === 7937) return 'WebKit WebGL';
                return getParam.call(this, p);
            };
            if (window.WebGL2RenderingContext) {
                const getParam2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function (p) {
                    if (p === 37445) return FP.gpuVendor;
                    if (p === 37446) return FP.gpuRenderer;
                    if (p === 7936) return 'WebKit';
                    if (p === 7937) return 'WebKit WebGL';
                    return getParam2.call(this, p);
                };
            }
        } catch (e) {}

        // ===== 5. Timezone =====
        try {
            const origResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
            Intl.DateTimeFormat.prototype.resolvedOptions = function () {
                const r = origResolved.call(this);
                if (r.timeZone) r.timeZone = FP.timezone;
                return r;
            };
            const DateOrig = Date.prototype.getTimezoneOffset;
            // فرق بين UTC والمنطقة المطلوبة (بالدقائق)
            const tz = FP.timezone;
            const winterOffset = {
                'America/New_York': 300, 'America/Chicago': 360,
                'America/Denver': 420, 'America/Los_Angeles': 480,
                'Europe/London': 0, 'Asia/Riyadh': -180
            }[tz] || 0;
            Date.prototype.getTimezoneOffset = function () { return winterOffset; };
        } catch (e) {}

        // ===== 6. Permissions / Notification =====
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const origQuery = navigator.permissions.query.bind(navigator.permissions);
                navigator.permissions.query = function (d) {
                    if (d && d.name === 'notifications') {
                        return Promise.resolve({ state: Notification.permission, onchange: null });
                    }
                    return origQuery(d);
                };
            }
        } catch (e) {}

        // ===== 7. chrome runtime =====
        try {
            window.chrome = window.chrome || {};
            window.chrome.runtime = window.chrome.runtime || {};
            window.chrome.app = window.chrome.app || { isInstalled: false };
            window.chrome.csi = window.chrome.csi || function () {
                return { onloadT: Date.now(), startE: Date.now(), pageT: 0, tran: 15 };
            };
            window.chrome.loadTimes = window.chrome.loadTimes || function () {
                return { commitLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000, navigationType: 'Other' };
            };
        } catch (e) {}

        // ===== 8. WebRTC leak prevention =====
        try {
            const origRTC = window.RTCPeerConnection;
            window.RTCPeerConnection = function (cfg) {
                if (cfg && cfg.iceServers) cfg.iceServers = [];
                return new origRTC(cfg || { iceServers: [] });
            };
        } catch (e) {}

        // ===== 9. Battery =====
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

/* ============================================================
   🎭 جلسة بوت واحد
   ============================================================ */

async function runOneBot(botId, fp) {
    const log = makeLogger(botId);
    log(`Starting with fingerprint: ${fp.name}`);
    log(`  UA: ${fp.userAgent.substring(0, 80)}...`);
    log(`  GPU: ${fp.gpuRenderer.substring(0, 70)}...`);
    log(`  Screen: ${fp.screen.width}x${fp.screen.height} @${fp.dsf}x, TZ: ${fp.timezone}`);

    let mouseX = randInt(400, 900);
    let mouseY = randInt(300, 700);

    async function pause(page, a, b) { await page.waitForTimeout(randInt(a, b)); }

    async function moveMouse(page, tx, ty) {
        const sx = mouseX, sy = mouseY;
        const dist = Math.hypot(tx - sx, ty - sy);
        if (dist < 2) return;
        const cX = (sx + tx) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 150);
        const cY = (sy + ty) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 150);
        const steps = Math.max(5, Math.min(35, Math.round(dist / 15) + randInt(2, 6)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cX + t * t * tx;
            const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cY + t * t * ty;
            await page.mouse.move(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2);
            await page.waitForTimeout(rand(4, 16));
        }
        mouseX = tx; mouseY = ty;
    }

    async function scrollDown(page, dy) {
        const chunks = randInt(3, 6);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, dy / chunks + rand(-15, 15));
            await page.waitForTimeout(rand(35, 110));
        }
    }

    async function scrollUp(page, dy) {
        const chunks = randInt(2, 4);
        for (let i = 0; i < chunks; i++) {
            await page.mouse.wheel(0, -dy / chunks + rand(-10, 10));
            await page.waitForTimeout(rand(45, 120));
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
        await page.waitForTimeout(rand(45, 105));
        await page.mouse.up();
    }

    // ---- استخراج البطاقات ----
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
            const seen = new Set();
            return out.filter(o => { if (seen.has(o.href)) return false; seen.add(o.href); return true; });
        }).catch(() => []);
        if (cards.length >= 3) return cards;

        cards = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href || '';
                if (!href.includes('blogspot.com')) return;
                if (!/\/\d{4}\//.test(href)) return;
                const r = a.getBoundingClientRect();
                if (r.width < 80 || r.height < 80) return;
                if (r.width > 900) return;
                out.push({ href, x: r.x, y: r.y, w: r.width, h: r.height });
            });
            const seen = new Set();
            return out.filter(o => { if (seen.has(o.href)) return false; seen.add(o.href); return true; });
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
        const cx = box.x + box.w * rand(0.3, 0.7);
        const cy = box.y + box.h * rand(0.3, 0.7);
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
            if (r < 0.4) {
                await scrollDown(page, randInt(150, 350));
                await pause(page, 500, 1200);
            } else if (r < 0.6) {
                await scrollUp(page, randInt(100, 220));
                await pause(page, 400, 900);
            } else {
                await microMoves(page, randInt(1, 3));
                await pause(page, 400, 1000);
            }
        }
        log(`     Done (${Math.round((Date.now() - startT) / 1000)}s)`);
    }

    async function exitToGame(page) {
        log("     Looking for external link...");
        const link = await findExternalLink(page);
        if (!link) { log("     ! no external link"); return false; }
        log(`     Found: "${link.text}"`);
        await scrollToHref(page, link.href);
        const box = await boxOfHref(page, link.href);
        if (!box || box.w < 20) return false;
        const cx = box.x + box.w * rand(0.35, 0.65);
        const cy = box.y + box.h * rand(0.35, 0.65);
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
            await scrollDown(page, randInt(150, 350));
            await pause(page, 1000, 2000);
            return true;
        }
        return false;
    }

    // ---- إطلاق المتصفح ----
    const browser = await chromiumExtra.launch({
        headless: true,
        args: [
            `--user-agent=${fp.userAgent}`,
            `--lang=${fp.languages[0]}`,
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--no-first-run', '--no-zygote'
        ]
    });

    const context = await browser.newContext({
        viewport: fp.viewport,
        screen: { width: fp.screen.width, height: fp.screen.height },
        userAgent: fp.userAgent,
        locale: fp.locale,
        timezoneId: fp.timezone,
        deviceScaleFactor: fp.dsf,
        colorScheme: 'light'
    });

    await context.addInitScript(buildStealthScript(fp));

    const page = await context.newPage();

    page.on("framenavigated", f => {
        if (f === page.mainFrame()) log(`  [NAV] ${f.url().substring(0, 80)}`);
    });

    const start = Date.now();

    try {
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        log(`Loaded homepage`);

        // تأكيد البصمة
        const liveFp = await page.evaluate(() => ({
            ua: navigator.userAgent.substring(0, 60),
            wd: navigator.webdriver,
            plugins: navigator.plugins.length,
            cores: navigator.hardwareConcurrency,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            gpu: (() => {
                try {
                    const c = document.createElement('canvas');
                    const gl = c.getContext('webgl');
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).substring(0, 60);
                } catch (e) { return '?'; }
            })()
        }));
        log(`  FP check: webdriver=${liveFp.wd}, plugins=${liveFp.plugins}, cores=${liveFp.cores}, tz=${liveFp.tz}`);
        log(`  GPU: ${liveFp.gpu}`);

        // بدء الجلسة
        await microMoves(page, 2);
        await pause(page, 150, 350);
        await scrollDown(page, randInt(200, 380));
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

        // خطة
        const r = Math.random();
        const plan = r < 0.6 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
        log(`  Plan: ${plan}`);

        const first = cards[randInt(0, Math.min(cards.length - 1, 5))];
        const ok1 = await clickGame(page, first.href);
        if (!ok1) {
            await pause(page, 800, 1500);
            if (!/\/\d{4}\/\d{2}\//.test(page.url()) && cards.length > 1) {
                await clickGame(page, cards[randInt(0, Math.min(cards.length - 1, 5))].href);
            }
        }

        if (/\/\d{4}\/\d{2}\//.test(page.url())) {
            await dwellOnPost(page, randInt(12, 16));
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
            await scrollDown(page, randInt(150, 320));
            await pause(page, 400, 900);
            const fresh = await findCards(page);
            if (fresh.length > 1) {
                const second = fresh[randInt(0, Math.min(fresh.length - 1, 5))];
                if (await clickGame(page, second.href)) {
                    await dwellOnPost(page, randInt(12, 16));
                    const left = await exitToGame(page);
                    if (!left) { try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {} }
                }
            }
        }

        log(`  Session done in ${Math.round((Date.now() - start) / 1000)}s`);

        // لقطة شاشة
        const dir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({
            path: path.join(dir, `bot-${botId}-${fp.name}.png`),
            fullPage: true
        }).catch(() => {});

        // انتظر قليلاً لكي يرسل الكاشف pagehide
        await pause(page, 1500, 2500);

    } catch (error) {
        log(`ERROR: ${error.message}`);
    } finally {
        await browser.close().catch(() => {});
    }
}

/* ============================================================
   🎭 منسّق البوتات المتعددة
   ============================================================ */

function pickFingerprints(count) {
    const pool = [...FINGERPRINTS];
    const picked = [];
    while (picked.length < count && pool.length > 0) {
        const i = randInt(0, pool.length - 1);
        picked.push(pool.splice(i, 1)[0]);
    }
    // إذا احتجنا أكثر من 5، كرر مع تعديل طفيف في UA
    while (picked.length < count) {
        const base = FINGERPRINTS[randInt(0, FINGERPRINTS.length - 1)];
        const cloned = JSON.parse(JSON.stringify(base));
        const minor = randInt(120, 133);
        cloned.userAgent = cloned.userAgent.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${minor}.0.0.0`);
        cloned.name = `${base.name}-v${minor}`;
        picked.push(cloned);
    }
    return picked;
}

async function runParallel(count) {
    console.log(`\n🎭 MODE: PARALLEL — ${count} bots simultaneously\n`);
    const fps = pickFingerprints(count);
    await Promise.all(fps.map((fp, i) => runOneBot(i + 1, fp)));
}

async function runSequential(count) {
    console.log(`\n🎭 MODE: SEQUENTIAL — ${count} bots one after another\n`);
    const fps = pickFingerprints(count);
    for (let i = 0; i < fps.length; i++) {
        await runOneBot(i + 1, fps[i]);
        if (i < fps.length - 1) {
            const gap = randInt(4000, 12000);
            console.log(`\n⏸  Waiting ${Math.round(gap / 1000)}s before next bot...\n`);
            await sleep(gap);
        }
    }
}

async function runMixed(count) {
    console.log(`\n🎭 MODE: MIXED — ${count} bots in random groups\n`);
    const fps = pickFingerprints(count);

    // تقسيم إلى مجموعات (2-3 لكل مجموعة)
    const groups = [];
    let remaining = [...fps];
    while (remaining.length > 0) {
        const groupSize = Math.min(randInt(2, 3), remaining.length);
        groups.push(remaining.splice(0, groupSize));
    }

    console.log(`  → ${groups.length} groups: ${groups.map(g => g.length).join(" + ")}\n`);

    let botId = 1;
    for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        console.log(`\n🎬 Group ${gi + 1}/${groups.length}: ${group.length} bots in parallel`);
        await Promise.all(group.map(fp => runOneBot(botId++, fp)));

        if (gi < groups.length - 1) {
            const gap = randInt(5000, 15000);
            console.log(`\n⏸  Group gap: ${Math.round(gap / 1000)}s\n`);
            await sleep(gap);
        }
    }
}

/* ============================================================
   🚀 main
   ============================================================ */

async function main() {
    console.log("=================================");
    console.log("BLOGGER BOT DETECTION LAB — MULTI");
    console.log("=================================");
    console.log("Target:", TARGET_URL);
    console.log("Mode:", BOT_MODE);
    console.log("Count:", BOT_COUNT);

    const startAll = Date.now();

    try {
        if (BOT_MODE === "parallel") {
            await runParallel(BOT_COUNT);
        } else if (BOT_MODE === "sequential") {
            await runSequential(BOT_COUNT);
        } else if (BOT_MODE === "mixed") {
            await runMixed(BOT_COUNT);
        } else {
            // single
            const fp = FINGERPRINTS[randInt(0, FINGERPRINTS.length - 1)];
            await runOneBot(1, fp);
        }
    } catch (e) {
        console.error("MAIN ERROR:", e);
        process.exitCode = 1;
    }

    console.log(`\n✅ ALL DONE in ${Math.round((Date.now() - startAll) / 1000)}s`);
}

main();
