import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
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
await page.getByRole("button", { name: /Перейти к записи/ }).click();
await page.getByRole("button", { name: "Начать запись" }).click();
await page.waitForTimeout(1_000);
await page.screenshot({ path: "test-results/source-recording-review.png", fullPage: true });
await page.getByRole("button", { name: "Закончить петь" }).click();

const challengePage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await challengePage.goto("http://127.0.0.1:4174/");
await challengePage.getByRole("button", { name: "RU" }).click();
await challengePage.getByRole("button", { name: "Демо без микрофона" }).click();
await challengePage.getByRole("button", { name: /Разрезы хорошие/ }).click();
await challengePage.getByRole("button", { name: /Начать/ }).click();
await challengePage.getByRole("heading", { name: /тот же кусок/ }).waitFor();
await challengePage.screenshot({ path: "test-results/repeat-gap-review.png", fullPage: true });
await challengePage.getByRole("button", { name: /Послушать ещё раз/ }).waitFor();
await challengePage.screenshot({ path: "test-results/replay-review.png", fullPage: true });

const manualPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await manualPage.goto("http://127.0.0.1:4174/");
await manualPage.getByRole("button", { name: "RU" }).click();
await manualPage.getByRole("button", { name: /Настройки/ }).click();
await manualPage.getByRole("button", { name: /Вручную/ }).click();
await manualPage.getByRole("button", { name: "Закрыть", exact: true }).first().click();
await manualPage.getByRole("button", { name: /Демо без микрофона/ }).click();
await manualPage.getByRole("button", { name: /Разрезы хорошие/ }).click();
await manualPage.getByRole("button", { name: /^Начать/ }).click();
await manualPage.getByRole("button", { name: /Начать запись/ }).waitFor();
await manualPage.screenshot({ path: "test-results/manual-ready-review.png", fullPage: true });
await manualPage.getByRole("button", { name: /Начать запись/ }).click();
await manualPage.screenshot({ path: "test-results/manual-recording-review.png", fullPage: true });
await manualPage.getByRole("button", { name: /Остановить запись/ }).click();
await manualPage.getByRole("button", { name: /Следующий кусочек/ }).waitFor();
await manualPage.screenshot({ path: "test-results/manual-saved-review.png", fullPage: true });
await browser.close();
