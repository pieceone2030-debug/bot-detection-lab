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

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function log(m) { console.log(m); }

async function pause(page, a, b) {
    await page.waitForTimeout(randInt(a, b));
}

function weightedPickByPosition(items) {
    if (!items.length) return null;
    const weights = items.map(it => 1 / (1 + Math.max(0, it.y) / 600));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
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
    const cX = (sx + tx) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 160);
    const cY = (sy + ty) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.4, 160);
    const steps = Math.max(5, Math.min(40, Math.round(dist / 14) + randInt(2, 6)));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cX + t * t * tx;
        const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cY + t * t * ty;
        await page.mouse.move(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2);
        await page.waitForTimeout(rand(4, 18));
    }
    mouseX = tx; mouseY = ty;
}

async function scrollDown(page, dy) {
    const chunks = randInt(3, 6);
    for (let i = 0; i < chunks; i++) {
        await page.mouse.wheel(0, dy / chunks + rand(-15, 15));
        await page.waitForTimeout(rand(40, 120));
    }
}

async function scrollUp(page, dy) {
    const chunks = randInt(2, 4);
    for (let i = 0; i < chunks; i++) {
        await page.mouse.wheel(0, -dy / chunks + rand(-10, 10));
        await page.waitForTimeout(rand(50, 130));
    }
}

async function microMoves(page, n = 2) {
    for (let i = 0; i < n; i++) {
        await moveMouse(page, mouseX + (Math.random() - 0.5) * 70, mouseY + (Math.random() - 0.5) * 40);
        await pause(page, 90, 300);
    }
}

async function clickAt(page, x, y) {
    await moveMouse(page, x, y);
    if (Math.random() < 0.35) {
        await moveMouse(page, x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
        await pause(page, 120, 350);
        await moveMouse(page, x, y);
    }
    await pause(page, 60, 220);
    await page.mouse.move(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2);
    await pause(page, 30, 100);
    await page.mouse.down();
    await page.waitForTimeout(rand(45, 110));
    await page.mouse.up();
}

/* ============================================================
   استخراج العناصر
   ============================================================ */

async function getGameImages(page) {
    return await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('img').forEach(img => {
            const a = img.closest('a');
            if (!a) return;
            const href = a.href || '';
            if (!href.includes('blogspot.com')) return;
            if (!/\/\d{4}\/\d{2}\//.test(href)) return;
            const r = img.getBoundingClientRect();
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

async function waitForImages(page, maxWait = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const count = await page.evaluate(() =>
            document.querySelectorAll('img').length
        );
        if (count >= 6) {
            // انتظر إضافي قصير لاستقرار الأبعاد
            await page.waitForTimeout(600);
            return count;
        }
        await page.waitForTimeout(300);
    }
    return 0;
}

async function scrollToHref(page, href) {
    await page.evaluate((h) => {
        for (const l of document.querySelectorAll('a[href]')) {
            if (l.href === h) {
                l.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
    }, href);
    await pause(page, 400, 900);
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

async function findExternalGameLink(page) {
    return await page.evaluate(() => {
        const EXCL = ['blogspot.com','blogger.com','google.com','googlesyndication',
            'doubleclick','googleadservices','google-analytics','gstatic',
            'googleusercontent','facebook.com','fb.com','twitter.com','x.com',
            'instagram.com','youtube.com','youtu.be','whatsapp','telegram',
            't.me','pinterest','tiktok','linkedin','reddit.com'];
        const bad = h => EXCL.some(d => h.toLowerCase().includes(d));
        const scope = document.querySelector('.post-body')
            || document.querySelector('.entry-content')
            || document.querySelector('article')
            || document.body;
        for (const a of scope.querySelectorAll('a[href^="http"]')) {
            const href = a.href;
            if (bad(href)) continue;
            const text = (a.textContent || '').trim();
            if (text.length < 3) continue;
            const s = getComputedStyle(a);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const r = a.getBoundingClientRect();
            if (r.width < 30 || r.height < 12) continue;
            return { href, text, x: r.x, y: r.y, w: r.width, h: r.height };
        }
        return null;
    });
}

/* ============================================================
   السلوك
   ============================================================ */

/* مسح سريع للرئيسية: لا يتجاوز 2.5 ثانية */
async function quickScanHomepage(page) {
    log("  [Home] Quick scan...");
    await pause(page, 400, 900);
    const rounds = randInt(1, 2);
    for (let i = 0; i < rounds; i++) {
        await scrollDown(page, randInt(200, 450));
        await pause(page, 250, 700);
        await microMoves(page, randInt(1, 2));
    }
}

/* زيارة لعبة */
async function visitGame(page, href) {
    log(`  -> Visiting: ${href.substring(0, 70)}...`);

    await scrollToHref(page, href);
    const box = await boxOfHref(page, href);
    if (!box || box.w < 30) {
        log("     ! box not found");
        return false;
    }
    const cx = box.x + box.w * rand(0.3, 0.7);
    const cy = box.y + box.h * rand(0.3, 0.7);

    if (Math.random() < 0.75) {
        await moveMouse(page, cx, cy);
        await pause(page, 150, 450);
        await microMoves(page, randInt(0, 2));
    }
    await clickAt(page, cx, cy);

    try { await page.waitForLoadState('domcontentloaded', { timeout: 12000 }); }
    catch (e) {}

    if (!/\/\d{4}\/\d{2}\//.test(page.url())) {
        log("     ! did not land on post page");
        return false;
    }
    log(`     ✓ on post: ${page.url().substring(0, 70)}...`);
    return true;
}

/* قراءة صفحة المقال */
async function readPost(page) {
    log("     Reading post...");
    const rounds = randInt(2, 4);
    for (let i = 0; i < rounds; i++) {
        await scrollDown(page, randInt(150, 400));
        await pause(page, 500, 1500);
        await microMoves(page, randInt(1, 3));
    }
    if (Math.random() < 0.4) {
        await scrollUp(page, randInt(100, 250));
        await pause(page, 400, 900);
        await microMoves(page, randInt(1, 2));
    }
}

/* الخروج من المدونة عبر رابط اللعبة الخارجي */
async function exitToGame(page) {
    log("     Looking for external game link...");
    const link = await findExternalGameLink(page);
    if (!link) {
        log("     ! no external link found");
        return false;
    }
    log(`     Found: ${link.text} -> ${link.href.substring(0, 60)}...`);

    await scrollToHref(page, link.href);
    const box = await boxOfHref(page, link.href);
    if (!box || box.w < 20) return false;

    const cx = box.x + box.w * rand(0.35, 0.65);
    const cy = box.y + box.h * rand(0.35, 0.65);

    if (Math.random() < 0.6) {
        await moveMouse(page, cx, cy);
        await pause(page, 250, 600);
    }
    await clickAt(page, cx, cy);

    try { await page.waitForLoadState('domcontentloaded', { timeout: 15000 }); }
    catch (e) {}
    await pause(page, 1500, 2800);

    if (!page.url().includes('blogspot.com')) {
        log(`     ✓ Left blog -> ${page.url().substring(0, 60)}...`);
        // تصفح قصير في موقع اللعبة
        await pause(page, 800, 1500);
        await microMoves(page, 2);
        await scrollDown(page, randInt(150, 350));
        await pause(page, 800, 1500);
        return true;
    }
    return false;
}

/* ============================================================
   الجلسة البشرية
   ============================================================ */

async function runSession(page) {
    log("\n===== HUMAN SESSION =====");

    // 1) انتظار تحميل الصور
    const imgCount = await waitForImages(page, 5000);
    log(`  Total <img> in DOM: ${imgCount}`);

    // 2) مسح سريع
    await quickScanHomepage(page);

    // 3) جلب صور الألعاب
    let images = await getGameImages(page);
    log(`  Game images found: ${images.length}`);

    // إذا لم نجد، جرب التمرير قليلاً ثم أعد المحاولة
    if (images.length === 0) {
        log("  No games found, scrolling further...");
        await scrollDown(page, 600);
        await pause(page, 800, 1500);
        images = await getGameImages(page);
        log(`  Retry game images found: ${images.length}`);
    }

    if (images.length === 0) {
        log("  ! No games — aborting");
        await microMoves(page, 4);
        return;
    }

    // 4) اختر خطة الجلسة
    const r = Math.random();
    const plan = r < 0.6 ? 'single-exit' : (r < 0.85 ? 'single-return' : 'double');
    log(`  Plan: ${plan}`);

    // 5) زيارة اللعبة الأولى
    const first = weightedPickByPosition(images);
    const ok1 = await visitGame(page, first.href);

    if (!ok1) {
        log("  First game failed, trying another...");
        const alt = weightedPickByPosition(images.filter(i => i.href !== first.href));
        if (alt) await visitGame(page, alt.href);
    }

    // 6) على صفحة المقال: قراءة ثم خروج أو رجوع
    if (page.url().includes('blogspot.com') && /\/\d{4}\/\d{2}\//.test(page.url())) {
        await readPost(page);

        if (plan === 'single-exit' || plan === 'double') {
            const left = await exitToGame(page);
            if (!left && plan === 'single-exit') {
                log("  Could not exit, going back");
                try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 12000 }); }
                catch (e) {}
                await pause(page, 800, 1500);
            }
        } else {
            log("  Returning to home");
            try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 12000 }); }
            catch (e) {}
            await pause(page, 800, 1500);
        }
    }

    // 7) اللعبة الثانية (نموذج المستكشف)
    if (plan === 'double' && page.url().includes('blogspot.com') && !/\/\d{4}\/\d{2}\//.test(page.url())) {
        await pause(page, 600, 1400);
        await scrollDown(page, randInt(150, 350));
        await pause(page, 500, 1000);
        const fresh = await getGameImages(page);
        const remaining = fresh.filter(i => i.href !== first.href);
        if (remaining.length) {
            const second = weightedPickByPosition(remaining);
            const ok2 = await visitGame(page, second.href);
            if (ok2) {
                await readPost(page);
                const left = await exitToGame(page);
                if (!left) {
                    try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 12000 }); }
                    catch (e) {}
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
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote'
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
    page.on("request", r => requests.push({ method: r.method(), url: r.url() }));
    page.on("response", r => responses.push({ status: r.status(), url: r.url() }));

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

        console.log("\n--- FINAL STATE ---");
        console.log("Final URL:", page.url());
        console.log("Total requests:", requests.length);
        console.log("Total responses:", responses.length);
        console.log("Elapsed ms:", Date.now() - start);

        // لقطة شاشة
        const dir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        const shot = path.join(dir, "blogger-test.png");
        await page.screenshot({ path: shot, fullPage: true });
        console.log("Screenshot:", shot);

        const html = path.join(dir, "blogger-page.html");
        fs.writeFileSync(html, await page.content(), "utf8");
        console.log("HTML:", html);

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
