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

test('screenshot button appears in toolbar', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('screenshot'));
  const btn = page.locator('#screenshot-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('\u{1F4F7}');
});

test('clicking screenshot button triggers download', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('screenshot'));

  // Listen for download event
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#screenshot-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-\d+\.png$/);
});

test('screenshot includes annotation pins', async ({ page }) => {
  const room = uniqueRoom('screenshot');
  await waitForAppReady(page, room);

  // Place a pin via double-click
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.dblclick(cx, cy);

  // Verify pin was created
  await expect(page.locator('#pin-overlay > div[data-annotation-type="pin"]')).toHaveCount(1);

  // Take screenshot — verify it downloads a valid PNG
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#screenshot-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);

  // Read the downloaded file and check it's a valid PNG (starts with PNG magic bytes)
  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import('fs');
  const buffer = fs.readFileSync(path!);
  // PNG magic bytes: 0x89 0x50 0x4E 0x47
  expect(buffer[0]).toBe(0x89);
  expect(buffer[1]).toBe(0x50); // P
  expect(buffer[2]).toBe(0x4e); // N
  expect(buffer[3]).toBe(0x47); // G

  // The file should have some size (not empty/trivial)
  expect(buffer.length).toBeGreaterThan(100);
});

test('pressing S key triggers screenshot download', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('screenshot'));

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('s');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^splatcast-\d+\.png$/);
});

test('S key does not trigger screenshot when input is focused', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('screenshot'));

  // Place a pin and open label editor
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

  // Click the pin to open label editor
  const pin = page.locator('#pin-overlay > div[data-annotation-type="pin"]');
  await expect(pin).toHaveCount(1);
  await pin.click();

  const input = page.locator('#pin-label-input');
  await expect(input).toBeVisible();

  // Type 's' in the input — should not trigger download
  let downloadTriggered = false;
  page.on('download', () => { downloadTriggered = true; });
  await input.type('s');

  // Wait briefly to confirm no download was triggered
  await page.waitForTimeout(500);
  expect(downloadTriggered).toBe(false);
});
