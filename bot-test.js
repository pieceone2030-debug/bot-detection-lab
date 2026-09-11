// استيراد patchright بدلاً من playwright العادي
const { chromium } = require("patchright");
const fs = require("fs");
const path = require("path");

// استيراد الإضافات المساعدة
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AnonymizeUA = require("@zorilla/puppeteer-extra-plugin-anonymize-ua").default;

// دمج الإضافات مع patchright
const chromiumExtra = addExtra(chromium);
chromiumExtra.use(StealthPlugin());
chromiumExtra.use(AnonymizeUA());

const TARGET_URL =
    process.env.TARGET_URL ||
    "https://pog01.blogspot.com/";

async function main() {
    console.log("=================================");
    console.log("BLOGGER BOT DETECTION LAB (STEALTH)");
    console.log("=================================");
    console.log("Target:", TARGET_URL);

    // إعدادات التشغيل مع التخفي
    const browser = await chromiumExtra.launch({
        headless: true, // يمكنك تجربة false أيضاً لمحاكاة أفضل
        args: [
            '--disable-blink-features=AutomationControlled', // إخفاء إشارات الأتمتة
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        // استخدام بروكسي سكني (استبدل هذه القيم ببياناتك)
       

    const context = await browser.newContext({
        // تعيين بصمة متسقة (User-Agent, locale, timezone)
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York', // اختر منطقة زمنية تتوافق مع البروكسي
        viewport: {
            width: 1920,
            height: 1080
        },
        // تعيين أبعاد الشاشة (مهم جداً)
        screen: { width: 1920, height: 1080 },
        // إعدادات إضافية لمحاكاة البشر
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
    });

    const page = await context.newPage();

    // ... (باقي كود تسجيل الطلبات والاستجابات كما هو) ...
    const requests = [];
    const responses = [];

    page.on("request", request => {
        requests.push({
            method: request.method(),
            url: request.url(),
            resourceType: request.resourceType()
        });
    });

    page.on("response", response => {
        responses.push({
            status: response.status(),
            url: response.url(),
            resourceType: response.request().resourceType()
        });
    });

    const start = Date.now();

    try {
        const response = await page.goto(TARGET_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000 // زيادة المهلة
        });

        // ... (باقي كود الطباعة والتشخيص كما هو) ...

        console.log("\n--- NAVIGATION ---");
        console.log("Initial HTTP status:", response ? response.status() : "NONE");
        console.log("Initial response URL:", response ? response.url() : "NONE");
        console.log("Current page URL:", page.url());
        console.log("Title:", await page.title());
        console.log("Elapsed:", Date.now() - start, "ms");

        const isGoogleSorry = page.url().includes("google.com/sorry");
        const isBlogger = page.url().includes("blogspot.com");

        console.log("\n--- CLASSIFICATION ---");
        if (isGoogleSorry) {
            console.log("RESULT: GOOGLE_SORRY");
        } else if (isBlogger) {
            console.log("RESULT: BLOGGER_REACHED");
        } else {
            console.log("RESULT: OTHER");
        }

        // ...

        /*
         * **إضافة سلوك بشري**: انتظر عشوائياً وحرك الماوس
         */
        console.log("\n--- SIMULATING HUMAN BEHAVIOR ---");

        // انتظار عشوائي (بين 5 و 12 ثانية) لمحاكاة قراءة المحتوى
        const randomWait = 5000 + Math.random() * 7000;
        console.log(`Waiting for ${Math.round(randomWait)}ms...`);
        await page.waitForTimeout(randomWait);

        // محاكاة حركة الماوس بشكل عشوائي
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * 1000);
            const y = Math.floor(Math.random() * 600);
            await page.mouse.move(x, y);
            await page.waitForTimeout(100 + Math.random() * 300);
        }

        // محاكاة التمرير
        await page.mouse.wheel(0, 300 + Math.random() * 500);
        await page.waitForTimeout(1000 + Math.random() * 2000);

        console.log("Human behavior simulation complete.");

        // ... (باقي كود حفظ لقطة الشاشة و HTML كما هو) ...

        // إنشاء مجلد screenshots
        const screenshotDir = path.join(process.cwd(), "screenshots");
        fs.mkdirSync(screenshotDir, { recursive: true });

        const screenshotPath = path.join(screenshotDir, "blogger-stealth-test.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log("\nScreenshot saved:", screenshotPath);

        const htmlPath = path.join(screenshotDir, "blogger-stealth-page.html");
        fs.writeFileSync(htmlPath, await page.content(), "utf8");
        console.log("HTML saved:", htmlPath);

        console.log("\n--- FINAL STATE ---");
        console.log("Final URL:", page.url());
        console.log("Total requests:", requests.length);
        console.log("Total responses:", responses.length);
        console.log("Elapsed ms:", Date.now() - start);

    } catch (error) {
        // ... (كود معالجة الأخطاء كما هو) ...
        console.error("\nTEST ERROR:");
        console.error(error);
        // ...
    } finally {
        await browser.close();
    }
}

main();
