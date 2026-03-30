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

test('undo/redo toolbar appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('undo-toolbar'));
  const toolbar = page.locator('#undo-redo-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(page.locator('#undo-btn')).toBeVisible();
  await expect(page.locator('#redo-btn')).toBeVisible();
});

test('undo button is disabled when no actions taken', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('undo-disabled'));
  const undoBtn = page.locator('#undo-btn');
  await expect(undoBtn).toBeVisible();
  const opacity = await undoBtn.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeLessThan(0.5);
});

test('undo removes an annotation pin', async ({ page }) => {
  const room = uniqueRoom('undo-pin');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place a pin via double-click
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.dblclick(cx, cy);

  // Pin should exist
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Undo button should now be enabled
  const undoBtn = page.locator('#undo-btn');
  const opacity = await undoBtn.evaluate((el) => getComputedStyle(el).opacity);
  expect(parseFloat(opacity)).toBeGreaterThan(0.5);

  // Click undo
  await undoBtn.click();

  // Pin should be removed
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);
});

test('redo restores an undone annotation pin', async ({ page }) => {
  const room = uniqueRoom('redo-pin');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.dblclick(cx, cy);

  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Undo
  await page.locator('#undo-btn').click();
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);

  // Redo
  await page.locator('#redo-btn').click();
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
});

test('Ctrl+Z undoes an annotation', async ({ page }) => {
  const room = uniqueRoom('undo-keyboard');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.dblclick(cx, cy);

  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Ctrl+Z to undo
  await page.keyboard.press('Control+z');

  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);
});

test('Ctrl+Shift+Z redoes an annotation', async ({ page }) => {
  const room = uniqueRoom('redo-keyboard');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.dblclick(cx, cy);

  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Undo then redo via keyboard
  await page.keyboard.press('Control+z');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+Z');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);
});

test('undo works for multiple annotations', async ({ page }) => {
  const room = uniqueRoom('undo-multi');
  await waitForAppReady(page, room);

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Place two pins with a delay so Yjs UndoManager treats them as separate items
  await page.mouse.dblclick(box.x + box.width / 3, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Wait for UndoManager capture timeout (default 500ms)
  await page.waitForTimeout(600);

  await page.mouse.dblclick(box.x + (box.width * 2) / 3, box.y + box.height / 2);
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(2);

  // Undo first one
  await page.keyboard.press('Control+z');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Undo second one
  await page.keyboard.press('Control+z');
  await expect(page.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(0);
});

test('two users — undo only affects own annotations', async ({ browser }) => {
  const room = uniqueRoom('undo-multiuser');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  const canvas1 = page1.locator('canvas#canvas');
  const box1 = await canvas1.boundingBox();
  if (!box1) throw new Error('Canvas bounding box not found');

  const canvas2 = page2.locator('canvas#canvas');
  const box2 = await canvas2.boundingBox();
  if (!box2) throw new Error('Canvas bounding box not found');

  // User 1 places a pin
  await page1.mouse.dblclick(box1.x + box1.width / 3, box1.y + box1.height / 2);
  await expect(page1.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // Wait for sync to user 2
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // User 2 places a pin
  await page2.mouse.dblclick(box2.x + (box2.width * 2) / 3, box2.y + box2.height / 2);
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(2);

  // Wait for sync to user 1
  await expect(page1.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(2);

  // User 2 undoes — should only remove user 2's pin
  await page2.keyboard.press('Control+z');
  await expect(page2.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  // User 1 should also see only 1 pin
  await expect(page1.locator('#pin-overlay').locator('[data-annotation-type="pin"]')).toHaveCount(1);

  await ctx1.close();
  await ctx2.close();
});
