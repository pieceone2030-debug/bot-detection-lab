const { chromium } = require("playwright");

const TARGET_URL = process.env.TARGET_URL;

async function main() {
    if (!TARGET_URL) {
        throw new Error("TARGET_URL is missing");
    }

    console.log("Target:", TARGET_URL);

    const browser = await chromium.launch({
        headless: true
    });

    const context = await browser.newContext({
        viewport: {
            width: 1536,
            height: 864
        }
    });

    const page = await context.newPage();

    const start = Date.now();

    page.on("requestfailed", request => {
        console.log(
            "REQUEST_FAILED:",
            request.url(),
            request.failure()?.errorText || ""
        );
    });

    try {
        const response = await page.goto(
            TARGET_URL,
            {
                waitUntil: "domcontentloaded",
                timeout: 30000
            }
        );

        console.log(
            "HTTP status:",
            response?.status() ?? "unknown"
        );

        console.log(
            "Initial URL:",
            page.url()
        );

        console.log(
            "Title:",
            await page.title()
        );

        // نعطي Blogger والـJavaScript 12 ثانية
        // لتسجيل جلسة الاختبار.
        await page.waitForTimeout(12000);

        console.log(
            "Final URL:",
            page.url()
        );

        console.log(
            "Elapsed ms:",
            Date.now() - start
        );

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
