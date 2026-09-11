const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const TARGET_URL =
    process.env.TARGET_URL ||
    "https://pog01.blogspot.com/";

async function main() {
    console.log("=================================");
    console.log("BLOGGER BOT DETECTION LAB");
    console.log("=================================");
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
        const response = await page.goto(
            TARGET_URL,
            {
                waitUntil: "domcontentloaded",
                timeout: 30000
            }
        );

        console.log("\n--- NAVIGATION ---");

        console.log(
            "Initial HTTP status:",
            response ? response.status() : "NONE"
        );

        console.log(
            "Initial response URL:",
            response ? response.url() : "NONE"
        );

        console.log(
            "Current page URL:",
            page.url()
        );

        console.log(
            "Title:",
            await page.title()
        );

        console.log(
            "Elapsed:",
            Date.now() - start,
            "ms"
        );

        const isGoogleSorry =
            page.url().includes("google.com/sorry");

        const isBlogger =
            page.url().includes("blogspot.com");

        console.log("\n--- CLASSIFICATION ---");

        if (isGoogleSorry) {
            console.log("RESULT: GOOGLE_SORRY");
        } else if (isBlogger) {
            console.log("RESULT: BLOGGER_REACHED");
        } else {
            console.log("RESULT: OTHER");
        }

        console.log("\n--- RESPONSE SUMMARY ---");

        const relevant =
            responses
                .filter(r =>
                    r.status >= 400 ||
                    r.url.includes("blogspot.com") ||
                    r.url.includes("google.com/sorry")
                )
                .slice(-20);

        for (const r of relevant) {
            console.log(
                r.status,
                r.resourceType,
                r.url
            );
        }

        /*
         * انتظر حتى يعمل JavaScript في Blogger
         */
        console.log("\n--- WAITING 12 SECONDS ---");

        await page.waitForTimeout(12000);

        /*
         * إنشاء مجلد screenshots
         */
        const screenshotDir =
            path.join(process.cwd(), "screenshots");

        fs.mkdirSync(
            screenshotDir,
            { recursive: true }
        );

        /*
         * لقطة شاشة كاملة للصفحة
         */
        const screenshotPath =
            path.join(
                screenshotDir,
                "blogger-test.png"
            );

        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });

        console.log(
            "\nScreenshot saved:",
            screenshotPath
        );

        /*
         * حفظ HTML أيضًا للمقارنة لاحقًا
         */
        const htmlPath =
            path.join(
                screenshotDir,
                "blogger-page.html"
            );

        fs.writeFileSync(
            htmlPath,
            await page.content(),
            "utf8"
        );

        console.log(
            "HTML saved:",
            htmlPath
        );

        console.log("\n--- FINAL STATE ---");

        console.log(
            "Final URL:",
            page.url()
        );

        console.log(
            "Total requests:",
            requests.length
        );

        console.log(
            "Total responses:",
            responses.length
        );

        console.log(
            "Elapsed ms:",
            Date.now() - start
        );

    } catch (error) {

        console.error("\nTEST ERROR:");
        console.error(error);

        /*
         * إذا حدث خطأ أثناء التنقل،
         * نحاول أخذ screenshot للحالة الحالية.
         */
        try {

            const screenshotDir =
                path.join(
                    process.cwd(),
                    "screenshots"
                );

            fs.mkdirSync(
                screenshotDir,
                { recursive: true }
            );

            await page.screenshot({
                path: path.join(
                    screenshotDir,
                    "error-state.png"
                ),
                fullPage: true
            });

            console.log(
                "Error screenshot saved."
            );

        } catch (screenError) {

            console.error(
                "Could not save error screenshot:",
                screenError
            );
        }

        process.exitCode = 1;

    } finally {

        await browser.close();
    }
}

main();
