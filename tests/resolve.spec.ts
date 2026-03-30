import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

async function waitForAppReady(page: import('@playwright/test').Page, room?: string) {
  const url = room ? `/room/${room}` : '/';
  await page.goto(url);
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
  await page.waitForSelector('#annotation-toolbar', { timeout: 5000 });
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

test('resolve filter button appears in toolbar', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('resolve'));
  const btn = page.locator('#resolve-filter-btn');
  await expect(btn).toBeVisible();
});

test('pin has resolve button that toggles resolved state', async ({ page }) => {
  const room = uniqueRoom('resolve');
  await waitForAppReady(page, room);

  // Place a pin
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Find the resolve button on the pin
  const resolveBtn = page.locator('.resolve-btn');
  await expect(resolveBtn).toBeVisible();
  await expect(resolveBtn).toHaveText('\u2713');

  // Click resolve
  await resolveBtn.click();

  // Pin should now be resolved — dot should be dimmed (opacity 0.5)
  const dot = page.locator('.pin-dot');
  const opacity = await dot.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeLessThan(1);

  // Resolve button should now show unresolve icon
  const updatedBtn = page.locator('.resolve-btn');
  await expect(updatedBtn).toHaveText('\u21A9');
});

test('resolved pin is hidden when filter is toggled off', async ({ page }) => {
  const room = uniqueRoom('resolve');
  await waitForAppReady(page, room);

  // Place a pin
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Resolve the pin
  await page.locator('.resolve-btn').click();
  await expect(page.locator('.resolve-btn')).toHaveText('\u21A9');

  // Toggle filter off (hide resolved)
  await page.locator('#resolve-filter-btn').click();

  // Pin should be hidden
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);

  // Toggle filter back on
  await page.locator('#resolve-filter-btn').click();

  // Pin should reappear
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
});

test('pressing R key toggles resolve filter', async ({ page }) => {
  const room = uniqueRoom('resolve');
  await waitForAppReady(page, room);

  // Place and resolve a pin
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
  await page.locator('.resolve-btn').click();

  // Press R to hide resolved
  await page.keyboard.press('r');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);

  // Press R again to show resolved
  await page.keyboard.press('r');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
});

test('unresolved pin remains visible when filter hides resolved', async ({ page }) => {
  const room = uniqueRoom('resolve');
  await waitForAppReady(page, room);

  // Place two pins
  const canvas = page.locator('canvas#canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.dblclick(box.x + box.width * 2 / 3, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(2);

  // Resolve only the first pin
  const resolveBtns = page.locator('.resolve-btn');
  await resolveBtns.first().click();

  // Toggle filter to hide resolved
  await page.locator('#resolve-filter-btn').click();

  // Only the unresolved pin should remain
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
});

test('two users see synced resolve state', async ({ browser }) => {
  const room = uniqueRoom('resolve-sync');

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 places a pin
  const canvas1 = page1.locator('canvas#canvas');
  const box1 = (await canvas1.boundingBox())!;
  await page1.mouse.dblclick(box1.x + box1.width / 2, box1.y + box1.height / 2);

  // User 2 should see the pin
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1, { timeout: 5000 });

  // User 1 resolves the pin
  await page1.locator('.resolve-btn').click();

  // User 2 should see the pin is now resolved (dimmed)
  await expect(page2.locator('.resolve-btn')).toHaveText('\u21A9', { timeout: 5000 });

  // User 2 toggles filter to hide resolved
  await page2.locator('#resolve-filter-btn').click();
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);

  // User 1 unresolves the pin
  await page1.locator('.resolve-btn').click();

  // User 2 should see it reappear (filter hides resolved, but pin is now unresolved)
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1, { timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});
