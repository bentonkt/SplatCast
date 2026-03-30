import { test, expect } from '@playwright/test';

let roomCounter = 0;
function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now()}-${roomCounter++}`;
}

test('lobby page shows when visiting root URL', async ({ page }) => {
  await page.goto('/');
  const lobby = page.locator('#lobby');
  await expect(lobby).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#create-room-btn')).toBeVisible();
  await expect(page.locator('#room-id-input')).toBeVisible();
  await expect(page.locator('#join-room-btn')).toBeVisible();
  // Canvas should be hidden on lobby
  await expect(page.locator('canvas#canvas')).toBeHidden();
});

test('create room button navigates to /room/<id>', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#lobby')).toBeVisible({ timeout: 5000 });

  await page.locator('#create-room-btn').click();

  // Should navigate to /room/<generated-id>
  await page.waitForURL(/\/room\/[a-z0-9]+/, { timeout: 5000 });

  // Canvas should be visible (viewer mode)
  await expect(page.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
});

test('join room via input navigates to /room/<id>', async ({ page }) => {
  const roomId = uniqueRoom('join-test');
  await page.goto('/');
  await expect(page.locator('#lobby')).toBeVisible({ timeout: 5000 });

  await page.locator('#room-id-input').fill(roomId);
  await page.locator('#join-room-btn').click();

  await page.waitForURL(`/room/${roomId}`, { timeout: 5000 });
  await expect(page.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });
});

test('join room via Enter key navigates to /room/<id>', async ({ page }) => {
  const roomId = uniqueRoom('enter-test');
  await page.goto('/');
  await expect(page.locator('#lobby')).toBeVisible({ timeout: 5000 });

  await page.locator('#room-id-input').fill(roomId);
  await page.locator('#room-id-input').press('Enter');

  await page.waitForURL(`/room/${roomId}`, { timeout: 5000 });
  await expect(page.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });
});

test('direct URL /room/<id> loads viewer without lobby', async ({ page }) => {
  const roomId = uniqueRoom('direct-url');
  await page.goto(`/room/${roomId}`);

  // Should show canvas directly, no lobby
  await expect(page.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });

  // Lobby should not be visible
  const lobby = page.locator('#lobby');
  await expect(lobby).not.toHaveClass(/active/);
});

test('two users joining same room via URL share annotations', async ({ browser }) => {
  const room = uniqueRoom('room-sync');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    // Both users navigate to the same room URL
    await page1.goto(`/room/${room}`);
    await page2.goto(`/room/${room}`);

    await expect(page1.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });
    await expect(page2.locator('canvas#canvas')).toBeVisible({ timeout: 10000 });

    await page1.waitForFunction(() => {
      const c = document.getElementById('canvas') as HTMLCanvasElement;
      return c && c.width > 0 && c.height > 0;
    }, { timeout: 10000 });
    await page2.waitForFunction(() => {
      const c = document.getElementById('canvas') as HTMLCanvasElement;
      return c && c.width > 0 && c.height > 0;
    }, { timeout: 10000 });

    await page1.waitForSelector('#pin-overlay', { timeout: 5000 });
    await page2.waitForSelector('#pin-overlay', { timeout: 5000 });

    // Give Yjs WebSocket time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
    const baseline = await page2.locator(pinSelector).count();

    // User 1 places a pin
    await page1.mouse.dblclick(box.x + 200, box.y + 200);

    // Pin should sync to user 2
    await expect(page2.locator(pinSelector)).toHaveCount(baseline + 1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
