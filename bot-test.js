const { chromium } = require("playwright");

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

        const finalUrl = page.url();

        const isGoogleSorry =
            finalUrl.includes("google.com/sorry");

        const isBlogger =
            finalUrl.includes("blogspot.com");

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

        console.log("\n--- WAITING ---");

        await page.waitForTimeout(10000);

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

    } catch (error) {

        console.error("\nTEST ERROR:");
        console.error(error);

        process.exitCode = 1;

    } finally {

        await browser.close();
    }
}

main();
