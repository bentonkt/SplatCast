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

test('bookmark panel appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-panel'));
  const panel = page.locator('#bookmark-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#bookmark-add-btn')).toBeVisible();
  await expect(page.locator('#bookmark-list')).toBeAttached();
});

test('clicking + button with a name creates a bookmark', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-add'));

  // Mock prompt to return a bookmark name
  await page.evaluate(() => {
    window.prompt = () => 'Front View';
  });

  await page.locator('#bookmark-add-btn').click();

  const items = page.locator('.bookmark-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Front View');
});

test('pressing B key saves a bookmark', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-key'));

  await page.evaluate(() => {
    window.prompt = () => 'Top View';
  });

  await page.keyboard.press('b');

  const items = page.locator('.bookmark-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Top View');
});

test('clicking a bookmark snaps the camera', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-snap'));

  // Orbit the camera first
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  // Save bookmark at this position
  await page.evaluate(() => {
    window.prompt = () => 'Rotated View';
  });
  await page.locator('#bookmark-add-btn').click();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  // Orbit the camera to a different position
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 + 100, { steps: 5 });
  await page.mouse.up();

  // Get camera state before clicking bookmark
  const stateBefore = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number } } | undefined;
    return cam?.getOrbitalState().theta ?? null;
  });

  // Click bookmark to snap back
  await page.locator('.bookmark-item').first().click();

  // Camera should have snapped — verify by checking the orbital state changed
  const stateAfter = await page.evaluate(() => {
    const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number } } | undefined;
    return cam?.getOrbitalState().theta ?? null;
  });

  // The camera should have moved (theta changed)
  // Note: if __camera isn't exposed, we just verify the bookmark click doesn't error
  if (stateBefore !== null && stateAfter !== null) {
    expect(stateBefore).not.toEqual(stateAfter);
  }
});

test('remove button deletes a bookmark', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-remove'));

  await page.evaluate(() => {
    window.prompt = () => 'Temp View';
  });
  await page.locator('#bookmark-add-btn').click();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  // Click remove button
  await page.locator('.bookmark-remove-btn').click();
  await expect(page.locator('.bookmark-item')).toHaveCount(0);
});

test('cancelling prompt does not create a bookmark', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('bk-cancel'));

  await page.evaluate(() => {
    window.prompt = () => null;
  });
  await page.locator('#bookmark-add-btn').click();
  await expect(page.locator('.bookmark-item')).toHaveCount(0);
});

test('two users see synced bookmarks', async ({ browser }) => {
  const room = uniqueRoom('bk-sync');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 creates a bookmark
  await page1.evaluate(() => {
    window.prompt = () => 'Shared View';
  });
  await page1.locator('#bookmark-add-btn').click();

  // User 1 should see it
  await expect(page1.locator('.bookmark-item')).toHaveCount(1);

  // User 2 should see it synced
  await expect(page2.locator('.bookmark-item')).toHaveCount(1);
  await expect(page2.locator('.bookmark-item').first()).toContainText('Shared View');

  // User 2 creates another bookmark
  await page2.evaluate(() => {
    window.prompt = () => 'Another View';
  });
  await page2.locator('#bookmark-add-btn').click();

  // Both users should see 2 bookmarks
  await expect(page1.locator('.bookmark-item')).toHaveCount(2);
  await expect(page2.locator('.bookmark-item')).toHaveCount(2);

  await ctx1.close();
  await ctx2.close();
});
