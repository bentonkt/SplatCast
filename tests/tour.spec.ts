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
}

async function addBookmark(page: import('@playwright/test').Page, name: string) {
  await page.evaluate((n) => {
    window.prompt = () => n;
  }, name);
  await page.locator('#bookmark-add-btn').click();
}

test('tour play button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('tour-btn'));
  const btn = page.locator('#tour-play-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('\u25B6');
});

test('tour does not start with fewer than 2 bookmarks', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('tour-min'));
  await addBookmark(page, 'Only One');
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  await page.locator('#tour-play-btn').click();

  // Tour indicator should NOT appear
  const indicator = page.locator('#tour-indicator');
  await expect(indicator).toBeHidden();
  // Button should still show play icon
  await expect(page.locator('#tour-play-btn')).toHaveText('\u25B6');
});

test('tour plays through bookmarks with camera animation', async ({ page }) => {
  const room = uniqueRoom('tour-play');
  await waitForAppReady(page, room);

  // Create 2 bookmarks at different camera positions
  await addBookmark(page, 'Start');
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  // Orbit camera to a different position
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await addBookmark(page, 'End');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);

  // Start tour
  await page.locator('#tour-play-btn').click();

  // Tour indicator should appear with first bookmark name
  const indicator = page.locator('#tour-indicator');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('Start');
  await expect(indicator).toContainText('1/2');

  // Button should show stop icon
  await expect(page.locator('#tour-play-btn')).toHaveText('\u23F9');

  // Wait for tour to advance to second bookmark
  await expect(indicator).toContainText('End', { timeout: 10000 });
  await expect(indicator).toContainText('2/2');

  // Wait for tour to complete and indicator to hide
  await expect(indicator).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#tour-play-btn')).toHaveText('\u25B6');
});

test('pressing T key toggles tour', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('tour-key'));

  await addBookmark(page, 'A');
  await addBookmark(page, 'B');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);

  // Press T to start
  await page.keyboard.press('t');
  const indicator = page.locator('#tour-indicator');
  await expect(indicator).toBeVisible();

  // Press T again to stop
  await page.keyboard.press('t');
  await expect(indicator).toBeHidden();
  await expect(page.locator('#tour-play-btn')).toHaveText('\u25B6');
});

test('tour stop button stops playback', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('tour-stop'));

  await addBookmark(page, 'First');
  await addBookmark(page, 'Second');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);

  await page.locator('#tour-play-btn').click();
  await expect(page.locator('#tour-indicator')).toBeVisible();

  // Stop the tour
  await page.locator('#tour-play-btn').click();
  await expect(page.locator('#tour-indicator')).toBeHidden();
  await expect(page.locator('#tour-play-btn')).toHaveText('\u25B6');
});

test('two users see synced tour playback', async ({ browser }) => {
  const room = uniqueRoom('tour-sync');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 creates bookmarks
  await addBookmark(page1, 'ViewA');
  await addBookmark(page1, 'ViewB');
  await expect(page1.locator('.bookmark-item')).toHaveCount(2);
  await expect(page2.locator('.bookmark-item')).toHaveCount(2);

  // User 1 starts tour
  await page1.locator('#tour-play-btn').click();

  // Both users should see the tour indicator
  await expect(page1.locator('#tour-indicator')).toBeVisible();
  await expect(page2.locator('#tour-indicator')).toBeVisible({ timeout: 5000 });

  // User 2's indicator should show tour content
  await expect(page2.locator('#tour-indicator')).toContainText('Tour:');

  // User 1 stops
  await page1.locator('#tour-play-btn').click();
  await expect(page1.locator('#tour-indicator')).toBeHidden();
  await expect(page2.locator('#tour-indicator')).toBeHidden({ timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});
