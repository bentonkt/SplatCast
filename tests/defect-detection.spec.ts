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

test('defect detection toggle button appears on room load', async ({ page }) => {
  const room = uniqueRoom('defect-toggle');
  await waitForAppReady(page, room);

  const toggleBtn = page.locator('#defect-toggle');
  await expect(toggleBtn).toBeVisible({ timeout: 3000 });
});

test('clicking toggle shows defect panel', async ({ page }) => {
  const room = uniqueRoom('defect-panel');
  await waitForAppReady(page, room);

  const panel = page.locator('#defect-panel');
  await expect(panel).toBeHidden();

  await page.click('#defect-toggle');
  await expect(panel).toBeVisible({ timeout: 3000 });

  // Should have sensitivity slider, run button, count label
  await expect(page.locator('#defect-sensitivity')).toBeVisible();
  await expect(page.locator('#defect-run-btn')).toBeVisible();
  await expect(page.locator('#defect-count')).toBeVisible();
});

test('pressing G key toggles defect panel', async ({ page }) => {
  const room = uniqueRoom('defect-key');
  await waitForAppReady(page, room);

  const panel = page.locator('#defect-panel');
  await expect(panel).toBeHidden();

  await page.keyboard.press('g');
  await expect(panel).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('g');
  await expect(panel).toBeHidden();
});

test('G key does not toggle when input is focused', async ({ page }) => {
  const room = uniqueRoom('defect-key-input');
  await waitForAppReady(page, room);

  const panel = page.locator('#defect-panel');
  await expect(panel).toBeHidden();

  // Focus the sensitivity slider (it's an input)
  await page.click('#defect-toggle');
  await expect(panel).toBeVisible({ timeout: 3000 });

  await page.focus('#defect-sensitivity');
  await page.keyboard.press('g');
  // Panel should still be visible because G was pressed while input focused
  await expect(panel).toBeVisible();
});

test('clicking Run Analysis detects defects in loaded scene', async ({ page }) => {
  const room = uniqueRoom('defect-run');
  await waitForAppReady(page, room);

  await page.click('#defect-toggle');
  await expect(page.locator('#defect-panel')).toBeVisible({ timeout: 3000 });

  // Run detection
  await page.click('#defect-run-btn');

  // Wait for analysis to complete — count label should update
  await page.waitForFunction(() => {
    const label = document.getElementById('defect-count');
    return label && label.textContent !== 'No defects detected';
  }, { timeout: 10000 });

  const countText = await page.locator('#defect-count').textContent();
  expect(countText).toMatch(/\d+ defects? found/);
});

test('defect markers appear in overlay after analysis', async ({ page }) => {
  const room = uniqueRoom('defect-markers');
  await waitForAppReady(page, room);

  await page.click('#defect-toggle');
  await expect(page.locator('#defect-panel')).toBeVisible({ timeout: 3000 });

  await page.click('#defect-run-btn');

  // Wait for markers to appear in the overlay
  await page.waitForFunction(() => {
    const overlay = document.getElementById('defect-overlay');
    return overlay && overlay.children.length > 0;
  }, { timeout: 10000 });

  const markerCount = await page.locator('#defect-overlay .defect-marker').count();
  expect(markerCount).toBeGreaterThan(0);
});

test('defect list shows items after analysis', async ({ page }) => {
  const room = uniqueRoom('defect-list');
  await waitForAppReady(page, room);

  await page.click('#defect-toggle');
  await page.click('#defect-run-btn');

  await page.waitForFunction(() => {
    const list = document.getElementById('defect-list');
    return list && list.children.length > 0;
  }, { timeout: 10000 });

  const itemCount = await page.locator('#defect-list .defect-item').count();
  expect(itemCount).toBeGreaterThan(0);
});

test('sensitivity slider changes value label', async ({ page }) => {
  const room = uniqueRoom('defect-sensitivity');
  await waitForAppReady(page, room);

  await page.click('#defect-toggle');
  await expect(page.locator('#defect-panel')).toBeVisible({ timeout: 3000 });

  // Default sensitivity value is 2.0
  const valueLabel = page.locator('#defect-sensitivity-value');
  await expect(valueLabel).toHaveText('2.0');

  // Move slider via JavaScript (range inputs don't support fill)
  await page.evaluate(() => {
    const slider = document.getElementById('defect-sensitivity') as HTMLInputElement;
    slider.value = '3.0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(valueLabel).toHaveText('3.0');
});

test('two users see synced defect results', async ({ browser }) => {
  const room = uniqueRoom('defect-sync');

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 opens defect panel and runs analysis
  await page1.click('#defect-toggle');
  await expect(page1.locator('#defect-panel')).toBeVisible({ timeout: 3000 });
  await page1.click('#defect-run-btn');

  // Wait for user 1 to complete analysis
  await page1.waitForFunction(() => {
    const label = document.getElementById('defect-count');
    return label && label.textContent !== 'No defects detected';
  }, { timeout: 10000 });

  // User 2 opens panel — should see synced defect count
  await page2.click('#defect-toggle');
  await expect(page2.locator('#defect-panel')).toBeVisible({ timeout: 3000 });

  // Wait for synced defects to arrive at user 2
  await page2.waitForFunction(() => {
    const label = document.getElementById('defect-count');
    return label && label.textContent !== 'No defects detected';
  }, { timeout: 10000 });

  const count1 = await page1.locator('#defect-count').textContent();
  const count2 = await page2.locator('#defect-count').textContent();
  expect(count1).toBe(count2);

  await ctx1.close();
  await ctx2.close();
});
