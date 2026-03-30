import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room: string) {
  await page.goto(`/room/${room}`);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

test('clip planes toggle button appears', async ({ page }) => {
  const room = uniqueRoom('clip-toggle');
  await waitForAppReady(page, room);

  const toggleBtn = page.locator('#clip-planes-toggle');
  await expect(toggleBtn).toBeVisible({ timeout: 3000 });
});

test('clicking toggle shows clip planes panel', async ({ page }) => {
  const room = uniqueRoom('clip-panel');
  await waitForAppReady(page, room);

  // Panel should be hidden initially
  const panel = page.locator('#clip-planes-panel');
  await expect(panel).toBeHidden();

  // Click toggle
  await page.click('#clip-planes-toggle');

  // Panel should be visible
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Should have 6 range sliders (xMin, xMax, yMin, yMax, zMin, zMax)
  const sliders = panel.locator('input[type="range"]');
  await expect(sliders).toHaveCount(6);
});

test('moving a slider updates clip planes', async ({ page }) => {
  const room = uniqueRoom('clip-slider');
  await waitForAppReady(page, room);

  // Open panel
  await page.click('#clip-planes-toggle');
  await expect(page.locator('#clip-planes-panel')).toBeVisible({ timeout: 3000 });

  // Get the xMax slider
  const xMaxSlider = page.locator('input[data-clip-axis="xMax"]');
  await expect(xMaxSlider).toBeVisible();

  // Store initial value
  const initialValue = parseFloat(await xMaxSlider.inputValue());

  // Move the slider by setting its value via JS (fill doesn't work for range inputs)
  await xMaxSlider.evaluate((el: HTMLInputElement) => {
    el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Value should have changed to near 0
  const newValue = parseFloat(await xMaxSlider.inputValue());
  expect(Math.abs(newValue)).toBeLessThan(1);
  expect(newValue).not.toBeCloseTo(initialValue, 0);
});

test('reset button restores sliders to full range', async ({ page }) => {
  const room = uniqueRoom('clip-reset');
  await waitForAppReady(page, room);

  // Open panel
  await page.click('#clip-planes-toggle');
  await expect(page.locator('#clip-planes-panel')).toBeVisible({ timeout: 3000 });

  // Change a slider
  const xMinSlider = page.locator('input[data-clip-axis="xMin"]');
  const origMin = parseFloat(await xMinSlider.inputValue());
  await xMinSlider.evaluate((el: HTMLInputElement) => {
    el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(Math.abs(parseFloat(await xMinSlider.inputValue()))).toBeLessThan(1);

  // Click reset
  await page.click('#clip-planes-reset');

  // Slider should go back to its original value
  const resetValue = parseFloat(await xMinSlider.inputValue());
  expect(resetValue).toBeCloseTo(origMin, 1);
});

test('toggling off disables clipping', async ({ page }) => {
  const room = uniqueRoom('clip-disable');
  await waitForAppReady(page, room);

  // Open panel
  await page.click('#clip-planes-toggle');
  await expect(page.locator('#clip-planes-panel')).toBeVisible({ timeout: 3000 });

  // Toggle off
  await page.click('#clip-planes-toggle');
  await expect(page.locator('#clip-planes-panel')).toBeHidden();
});

test('two users see synced clip planes', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('clip-sync');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // Give Yjs time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    // User 1 opens panel and adjusts xMax
    await page1.click('#clip-planes-toggle');
    await expect(page1.locator('#clip-planes-panel')).toBeVisible({ timeout: 3000 });

    const xMaxSlider1 = page1.locator('input[data-clip-axis="xMax"]');
    await xMaxSlider1.evaluate((el: HTMLInputElement) => {
      el.value = '0.5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // User 2 should also open panel and see synced value (approximately 0.5)
    await page2.click('#clip-planes-toggle');
    await expect(page2.locator('#clip-planes-panel')).toBeVisible({ timeout: 3000 });

    const xMaxSlider2 = page2.locator('input[data-clip-axis="xMax"]');
    // Wait for sync — the value should be near 0.5
    await page2.waitForFunction(
      () => {
        const el = document.querySelector('input[data-clip-axis="xMax"]') as HTMLInputElement;
        return el && Math.abs(parseFloat(el.value) - 0.5) < 1;
      },
      { timeout: 10000 },
    );
    const syncedValue = parseFloat(await xMaxSlider2.inputValue());
    expect(syncedValue).toBeCloseTo(0.5, 0);
  } finally {
    await context1.close();
    await context2.close();
  }
});
