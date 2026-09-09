import { expect, test } from "@playwright/test";

async function openSourceScreen(page: import("@playwright/test").Page, mode: "Авто" | "Вручную" = "Авто") {
  await page.goto("/");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
  await page.getByRole("button", { name: /Начать раунд/ }).click();
  await page.getByRole("button", { name: "Проверить микрофон" }).click();
  await expect(page.getByText(/Микрофон готов/)).toBeVisible();
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
  await expect(page.getByLabel(/Средняя длина кусочка/)).toHaveValue("2.1");
  await expect(page.getByRole("button", { name: "Проверить микрофон" })).toBeVisible();
  await expect(page.getByText("Управление раундом")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Проверить микрофон" }).click();
  await expect(page.getByText(/Микрофон готов/)).toBeVisible();
  await page.getByRole("button", { name: /Перейти к записи/ }).click();
  await recordSource(page, 2_600);
  await expect(page.getByText(/2 кусочк/)).toBeVisible();
  await page.getByRole("button", { name: /Разрезы хорошие/ }).click();
  await page.getByRole("button", { name: /^Начать/ }).click();

  await expect(page.getByRole("heading", { name: /Готов петь/ })).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: /Начать запись/ }).click();
  await expect(page.getByRole("heading", { name: /идёт запись/ })).toBeVisible();
  await page.getByRole("button", { name: /Остановить запись/ }).click();
  await expect(page.getByRole("heading", { name: /Записано/ })).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(page.getByRole("heading", { name: /Записано/ })).toBeVisible();
  await page.getByRole("button", { name: /Следующий кусочек/ }).click();
  await expect(page.getByRole("heading", { name: /Слушай · 1\/1/ })).toBeVisible();
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
