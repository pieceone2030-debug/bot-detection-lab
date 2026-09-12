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
function log(msg) { console.log(msg); }

async function humanPause(page, minMs, maxMs) {
    await page.waitForTimeout(randInt(minMs, maxMs));
}

/* اختيار موزون حسب الموضع على الشاشة (الأعلى أكثر احتمالاً) */
function weightedPickByPosition(items) {
    if (items.length === 0) return null;
    const weights = items.map(it => {
        const y = Math.max(0, it.y);
        // الألعاب القريبة من أعلى الصفحة وزنها أعلى
        return 1 / (1 + y / 700);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
}

/* ============================================================
   حركة الماوس البشرية
   ============================================================ */

async function humanMouseMove(page, targetX, targetY) {
    const startX = mouseX;
    const startY = mouseY;
    const dist = Math.hypot(targetX - startX, targetY - startY);
    if (dist < 3) return;

    const ctrlX = (startX + targetX) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.5, 180);
    const ctrlY = (startY + targetY) / 2 + (Math.random() - 0.5) * Math.min(dist * 0.5, 180);

    const steps = Math.max(6, Math.min(45, Math.round(dist / 12) + randInt(2, 8)));

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * targetX;
        const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * targetY;
        const jx = (Math.random() - 0.5) * 2;
        const jy = (Math.random() - 0.5) * 2;
        await page.mouse.move(x + jx, y + jy);
        await page.waitForTimeout(rand(5, 24));
    }
    mouseX = targetX;
    mouseY = targetY;
}

/* تمرير هابط بشكل تدريجي (نادراً ما يرجع) */
async function humanScrollDown(page, deltaY) {
    const chunks = randInt(3, 7);
    const perChunk = deltaY / chunks;
    for (let i = 0; i < chunks; i++) {
        await page.mouse.wheel(0, perChunk + rand(-20, 20));
        await page.waitForTimeout(rand(50, 160));
    }
}

async function humanScrollUp(page, deltaY) {
    const chunks = randInt(2, 4);
    const perChunk = -deltaY / chunks;
    for (let i = 0; i < chunks; i++) {
        await page.mouse.wheel(0, perChunk + rand(-15, 15));
        await page.waitForTimeout(rand(60, 180));
    }
}

/* نقر بشري: اقتراب + تردد + نقر */
async function humanClick(page, x, y) {
    await humanMouseMove(page, x, y);

    if (Math.random() < 0.4) {
        const hx = x + (Math.random() - 0.5) * 35;
        const hy = y + (Math.random() - 0.5) * 35;
        await humanMouseMove(page, hx, hy);
        await humanPause(page, 150, 450);
        await humanMouseMove(page, x, y);
    }

    await humanPause(page, 70, 280);

    const fx = x + (Math.random() - 0.5) * 2;
    const fy = y + (Math.random() - 0.5) * 2;
    await page.mouse.move(fx, fy);
    await humanPause(page, 40, 120);

    await page.mouse.down();
    await page.waitForTimeout(rand(50, 120));
    await page.mouse.up();

    mouseX = fx;
    mouseY = fy;
}

/* حركات ماوس صغيرة أثناء القراءة */
async function idleMicroMoves(page, count = 2) {
    for (let i = 0; i < count; i++) {
        const dx = (Math.random() - 0.5) * 50;
        const dy = (Math.random() - 0.5) * 30;
        await humanMouseMove(page, mouseX + dx, mouseY + dy);
        await humanPause(page, 120, 400);
    }
}

/* ============================================================
   استخراج عناصر المدونة
   ============================================================ */

/* صور الألعاب: فقط الروابط الداخلية بنمط /YYYY/MM/ */
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
            if (r.width < 100 || r.height < 100) return;
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

/* رابط اللعبة الخارجي في صفحة المقال (تجاهل المواقع الاجتماعية والإعلانات) */
async function findExternalGameLink(page) {
    return await page.evaluate(() => {
        const EXCLUDED = [
            'blogspot.com', 'blogger.com', 'google.com', 'googlesyndication',
            'doubleclick', 'googleadservices', 'google-analytics',
            'facebook.com', 'fb.com', 'twitter.com', 'x.com',
            'instagram.com', 'youtube.com', 'youtu.be', 'whatsapp',
            'telegram', 't.me', 'pinterest', 'tiktok', 'linkedin',
            'reddit.com', 'gstatic', 'googleusercontent', 'blogspot'
        ];

        const isExcluded = (h) =>
            EXCLUDED.some(d => h.toLowerCase().includes(d));

        const scope =
            document.querySelector('.post-body') ||
            document.querySelector('.entry-content') ||
            document.querySelector('article') ||
            document.body;

        // مرحلة 1: روابط نصية خارجية (المفضلة)
        const anchors = Array.from(scope.querySelectorAll('a[href^="http"]'));
        for (const a of anchors) {
            const href = a.href;
            if (isExcluded(href)) continue;
            const text = (a.textContent || '').trim();
            if (text.length < 3) continue;
            const style = window.getComputedStyle(a);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const r = a.getBoundingClientRect();
            if (r.width < 30 || r.height < 12) continue;
            if (r.y < 0 || r.y > window.innerHeight * 3) continue;
            return { href, text, x: r.x, y: r.y, w: r.width, h: r.height };
        }
        return null;
    });
}

/* التمرير إلى عنصر */
async function scrollToHref(page, href) {
    await page.evaluate((h) => {
        const links = document.querySelectorAll('a[href]');
        for (const l of links) {
            if (l.href === h) {
                l.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
    }, href);
    await humanPause(page, 600, 1300);
}

async function getHrefBox(page, href) {
    return await page.evaluate((h) => {
        const links = document.querySelectorAll('a[href]');
        for (const l of links) {
            if (l.href === h) {
                const r = l.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
            }
        }
        return null;
    }, href);
}

/* ============================================================
   السلوك على الصفحة الرئيسية
   ============================================================ */

/* تمرير الرئيسية كقارئ يتصفح (نظرة عامة سريعة على الصور) */
async function browseHomepage(page) {
    log("  Browsing homepage...");
    const rounds = randInt(2, 4);
    for (let i = 0; i < rounds; i++) {
        await humanScrollDown(page, randInt(200, 550));
        await humanPause(page, 500, 1500);
        await idleMicroMoves(page, randInt(0, 2));
    }
    // عودة جزئية للأعلى أحياناً (نظرة أخيرة)
    if (Math.random() < 0.35) {
        await humanScrollUp(page, randInt(120, 300));
        await humanPause(page, 400, 1000);
    }
}

/* ============================================================
   السلوك على صفحة المقال
   ============================================================ */

/* قراءة مقال اللعبة: تمرير + توقف قصير */
async function readPostPage(page) {
    const rounds = randInt(1, 2);
    for (let i = 0; i < rounds; i++) {
        await humanScrollDown(page, randInt(150, 400));
        await humanPause(page, 600, 1800);
        await idleMicroMoves(page, randInt(0, 2));
    }
}

/* السيناريو الرئيسي على صفحة المقال:
   قراءة → البحث عن رابط اللعبة → النقر عليه → الخروج من الموقع
*/
async function playOrReturn(page, mode) {
    log(`     Post page mode: ${mode}`);

    await humanPause(page, 900, 2000);
    await readPostPage(page);
    await humanPause(page, 500, 1400);

    if (mode === 'exit') {
        // السيناريو الأكثر شيوعاً: البحث عن رابط اللعبة والنقر عليه للخروج
        const link = await findExternalGameLink(page);
        if (link) {
            log(`     Found external game link: ${link.href}`);

            await scrollToHref(page, link.href);
            const box = await getHrefBox(page, link.href);

            if (box && box.w > 20) {
                const cx = box.x + box.w * rand(0.35, 0.65);
                const cy = box.y + box.h * rand(0.35, 0.65);

                if (Math.random() < 0.6) {
                    await humanMouseMove(page, cx, cy);
                    await humanPause(page, 300, 800);
                }
                await humanClick(page, cx, cy);

                // انتظر تحميل الموقع الخارجي
                try {
                    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
                } catch (e) {}
                await humanPause(page, 2000, 3500);

                // تأكد أننا خرجنا فعلاً
                const url = page.url();
                if (!url.includes('blogspot.com')) {
                    log(`     Successfully left the blog -> ${url.substring(0, 60)}...`);
                    return 'left';
                }
            }
        }
        log("     No external link found — falling back to return");
    }

    // سيناريو الرجوع للرئيسية
    log("     Returning to homepage");
    try {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    await humanPause(page, 900, 1800);
    return 'returned';
}

/* زيارة لعبة محددة */
async function visitGame(page, href) {
    log(`  -> Target game: ${href}`);

    await scrollToHref(page, href);
    const box = await getHrefBox(page, href);
    if (!box || box.w < 30) {
        log("     Box not found, skipping");
        return null;
    }

    const cx = box.x + box.w * rand(0.32, 0.68);
    const cy = box.y + box.h * rand(0.32, 0.68);

    if (Math.random() < 0.7) {
        await humanMouseMove(page, cx, cy);
        await humanPause(page, 200, 700);
        await idleMicroMoves(page, randInt(0, 1));
    }

    await humanClick(page, cx, cy);

    try {
        await page.waitForLoadState('domcontentloaded', { timeout: 12000 });
    } catch (e) {}

    // تحقق أننا دخلنا صفحة مقال
    if (!/\/\d{4}\/\d{2}\//.test(page.url())) {
        log("     Did not land on post page");
        return null;
    }

    // اختر نمط النهاية
    const r = Math.random();
    let mode;
    if (r < 0.6) mode = 'exit';        // الأكثر شيوعاً
    else if (r < 0.9) mode = 'return'; // رجوع للرئيسية
    else mode = 'return';              // رجوع (سيناريو التصفح المتعدد)

    const result = await playOrReturn(page, mode);
    return result;
}

/* ============================================================
   الجلسات البشرية الكاملة
   ============================================================ */

async function runSession(page) {
    log("\n===== START HUMAN SESSION =====");
    await humanPause(page, 800, 2000);
    await browseHomepage(page);

    const images = await getGameImages(page);
    log(`  Found ${images.length} game images`);

    if (images.length === 0) {
        log("  No games found — ending");
        await idleMicroMoves(page, 3);
        return;
    }

    // اختيار الجلسة
    const r = Math.random();
    let plan;
    if (r < 0.60) plan = 'single-exit';      // 60%: لعبة واحدة + خروج
    else if (r < 0.85) plan = 'single-return'; // 25%: لعبة واحدة + رجوع
    else plan = 'double';                    // 15%: لعبتين

    log(`  Session plan: ${plan}`);

    if (plan === 'single-exit' || plan === 'single-return') {
        const target = weightedPickByPosition(images);
        await visitGame(page, target.href);
        // بعد الزيارة: ربما خرجنا من الموقع أو رجعنا
    } else {
        // زيارة لعبتين — الأولى مع رجوع إلزامي
        const first = weightedPickByPosition(images);
        log(`  Game #1: ${first.href}`);
        await visitGame(page, first.href);

        // نبقى على الرئيسية فقط إن رجعنا
        if (page.url().includes('blogspot.com')) {
            await humanPause(page, 800, 1800);
            await humanScrollDown(page, randInt(150, 400));
            await humanPause(page, 500, 1200);

            const fresh = await getGameImages(page);
            const remaining = fresh.filter(i => i.href !== first.href);
            if (remaining.length > 0) {
                const second = weightedPickByPosition(remaining);
                log(`  Game #2: ${second.href}`);
                await visitGame(page, second.href);
            }
        }
    }

    log("  Session winding down");
    await idleMicroMoves(page, randInt(2, 4));
    await humanPause(page, 1500, 3000);
    log("===== SESSION COMPLETE =====\n");
}

/* ============================================================
   الدالة الرئيسية
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

    const requests = [];
    const responses = [];

    page.on("request", r => requests.push({ method: r.method(), url: r.url(), type: r.resourceType() }));
    page.on("response", r => responses.push({ status: r.status(), url: r.url(), type: r.request().resourceType() }));

    const start = Date.now();

    try {
        const response = await page.goto(TARGET_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        console.log("\n--- NAVIGATION ---");
        console.log("Initial HTTP status:", response ? response.status() : "NONE");
        console.log("Current page URL:", page.url());
        console.log("Title:", await page.title());
        console.log("Elapsed:", Date.now() - start, "ms");

        await runSession(page);

        console.log("\n--- CLASSIFICATION ---");
        const finalUrl = page.url();
        if (finalUrl.includes("google.com/sorry")) console.log("RESULT: GOOGLE_SORRY");
        else if (finalUrl.includes("blogspot.com")) console.log("RESULT: STILL_ON_BLOGGER");
        else console.log("RESULT: LEFT_TO_EXTERNAL (realistic user exit)");

        console.log("\n--- RESPONSE SUMMARY ---");
        responses
            .filter(r => r.status >= 400 || r.url.includes("blogspot.com"))
            .slice(-20)
            .forEach(r => console.log(r.status, r.type, r.url));

        // انتظر حتى يُرسل الكاشف بياناته (10 ثوانٍ من التحميل الأصلي كحد أدنى)
        const sinceStart = Date.now() - start;
        const remaining = Math.max(0, 12000 - sinceStart);
        if (remaining > 0) {
            console.log(`\n--- WAITING ${remaining}ms FOR DETECTOR ---`);
            await page.waitForTimeout(remaining);
        }

        // لقطة شاشة للحالة النهائية
        const screenshotDir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(screenshotDir, { recursive: true });

        const screenshotPath = path.join(screenshotDir, "blogger-test.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log("\nScreenshot saved:", screenshotPath);

        const htmlPath = path.join(screenshotDir, "blogger-page.html");
        fs.writeFileSync(htmlPath, await page.content(), "utf8");
        console.log("HTML saved:", htmlPath);

        console.log("\n--- FINAL STATE ---");
        console.log("Final URL:", page.url());
        console.log("Total requests:", requests.length);
        console.log("Total responses:", responses.length);
        console.log("Elapsed ms:", Date.now() - start);

    } catch (error) {
        console.error("\nTEST ERROR:");
        console.error(error);
        try {
            const dir = path.join(process.cwd(), "screenshots");
            fs.mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: path.join(dir, "error-state.png"), fullPage: true });
            console.log("Error screenshot saved.");
        } catch (e) { console.error("Screenshot error:", e); }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main();
