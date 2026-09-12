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

/* ⚠️ مهم: نستخدم نفس البصمة في كل مكان */
const FAKE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* ============================================================
   أدوات عامة
   ============================================================ */

let mouseX = 700, mouseY = 400;

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function log(m) { console.log(m); }
async function pause(page, a, b) { await page.waitForTimeout(randInt(a, b)); }

function weightedPick(items) {
    if (!items.length) return null;
    const w = items.map(it => 1 / (1 + Math.max(0, it.y) / 600));
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= w[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
}

/* ============================================================
   الماوس
   ============================================================ */

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

/* ============================================================
   بطاقات الألعاب — 3 طبقات
   ============================================================ */

async function findCards_V1(page) {
    return await page.evaluate(() => {
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
    });
}

async function findCards_V2(page) {
    return await page.evaluate(() => {
        const scope = document.querySelector('.post-body') || document.querySelector('#main') ||
                      document.querySelector('.main') || document.querySelector('#content') || document.body;
        const out = [];
        scope.querySelectorAll('a[href]').forEach(a => {
            const href = a.href || '';
            if (!href.includes('blogspot.com')) return;
            if (!/\/\d{4}\/\d{2}\//.test(href)) return;
            const r = a.getBoundingClientRect();
            if (r.width < 80 || r.height < 80) return;
            out.push({ href, x: r.x, y: r.y, w: r.width, h: r.height });
        });
        const seen = new Set();
        return out.filter(o => { if (seen.has(o.href)) return false; seen.add(o.href); return true; });
    });
}

async function findCards_V3(page) {
    return await page.evaluate(() => {
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
    });
}

async function findAllCards(page) {
    let c = await findCards_V1(page);
    log(`     V1: ${c.length}`);
    if (c.length >= 3) return c;
    c = await findCards_V2(page);
    log(`     V2: ${c.length}`);
    if (c.length >= 3) return c;
    c = await findCards_V3(page);
    log(`     V3: ${c.length}`);
    return c;
}

async function scrollToHref(page, href) {
    try {
        await page.evaluate((h) => {
            for (const l of document.querySelectorAll('a[href]')) {
                if (l.href === h) { l.scrollIntoView({ behavior: 'instant', block: 'center' }); return; }
            }
        }, href);
        await pause(page, 300, 700);
    } catch (e) {
        log(`     ! scrollToHref skipped: ${e.message.substring(0, 60)}`);
    }
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
    } catch (e) {
        return null;
    }
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
    } catch (e) {
        return null;
    }
}

/* ============================================================
   الإجراءات
   ============================================================ */

async function clickGame(page, href) {
    log(`  -> Clicking game: ${href.substring(0, 70)}...`);
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
        // ننتظر التنقل + النقر معاً
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
    log(`     ! not on post (url: ${page.url().substring(0, 70)})`);
    return false;
}

/* ⚡ قراءة المقال لمدة لا تقل عن minSeconds — ينتظر الكاشف أن يرسل بنفسه */
async function dwellOnPost(page, minSeconds) {
    log(`     Reading post for >=${minSeconds}s...`);
    const startTime = Date.now();
    const targetMs = minSeconds * 1000;

    while (Date.now() - startTime < targetMs) {
        const action = Math.random();
        if (action < 0.4) {
            await scrollDown(page, randInt(150, 350));
            await pause(page, 500, 1200);
        } else if (action < 0.6) {
            await scrollUp(page, randInt(100, 220));
            await pause(page, 400, 900);
        } else {
            await microMoves(page, randInt(1, 3));
            await pause(page, 400, 1000);
        }
    }
    log(`     Reading done (${Math.round((Date.now() - startTime) / 1000)}s)`);
}

async function exitToGame(page) {
    log("     Looking for external game link...");
    const link = await findExternalLink(page);
    if (!link) { log("     ! no external link"); return false; }
    log(`     Found: "${link.text}" -> ${link.href.substring(0, 55)}...`);

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
    log(`     ! still on blog`);
    return false;
}

/* ============================================================
   الجلسة
   ============================================================ */

async function runSession(page) {
    log("\n===== HUMAN SESSION =====");

    // حركة أولية
    await microMoves(page, 2);
    await pause(page, 150, 350);

    // مسح سريع
    await scrollDown(page, randInt(200, 380));
    await pause(page, 250, 550);
    await microMoves(page, 1);

    // إيجاد البطاقات
    log("  Searching for game cards...");
    let cards = await findAllCards(page);
    log(`  Total: ${cards.length}`);

    if (cards.length === 0) {
        log("  Retrying after scroll...");
        await scrollDown(page, 500);
        await pause(page, 500, 1000);
        cards = await findAllCards(page);
        log(`  Retry total: ${cards.length}`);
        if (cards.length === 0) { log("  ABORT"); return; }
    }

    const r = Math.random();
    const plan = r < 0.6 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
    log(`  Plan: ${plan}`);

    // النقرة الأولى
    const first = weightedPick(cards);
    const ok1 = await clickGame(page, first.href);

    if (!ok1) {
        await pause(page, 800, 1500);
        if (/\/\d{4}\/\d{2}\//.test(page.url())) {
            log("  (Already navigated)");
        } else {
            const alt = weightedPick(cards.filter(c => c.href !== first.href));
            if (alt) await clickGame(page, alt.href);
        }
    }

    // على صفحة المقال — اقرأ >= 13 ثانية ثم اخرج
    if (/\/\d{4}\/\d{2}\//.test(page.url())) {
        await dwellOnPost(page, 13);

        if (plan === 'single-exit' || plan === 'double') {
            const left = await exitToGame(page);
            if (!left && plan === 'single-exit') {
                log("  Fallback to return");
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                await pause(page, 700, 1400);
            }
        } else {
            log("  Returning to home");
            try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
            await pause(page, 700, 1400);
        }
    }

    // لعبة ثانية (نموذج المستكشف)
    if (plan === 'double' && page.url().includes('blogspot.com') && !/\/\d{4}\/\d{2}\//.test(page.url())) {
        await pause(page, 500, 1200);
        await scrollDown(page, randInt(150, 320));
        await pause(page, 400, 900);
        const fresh = await findAllCards(page);
        const remaining = fresh.filter(c => c.href !== first.href);
        if (remaining.length) {
            const second = weightedPick(remaining);
            const ok2 = await clickGame(page, second.href);
            if (ok2) {
                await dwellOnPost(page, 13);
                const left = await exitToGame(page);
                if (!left) { try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {} }
            }
        }
    }

    log("===== SESSION END =====\n");
}

/* ============================================================
   main
   ============================================================ */

async function main() {
    console.log("=================================");
    console.log("BLOGGER BOT DETECTION LAB");
    console.log("=================================");
    console.log("Target:", TARGET_URL);

    const browser = await chromiumExtra.launch({
        headless: true,
        args: [
            `--user-agent=${FAKE_UA}`,
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--no-first-run', '--no-zygote'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080 },
        userAgent: FAKE_UA,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        deviceScaleFactor: 1
    });

    /* 🔒 إصلاح User-Agent بشكل قاطع — يُنفَّذ قبل أي سكربت في الصفحة */
    await context.addInitScript(({ ua }) => {
        try {
            Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
            Object.defineProperty(navigator, 'appVersion', { get: () => ua.replace('Mozilla/', ''), configurable: true });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
            Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.', configurable: true });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
            // plugins مصطنعة
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin' },
                    { name: 'Chrome PDF Viewer' },
                    { name: 'Native Client' }
                ],
                configurable: true
            });
            Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true });
        } catch (e) {}
    }, { ua: FAKE_UA });

    const page = await context.newPage();
    const requests = [], responses = [];
    page.on("request", r => requests.push(r.url()));
    page.on("response", r => responses.push({ s: r.status(), u: r.url() }));

    page.on("framenavigated", f => {
        if (f === page.mainFrame()) log(`  [NAV] ${f.url().substring(0, 90)}`);
    });

    const start = Date.now();

    try {
        const response = await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        console.log("\n--- NAVIGATION ---");
        console.log("HTTP:", response ? response.status() : "NONE");
        console.log("URL:", page.url());
        console.log("Title:", await page.title());
        console.log("Elapsed:", Date.now() - start, "ms");

        // تحقق سريع من UA
        const liveUA = await page.evaluate(() => navigator.userAgent);
        console.log("Live UA:", liveUA);

        await runSession(page);

        console.log("\n--- FINAL ---");
        console.log("Final URL:", page.url());
        console.log("Requests:", requests.length, "| Responses:", responses.length);
        console.log("Elapsed ms:", Date.now() - start);

        const dir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, "blogger-test.png"), fullPage: true });
        fs.writeFileSync(path.join(dir, "blogger-page.html"), await page.content(), "utf8");
        console.log("Saved screenshot + HTML.");

        await page.waitForTimeout(2500);

    } catch (error) {
        console.error("TEST ERROR:", error);
        try {
            const dir = path.join(process.cwd(), "screenshots");
            fs.mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: path.join(dir, "error.png"), fullPage: true });
        } catch (e) {}
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main();
