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

test('export JSON button appears in toolbar', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('export'));
  const btn = page.locator('#export-json-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('{}');
});

test('export CSV button appears in toolbar', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('export'));
  const btn = page.locator('#export-csv-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('CSV');
});

test('clicking JSON export triggers download with valid JSON', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  // Place an annotation first
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Click export JSON
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-json-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-export-\d+\.json$/);

  // Validate JSON content
  const content = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(content).toString('utf-8');
  const data = JSON.parse(text);

  expect(data).toHaveProperty('exportedAt');
  expect(data).toHaveProperty('annotations');
  expect(data).toHaveProperty('threads');
  expect(data).toHaveProperty('strokes');
  expect(data).toHaveProperty('bookmarks');
  expect(Array.isArray(data.annotations)).toBe(true);
  expect(data.annotations.length).toBeGreaterThan(0);

  // Check annotation has 3D coordinates
  const ann = data.annotations[0];
  expect(ann).toHaveProperty('position');
  expect(ann.position).toHaveLength(3);
  expect(ann).toHaveProperty('type');
  expect(ann).toHaveProperty('userId');
});

test('clicking CSV export triggers download with valid CSV', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  // Place an annotation
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Click export CSV
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-csv-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-export-\d+\.csv$/);

  // Validate CSV content
  const content = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(content).toString('utf-8');
  const lines = text.trim().split('\n');

  // Header + at least 1 data row
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines[0]).toContain('category');
  expect(lines[0]).toContain('type');
  expect(lines[0]).toContain('x');
  expect(lines[0]).toContain('y');
  expect(lines[0]).toContain('z');

  // Data row should be an annotation
  expect(lines[1]).toContain('annotation');
});

test('pressing E key triggers JSON export', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('e');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-export-\d+\.json$/);
});

test('E key does not trigger export when input is focused', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  // Place a pin and open label editor
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Click on the pin to open label editor
  const pin = page.locator('#pin-overlay > div[data-annotation-type="pin"]');
  await expect(pin).toHaveCount(1);
  await pin.click();

  const input = page.locator('#pin-label-input');
  await expect(input).toBeVisible();

  // Type 'e' in the input — should NOT trigger download
  let downloadTriggered = false;
  page.on('download', () => { downloadTriggered = true; });
  await page.keyboard.press('e');
  await page.waitForTimeout(500);

  expect(downloadTriggered).toBe(false);
});

test('JSON export includes bookmarks with camera data', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  // Create a bookmark
  await page.evaluate(() => {
    window.prompt = () => 'Test Bookmark';
  });
  await page.keyboard.press('b');
  await page.waitForTimeout(300);

  // Export JSON
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-json-btn').click();
  const download = await downloadPromise;

  const content = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(content).toString('utf-8');
  const data = JSON.parse(text);

  expect(data.bookmarks.length).toBeGreaterThan(0);
  const bm = data.bookmarks[0];
  expect(bm).toHaveProperty('name', 'Test Bookmark');
  expect(bm).toHaveProperty('theta');
  expect(bm).toHaveProperty('phi');
  expect(bm).toHaveProperty('radius');
  expect(bm).toHaveProperty('target');
  expect(bm.target).toHaveLength(3);
});

test('JSON export includes thread replies linked to parent', async ({ page }) => {
  const room = uniqueRoom('export');
  await waitForAppReady(page, room);

  // Place a pin
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(300);

  // Click pin to open thread, add a reply
  const pinDot = page.locator('.pin-dot').first();
  await pinDot.click();
  await page.waitForSelector('#thread-panel', { timeout: 3000 });

  const replyInput = page.locator('#thread-reply-input');
  await replyInput.fill('Test reply');
  await replyInput.press('Enter');
  await page.waitForTimeout(300);

  // Close thread panel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Export JSON
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-json-btn').click();
  const download = await downloadPromise;

  const content = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(content).toString('utf-8');
  const data = JSON.parse(text);

  // Should have threads
  const threadKeys = Object.keys(data.threads);
  expect(threadKeys.length).toBeGreaterThan(0);

  const thread = data.threads[threadKeys[0]];
  expect(thread).toHaveProperty('parent');
  expect(thread).toHaveProperty('replies');
  expect(thread.replies.length).toBeGreaterThan(0);
  expect(thread.replies[0].parentId).toBe(thread.parent.id);
});
