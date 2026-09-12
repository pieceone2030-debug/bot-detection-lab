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

/* ============================================================
   أدوات عامة
   ============================================================ */

let mouseX = 700;
let mouseY = 400;

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
   استخراج عناصر الألعاب — 3 طبقات احتياطية
   ============================================================ */

/* الطبقة 1: صور داخل <a> برابط /YYYY/MM/ */
async function findGameCards_V1(page) {
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
        return out.filter(o => {
            if (seen.has(o.href)) return false;
            seen.add(o.href);
            return true;
        });
    });
}

/* الطبقة 2: أي <a> داخل منطقة المحتوى برابط /YYYY/MM/ */
async function findGameCards_V2(page) {
    return await page.evaluate(() => {
        const scope =
            document.querySelector('.post-body') ||
            document.querySelector('#main') ||
            document.querySelector('.main') ||
            document.querySelector('#content') ||
            document.body;
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
        return out.filter(o => {
            if (seen.has(o.href)) return false;
            seen.add(o.href);
            return true;
        });
    });
}

/* الطبقة 3: أي <a> برابط blogspot فيه أرقام سنة (نمط أوسع) */
async function findGameCards_V3(page) {
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
        return out.filter(o => {
            if (seen.has(o.href)) return false;
            seen.add(o.href);
            return true;
        });
    });
}

async function findAllGameCards(page) {
    let cards = await findGameCards_V1(page);
    log(`     V1 (img inside /YYYY/MM/ link): ${cards.length}`);
    if (cards.length >= 3) return cards;

    cards = await findGameCards_V2(page);
    log(`     V2 (any /YYYY/MM/ link in content): ${cards.length}`);
    if (cards.length >= 3) return cards;

    cards = await findGameCards_V3(page);
    log(`     V3 (any /YYYY/ link on page): ${cards.length}`);
    return cards;
}

async function scrollToHref(page, href) {
    await page.evaluate((h) => {
        for (const l of document.querySelectorAll('a[href]')) {
            if (l.href === h) {
                l.scrollIntoView({ behavior: 'instant', block: 'center' });
                return;
            }
        }
    }, href);
    await pause(page, 300, 700);
}

async function boxOfHref(page, href) {
    return await page.evaluate((h) => {
        for (const l of document.querySelectorAll('a[href]')) {
            if (l.href === h) {
                const r = l.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
            }
        }
        return null;
    }, href);
}

/* الرابط الخارجي لموقع اللعبة */
async function findExternalLink(page) {
    return await page.evaluate(() => {
        const EXCL = ['blogspot.com','blogger.com','google.com','googlesyndication',
            'doubleclick','googleadservices','google-analytics','gstatic',
            'googleusercontent','facebook.com','fb.com','twitter.com','x.com',
            'instagram.com','youtube.com','youtu.be','whatsapp','telegram',
            't.me','pinterest','tiktok','linkedin','reddit.com','blogger.googleusercontent'];
        const bad = h => EXCL.some(d => h.toLowerCase().includes(d));
        const scope = document.querySelector('.post-body')
            || document.querySelector('.entry-content')
            || document.querySelector('article')
            || document.body;
        const candidates = [];
        for (const a of scope.querySelectorAll('a[href^="http"]')) {
            const href = a.href;
            if (bad(href)) continue;
            const text = (a.textContent || '').trim();
            if (text.length < 3) continue;
            const s = getComputedStyle(a);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const r = a.getBoundingClientRect();
            if (r.width < 30 || r.height < 12) continue;
            candidates.push({ href, text, x: r.x, y: r.y, w: r.width, h: r.height, area: r.width * r.height });
        }
        // الأكبر مساحةً هو الأرجح أن يكون زر "العب الآن"
        candidates.sort((a, b) => b.area - a.area);
        return candidates[0] || null;
    });
}

/* ============================================================
   السلوك
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
    await clickAt(page, cx, cy);
    try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch (e) {}
    if (/\/\d{4}\/\d{2}\//.test(page.url())) {
        log(`     ✓ on post page: ${page.url().substring(0, 70)}...`);
        return true;
    }
    log(`     ! not on post page (url: ${page.url().substring(0, 70)})`);
    return false;
}

async function readPost(page) {
    log("     Reading post...");
    const rounds = randInt(2, 3);
    for (let i = 0; i < rounds; i++) {
        await scrollDown(page, randInt(150, 380));
        await pause(page, 400, 1200);
        await microMoves(page, randInt(1, 2));
    }
}

async function exitToGame(page) {
    log("     Looking for external game link...");
    const link = await findExternalLink(page);
    if (!link) { log("     ! no external link found"); return false; }
    log(`     Found: "${link.text}" -> ${link.href.substring(0, 60)}...`);

    await scrollToHref(page, link.href);
    const box = await boxOfHref(page, link.href);
    if (!box || box.w < 20) return false;

    const cx = box.x + box.w * rand(0.35, 0.65);
    const cy = box.y + box.h * rand(0.35, 0.65);
    if (Math.random() < 0.6) {
        await moveMouse(page, cx, cy);
        await pause(page, 200, 500);
    }
    await clickAt(page, cx, cy);

    try { await page.waitForLoadState('domcontentloaded', { timeout: 14000 }); } catch (e) {}
    await pause(page, 1200, 2400);

    if (!page.url().includes('blogspot.com')) {
        log(`     ✓ LEFT BLOG -> ${page.url().substring(0, 60)}...`);
        await pause(page, 700, 1400);
        await microMoves(page, 2);
        await scrollDown(page, randInt(150, 350));
        await pause(page, 700, 1400);
        return true;
    }
    log(`     ! still on blog: ${page.url().substring(0, 70)}`);
    return false;
}

/* ============================================================
   الجلسة البشرية
   ============================================================ */

async function runSession(page) {
    log("\n===== HUMAN SESSION =====");

    // 1) حركة أولية فورية — قبل أي شيء
    log("  Initial mouse activity...");
    await microMoves(page, 2);
    await pause(page, 150, 350);

    // 2) مسح سريع للرئيسية (لا يستهلك وقتاً طويلاً)
    log("  Quick homepage scan...");
    await scrollDown(page, randInt(200, 380));
    await pause(page, 250, 550);
    await microMoves(page, 1);

    // 3) ابحث عن بطاقات الألعاب — 3 طبقات
    log("  Searching for game cards...");
    const cards = await findAllGameCards(page);
    log(`  Total cards found: ${cards.length}`);

    if (cards.length === 0) {
        log("  ! No game cards — trying scroll further...");
        await scrollDown(page, 500);
        await pause(page, 500, 1000);
        const more = await findAllGameCards(page);
        log(`  Retry cards found: ${more.length}`);
        if (more.length === 0) {
            log("  ! ABORT: no game cards at all");
            await microMoves(page, 3);
            return;
        }
        return await continueSession(page, more);
    }

    return await continueSession(page, cards);
}

async function continueSession(page, cards) {
    const r = Math.random();
    const plan = r < 0.6 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
    log(`  Plan: ${plan}`);

    const first = weightedPick(cards);
    const ok1 = await clickGame(page, first.href);

    if (!ok1) {
        log("  First game click failed, trying another...");
        const alt = weightedPick(cards.filter(c => c.href !== first.href));
        if (alt) await clickGame(page, alt.href);
    }

    if (/\/\d{4}\/\d{2}\//.test(page.url())) {
        await readPost(page);

        if (plan === 'single-exit' || plan === 'double') {
            const left = await exitToGame(page);
            if (!left && plan === 'single-exit') {
                log("  Falling back to return");
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                await pause(page, 700, 1400);
            }
        } else {
            log("  Returning to home");
            try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
            await pause(page, 700, 1400);
        }
    }

    if (plan === 'double' && page.url().includes('blogspot.com') && !/\/\d{4}\/\d{2}\//.test(page.url())) {
        await pause(page, 500, 1200);
        await scrollDown(page, randInt(150, 320));
        await pause(page, 400, 900);
        const fresh = await findAllGameCards(page);
        const remaining = fresh.filter(c => c.href !== first.href);
        if (remaining.length) {
            const second = weightedPick(remaining);
            const ok2 = await clickGame(page, second.href);
            if (ok2) {
                await readPost(page);
                const left = await exitToGame(page);
                if (!left) {
                    try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e) {}
                }
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
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--no-first-run', '--no-zygote'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        deviceScaleFactor: 1
    });

    const page = await context.newPage();
    const requests = [], responses = [];
    page.on("request", r => requests.push(r.url()));
    page.on("response", r => responses.push({ s: r.status(), u: r.url() }));

    // سجل كل navigation لفهم ما يحدث
    page.on("framenavigated", f => {
        if (f === page.mainFrame()) log(`  [NAV] ${f.url().substring(0, 90)}`);
    });

    const start = Date.now();

    try {
        const response = await page.goto(TARGET_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        console.log("\n--- NAVIGATION ---");
        console.log("HTTP:", response ? response.status() : "NONE");
        console.log("URL:", page.url());
        console.log("Title:", await page.title());
        console.log("Elapsed:", Date.now() - start, "ms");

        await runSession(page);

        console.log("\n--- CLASSIFICATION ---");
        const u = page.url();
        if (u.includes("google.com/sorry")) console.log("RESULT: GOOGLE_SORRY");
        else if (u.includes("blogspot.com")) console.log("RESULT: STILL_ON_BLOG");
        else console.log("RESULT: LEFT_TO_EXTERNAL (realistic exit)");

        console.log("\n--- FINAL ---");
        console.log("Final URL:", page.url());
        console.log("Requests:", requests.length, "| Responses:", responses.length);
        console.log("Elapsed ms:", Date.now() - start);

        const dir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, "blogger-test.png"), fullPage: true });
        fs.writeFileSync(path.join(dir, "blogger-page.html"), await page.content(), "utf8");
        console.log("Screenshot + HTML saved.");

        // انتظر حتى الكاشف يرسل بياناته على pagehide
        await page.waitForTimeout(2000);

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
