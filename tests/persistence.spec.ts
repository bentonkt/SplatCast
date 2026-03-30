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
}

test('annotations persist after all users disconnect and rejoin', async ({ browser }) => {
  const room = uniqueRoom('persist');

  // Session 1: place an annotation pin
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await waitForAppReady(page1, room);
  await page1.waitForSelector('#pin-overlay', { timeout: 5000 });

  const box = await page1.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Give Yjs WebSocket time to connect
  await page1.waitForTimeout(500);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await page1.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page1.locator(pinSelector)).toHaveCount(1, { timeout: 5000 });

  // Disconnect — close the context so the server saves state
  await ctx1.close();

  // Small delay for the server to finish writing to disk
  await new Promise(resolve => setTimeout(resolve, 500));

  // Session 2: rejoin the same room — pin should still be there
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await waitForAppReady(page2, room);
  await page2.waitForSelector('#pin-overlay', { timeout: 5000 });

  // Give Yjs time to sync the persisted doc state
  await page2.waitForTimeout(1000);

  await expect(page2.locator(pinSelector)).toHaveCount(1, { timeout: 10000 });

  await ctx2.close();
});

test('multiple annotations persist across reconnects', async ({ browser }) => {
  const room = uniqueRoom('persist-multi');

  // Session 1: place multiple annotations
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await waitForAppReady(page1, room);
  await page1.waitForSelector('#pin-overlay', { timeout: 5000 });

  const box = await page1.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page1.waitForTimeout(500);

  const pinSelector = '#pin-overlay > div[data-annotation-type="pin"]';
  await page1.mouse.dblclick(box.x + 100, box.y + 100);
  await page1.mouse.dblclick(box.x + 200, box.y + 200);
  await page1.mouse.dblclick(box.x + 300, box.y + 300);
  await expect(page1.locator(pinSelector)).toHaveCount(3, { timeout: 5000 });

  await ctx1.close();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Session 2: all three pins should be persisted
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await waitForAppReady(page2, room);
  await page2.waitForSelector('#pin-overlay', { timeout: 5000 });
  await page2.waitForTimeout(1000);

  await expect(page2.locator(pinSelector)).toHaveCount(3, { timeout: 10000 });

  await ctx2.close();
});
