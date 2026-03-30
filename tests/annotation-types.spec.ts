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

test('annotation toolbar renders with mode buttons and screenshot', async ({ page }) => {
  const room = uniqueRoom('toolbar');
  await waitForAppReady(page, room);
  const buttons = page.locator('#annotation-toolbar .toolbar-btn');
  await expect(buttons).toHaveCount(5);
});

test('clicking toolbar buttons switches annotation mode', async ({ page }) => {
  const room = uniqueRoom('toolbar-switch');
  await waitForAppReady(page, room);

  const pinBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="pin"]');
  const arrowBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]');
  const textBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]');

  await arrowBtn.click();
  await expect(arrowBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');

  await textBtn.click();
  await expect(textBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');

  await pinBtn.click();
  await expect(pinBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');
});

test('pin mode — double-click creates pin annotation', async ({ page }) => {
  const room = uniqueRoom('pin-create');
  await waitForAppReady(page, room);

  const pins = page.locator('#pin-overlay > div[data-annotation-type="pin"]');
  const initialCount = await pins.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(pins).toHaveCount(initialCount + 1, { timeout: 5000 });
});

test('arrow mode — two double-clicks create arrow annotation', async ({ page }) => {
  const room = uniqueRoom('arrow-create');
  await waitForAppReady(page, room);

  const arrows = page.locator('#pin-overlay > svg[data-annotation-type="arrow"]');
  const initialCount = await arrows.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]').click();

  await page.mouse.dblclick(box.x + 100, box.y + 200);
  await page.mouse.dblclick(box.x + 300, box.y + 200);

  await expect(arrows).toHaveCount(initialCount + 1, { timeout: 5000 });
});

test('text mode — double-click with prompt creates text label', async ({ page }) => {
  const room = uniqueRoom('text-create');
  await waitForAppReady(page, room);

  const textLabels = page.locator('#pin-overlay > div[data-annotation-type="text"]');
  const initialCount = await textLabels.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]').click();

  page.on('dialog', (dialog) => dialog.accept('Hello World'));
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  await expect(textLabels).toHaveCount(initialCount + 1, { timeout: 5000 });
  await expect(textLabels.last()).toHaveText('Hello World');
});

test('text mode — cancelling prompt does not create annotation', async ({ page }) => {
  const room = uniqueRoom('text-cancel');
  await waitForAppReady(page, room);

  const textLabels = page.locator('#pin-overlay > div[data-annotation-type="text"]');
  const initialCount = await textLabels.count();

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]').click();

  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });

  await page.mouse.dblclick(box.x + 200, box.y + 200);

  await page.waitForTimeout(500);
  await expect(textLabels).toHaveCount(initialCount);
});

test('two users see synced arrow annotations', async ({ browser }) => {
  const room = uniqueRoom('arrow-sync');
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    const arrows1 = page1.locator('#pin-overlay > svg[data-annotation-type="arrow"]');
    const arrows2 = page2.locator('#pin-overlay > svg[data-annotation-type="arrow"]');
    const initialCount1 = await arrows1.count();
    const initialCount2 = await arrows2.count();

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    await page1.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]').click();
    await page1.mouse.dblclick(box.x + 100, box.y + 150);
    await page1.mouse.dblclick(box.x + 300, box.y + 150);

    await expect(arrows1).toHaveCount(initialCount1 + 1, { timeout: 5000 });
    await expect(arrows2).toHaveCount(initialCount2 + 1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
