import { expect, test } from "@playwright/test";

async function openSourceScreen(page: import("@playwright/test").Page, mode: "Авто" | "Вручную" = "Авто") {
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
  await page.getByRole("button", { name: /Начать раунд/ }).click();
  await page.getByRole("button", { name: "Подключить микрофон" }).click();
  await expect(page.getByText(/^Активен:/)).toBeVisible();
  await page.getByRole("button", { name: /Перейти к записи/ }).click();
}

async function recordSource(page: import("@playwright/test").Page, milliseconds = 1_000) {
  await page.getByRole("button", { name: "Начать запись" }).click();
  await page.waitForTimeout(milliseconds);
  await page.getByRole("button", { name: "Закончить петь" }).click();
  await expect(page.getByTestId("edit-screen")).toBeVisible();
}

test("opens the bilingual home with prominent play modes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("АПОЖ");
  await expect(page.getByRole("button", { name: /^Авто/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Вручную/ }).click();
  await expect(page.getByRole("button", { name: /^Вручную/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Демо/ })).toHaveCount(0);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("APOZH");
});

test("settings are available without entering a round", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByRole("button", { name: /Настройки/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Микрофон" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Фрагменты" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Канал микшера" }).getByRole("button", { name: "L + R в моно" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/Средняя длина кусочка/)).toHaveValue("2.3");
  const repeats = page.getByRole("group", { name: "Повторов фрагмента" });
  await expect(repeats.getByRole("button", { name: "3 раза" })).toBeVisible();
  await repeats.getByRole("button", { name: "3 раза" }).click();
  await expect(repeats.getByRole("button", { name: "3 раза" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("больше коротких")).toBeVisible();
  await expect(page.getByText("меньше длинных")).toBeVisible();
  await expect(page.getByRole("button", { name: "Подключить микрофон" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Настроить по голосу" })).toBeDisabled();
  await expect(page.getByText("Управление раундом")).toHaveCount(0);
});

test("supports TV arrows and keeps keyboard focus inside setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /Начать раунд/ })).toBeFocused();
  await page.keyboard.press("Enter");
  const connect = page.getByRole("button", { name: "Подключить микрофон" });
  await expect(connect).toBeFocused();
  await expect(page.locator("body")).toHaveAttribute("data-tv-navigation", "");
  const dialogBeforeConnect = await page.getByRole("dialog").boundingBox();

  const inputSelect = page.getByLabel("Аудиовход");
  await inputSelect.focus();
  await page.keyboard.press("ArrowDown");
  await expect(inputSelect).not.toBeFocused();
  await expect(page.getByRole("dialog").locator(":focus")).toHaveCount(1);
  await connect.focus();

  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Активен:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Перейти к записи/ })).toBeFocused();
  await expect(page.getByRole("button", { name: "Настроить по голосу" })).toBeEnabled();
  const dialogAfterConnect = await page.getByRole("dialog").boundingBox();
  expect(dialogBeforeConnect).not.toBeNull();
  expect(dialogAfterConnect?.height).toBeCloseTo(dialogBeforeConnect!.height, 0);
  expect(dialogAfterConnect?.y).toBeCloseTo(dialogBeforeConnect!.y, 0);

  await expect(inputSelect.locator("option")).not.toHaveCount(1);
  const initialInput = await inputSelect.inputValue();
  await inputSelect.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(inputSelect).not.toHaveValue(initialInput);
  await expect(inputSelect).toBeEnabled();
  await expect(page.getByRole("button", { name: "Подключить выбранный вход" })).toHaveCount(0);
  await expect(page.getByText(/^Активен:/)).toBeVisible();
  await inputSelect.focus();
  await page.keyboard.press("ArrowDown");
  await expect(inputSelect).not.toBeFocused();

  await page.getByRole("button", { name: /Перейти к записи/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Закрыть" }).first()).toBeFocused();
  await expect(page.getByRole("dialog").locator(":focus")).toHaveCount(1);

  const chunkSlider = page.getByLabel(/Средняя длина кусочка/);
  await chunkSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(chunkSlider).toBeFocused();
  await expect(chunkSlider).toHaveValue("2.4");

  await page.getByRole("button", { name: "3 раза" }).click();
  await expect(page.locator("body")).not.toHaveAttribute("data-tv-navigation", "");
});

test("calibrates the automatic voice threshold from the live microphone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "party-tv-1080p", "One real-time calibration pass is enough.");
  test.setTimeout(25_000);
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByRole("button", { name: /Настройки/ }).click();
  await page.getByRole("button", { name: "Подключить микрофон" }).click();
  await expect(page.getByRole("button", { name: "Настроить по голосу" })).toBeVisible();
  await page.getByRole("button", { name: "Настроить по голосу" }).click();
  await expect(page.getByText(/Уровень настроен: −?-?\d+ dB/)).toBeVisible({ timeout: 5_000 });
});

test("records PCM through the browser audio worklet", async ({ page }) => {
  await openSourceScreen(page);
  await expect(page.getByText(/Второй игрок вышел/)).toBeVisible();
  await page.getByRole("button", { name: "Начать запись" }).click();
  await page.waitForTimeout(1_000);
  await expect(page.locator(".live-waveform__bar")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Закончить петь" }).click();
  await expect(page.getByTestId("edit-screen")).toBeVisible();
});

test("separates repeats and offers another listen", async ({ page }) => {
  test.setTimeout(30_000);
  await openSourceScreen(page);
  await recordSource(page);
  await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
  await page.getByRole("button", { name: /Начать/ }).click();

  await expect(page.getByRole("heading", { name: /Приготовься слушать/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Слушай · 1\/2/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /тот же кусок/ })).toBeVisible({ timeout: 8_000 });
  const commandTopDuringPause = (await page.locator(".challenge-screen__command").boundingBox())?.y;
  await page.waitForTimeout(1_200);
  await expect(page.getByRole("heading", { name: /тот же кусок/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Слушай · 2\/2/ })).toBeVisible({ timeout: 8_000 });
  const listenAgain = page.getByRole("button", { name: /Послушать ещё раз/ });
  await expect(listenAgain).toBeVisible();
  const commandTopBeforeSinging = (await page.locator(".challenge-screen__command").boundingBox())?.y;
  expect(commandTopDuringPause).toBeDefined();
  expect(commandTopBeforeSinging).toBeCloseTo(commandTopDuringPause!, 0);
  await listenAgain.click();
  await expect(page.getByRole("heading", { name: /Слушай ещё раз/ })).toBeVisible();
});

test("manual mode waits for explicit recording and next-fragment controls", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByRole("button", { name: /^Вручную/ }).click();
  await page.getByRole("button", { name: /Начать раунд/ }).click();
  await page.getByLabel(/Средняя длина кусочка/).fill("1.4");
  await page.getByRole("group", { name: "Повторов фрагмента" }).getByRole("button", { name: "1 раз" }).click();
  await page.getByRole("button", { name: "Подключить микрофон" }).click();
  await expect(page.getByText(/^Активен:/)).toBeVisible();
  await page.getByRole("button", { name: /Перейти к записи/ }).click();
  await recordSource(page, 2_600);
  await expect(page.getByText(/2 кусочк/)).toBeVisible();
  await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();

  await expect(page.getByRole("heading", { name: /Готов петь/ })).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /Начать запись/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /идёт запись/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Остановить запись/ })).toBeFocused();
  await expect(page.locator(".challenge-live-wave__timer")).toContainText("/ 0:07");
  await expect(page.getByRole("heading", { name: /Записано/ })).toBeVisible({ timeout: 9_000 });
  await expect(page.getByRole("button", { name: /Следующий кусочек/ })).toBeFocused();
  await page.waitForTimeout(3_500);
  await expect(page.getByRole("heading", { name: /Записано/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Слушай · 1\/1/ })).toBeVisible();
  await page.getByRole("button", { name: /шаг назад/i }).click();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Приготовься слушать/ })).toBeVisible();
});

test("space controls primary actions and the last fragment has no next countdown", async ({ page }) => {
  test.setTimeout(35_000);
  await openSourceScreen(page, "Вручную");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /Закончить петь/ })).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("edit-screen")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("handoff-screen")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /Начать запись/ })).toBeVisible({ timeout: 12_000 });
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: /идёт запись/ })).toBeVisible();
  await page.waitForTimeout(650);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /Показать результат/ })).toBeVisible();
  await expect(page.getByText(/Следующий кусочек/)).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("reveal-screen")).toBeVisible();
  await expect(page.locator(".reveal-confetti i")).toHaveCount(16);

  await page.keyboard.press("n");
  await expect(page.getByTestId("source-screen")).toBeVisible();
  await expect(page.locator(".live-waveform__bar")).toHaveCount(0);
  await expect(page.getByText("0:00", { exact: true })).toBeVisible();
});

test("pause freezes the challenge and back returns to the previous safe step", async ({ page }) => {
  test.setTimeout(35_000);
  await openSourceScreen(page, "Вручную");
  await recordSource(page);

  await page.getByRole("button", { name: /назад/i }).click();
  await expect(page.getByTestId("source-screen")).toBeVisible();
  await expect(page.locator(".live-waveform__bar")).toHaveCount(0);
  await expect(page.getByText("0:00", { exact: true })).toBeVisible();

  await recordSource(page);
  await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();
  await expect(page.getByRole("heading", { name: /Готов петь/ })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: /Начать запись/ }).click();
  await expect(page.getByRole("heading", { name: /идёт запись/ })).toBeVisible();

  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "Раунд на паузе" })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(page.getByRole("heading", { name: "Раунд на паузе" })).toBeVisible();

  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: /Приготовься слушать/ })).toBeVisible();
  await page.getByRole("button", { name: /назад/i }).click();
  await expect(page.getByTestId("handoff-screen")).toBeVisible();
});

test("has a valid installable web app manifest", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();

  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  const installability = await cdp.send("Page.getInstallabilityErrors");

  expect(manifest.url).toContain("manifest.webmanifest");
  expect(manifest.errors).toEqual([]);
  const appErrors = installability.installabilityErrors.filter(({ errorId }) => errorId !== "in-incognito");
  expect(appErrors).toEqual([]);
});

test("publishes a complete social sharing card", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://apoj.saa.sh/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://apoj.saa.sh/og-apoj.png");
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const imageResponse = await page.request.get("/og-apoj.png");
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toContain("image/png");
  const image = await imageResponse.body();
  expect(image.readUInt32BE(16)).toBe(1200);
  expect(image.readUInt32BE(20)).toBe(630);
});

test("reloads while completely offline after the first visit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await context.setOffline(false);
});
