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

test('cursor overlay is created on page load', async ({ page }) => {
  const room = uniqueRoom('cursor-overlay');
  await waitForAppReady(page, room);
  await page.waitForSelector('#cursor-overlay', { timeout: 5000 });
  const overlay = page.locator('#cursor-overlay');
  await expect(overlay).toBeVisible();
});

test('moving mouse does not create local cursor dot', async ({ page }) => {
  const room = uniqueRoom('cursor-local');
  await waitForAppReady(page, room);
  await page.waitForSelector('#cursor-overlay', { timeout: 5000 });

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Move mouse around — local cursor should NOT appear in overlay (only remote cursors do)
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.move(box.x + 200, box.y + 200);

  // Wait a bit to ensure no cursor appears
  await page.waitForTimeout(500);

  const cursors = page.locator('#cursor-overlay .remote-cursor');
  await expect(cursors).toHaveCount(0);
});

test('two users see each other\'s cursors', async ({ browser }) => {
  const room = uniqueRoom('cursor-sync');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForSelector('#cursor-overlay', { timeout: 5000 });
    await page2.waitForSelector('#cursor-overlay', { timeout: 5000 });

    // Give Yjs WebSocket time to connect on both clients
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // Move mouse on page1
    await page1.mouse.move(box.x + 200, box.y + 200);

    // Page2 should see a remote cursor from page1
    const remoteCursors = page2.locator('#cursor-overlay .remote-cursor');
    await expect(remoteCursors).toHaveCount(1, { timeout: 10000 });

    // The cursor dot should be visible
    const dot = page2.locator('#cursor-overlay .remote-cursor .cursor-dot');
    await expect(dot).toBeVisible();

    // The cursor label should show user name
    const label = page2.locator('#cursor-overlay .remote-cursor .cursor-label');
    await expect(label).toBeVisible();
    const labelText = await label.textContent();
    expect(labelText).toMatch(/^User /);
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('cursor disappears when mouse leaves canvas', async ({ browser }) => {
  const room = uniqueRoom('cursor-leave');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await page1.waitForSelector('#cursor-overlay', { timeout: 5000 });
    await page2.waitForSelector('#cursor-overlay', { timeout: 5000 });

    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // Move mouse on page1 — cursor should appear on page2
    await page1.mouse.move(box.x + 200, box.y + 200);
    await expect(page2.locator('#cursor-overlay .remote-cursor')).toHaveCount(1, { timeout: 10000 });

    // Dispatch mouseleave on page1's canvas to simulate leaving
    await page1.evaluate(() => {
      const canvas = document.getElementById('canvas');
      canvas?.dispatchEvent(new MouseEvent('mouseleave'));
    });

    // The cursor should be hidden on page2
    await expect(page2.locator('#cursor-overlay .remote-cursor:visible')).toHaveCount(0, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
