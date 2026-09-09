import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:4174/");
await page.getByRole("button", { name: "RU" }).click();
await page.screenshot({ path: "test-results/home-review.png", fullPage: true });
await page.getByRole("button", { name: "Демо без микрофона" }).click();
await page.screenshot({ path: "test-results/editor-review.png", fullPage: true });
await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
await page.screenshot({ path: "test-results/handoff-review.png", fullPage: true });
await page.getByRole("button", { name: "На главную" }).click();
await page.getByRole("button", { name: /Начать раунд/ }).click();
await page.getByRole("button", { name: "Проверить микрофон" }).click();
await page.getByText(/Микрофон готов/).waitFor();
await page.waitForTimeout(180);
await page.screenshot({ path: "test-results/setup-review.png", fullPage: true });

const challengePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await challengePage.goto("http://127.0.0.1:4174/");
await challengePage.getByRole("button", { name: "RU" }).click();
await challengePage.getByRole("button", { name: "Демо без микрофона" }).click();
await challengePage.getByRole("button", { name: /Разрезы хорошие/ }).click();
await challengePage.getByRole("button", { name: /Начать/ }).click();
await challengePage.getByRole("heading", { name: /тот же кусок/ }).waitFor();
await challengePage.screenshot({ path: "test-results/repeat-gap-review.png", fullPage: true });
await challengePage.getByRole("button", { name: /Послушать ещё раз/ }).waitFor();
await challengePage.screenshot({ path: "test-results/replay-review.png", fullPage: true });
await browser.close();
