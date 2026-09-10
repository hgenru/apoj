import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:4174/");
await page.getByRole("button", { name: "RU", exact: true }).click();
await page.screenshot({ path: "test-results/home-review.png", fullPage: true });
await page.getByRole("button", { name: /Настройки/ }).click();
await page.waitForTimeout(180);
await page.screenshot({ path: "test-results/setup-review.png", fullPage: true });
await page.getByLabel(/Средняя длина кусочка/).fill("1.4");
await page.getByRole("group", { name: "Повторов фрагмента" }).getByRole("button", { name: "1 раз" }).click();
await page.getByRole("button", { name: "Закрыть", exact: true }).first().click();
await page.getByRole("button", { name: /^Вручную/ }).click();
await page.getByRole("button", { name: /Начать раунд/ }).click();
await page.getByRole("button", { name: "Подключить микрофон" }).click();
await page.getByText(/^Активен:/).waitFor();
await page.waitForTimeout(180);
await page.screenshot({ path: "test-results/setup-connected-review.png", fullPage: true });
await page.getByRole("button", { name: /Перейти к записи/ }).click();
await page.getByRole("button", { name: "Начать запись" }).click();
await page.waitForTimeout(1_000);
await page.screenshot({ path: "test-results/source-recording-review.png", fullPage: true });
await page.waitForTimeout(1_600);
await page.getByRole("button", { name: "Закончить петь" }).click();
await page.screenshot({ path: "test-results/editor-review.png", fullPage: true });
await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
await page.screenshot({ path: "test-results/handoff-review.png", fullPage: true });
await page.getByRole("button", { name: /^Начать/ }).click();
await page.getByTestId("reverse-preview-screen").waitFor();
await page.screenshot({ path: "test-results/reverse-preview-playing-review.png", fullPage: true });
await page.getByRole("button", { name: /Начать фрагменты/ }).waitFor({ state: "visible" });
await page.getByRole("button", { name: /Начать фрагменты/ }).click();
await page.waitForTimeout(1_650);
await page.screenshot({ path: "test-results/challenge-playing-review.png", fullPage: true });
await page.getByRole("button", { name: /Начать запись/ }).waitFor();
await page.screenshot({ path: "test-results/manual-ready-review.png", fullPage: true });
await page.keyboard.press("p");
await page.getByRole("heading", { name: /Раунд на паузе/ }).waitFor();
await page.screenshot({ path: "test-results/challenge-paused-review.png", fullPage: true });
await page.keyboard.press("Space");
await page.getByRole("button", { name: /Начать запись/ }).waitFor();
await page.getByRole("button", { name: /Начать запись/ }).click();
await page.waitForTimeout(150);
await page.screenshot({ path: "test-results/manual-recording-review.png", fullPage: true });
await page.getByRole("button", { name: /Остановить запись/ }).click();
await page.getByRole("button", { name: /Следующий кусочек|Показать результат/ }).waitFor();
await page.screenshot({ path: "test-results/manual-saved-review.png", fullPage: true });
while (await page.getByRole("button", { name: /Следующий кусочек/ }).isVisible()) {
  await page.getByRole("button", { name: /Следующий кусочек/ }).click();
  await page.getByRole("button", { name: /Начать запись/ }).waitFor();
  await page.getByRole("button", { name: /Начать запись/ }).click();
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: /Остановить запись/ }).click();
  await page.getByRole("button", { name: /Следующий кусочек|Показать результат/ }).waitFor();
}
await page.screenshot({ path: "test-results/manual-final-saved-review.png", fullPage: true });
await page.getByRole("button", { name: /Показать результат/ }).click();
await page.waitForTimeout(250);
await page.screenshot({ path: "test-results/reveal-review.png", fullPage: true });
await browser.close();
