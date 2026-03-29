import { test, expect } from '@playwright/test';

async function waitForAppReady(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('canvas#canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.getElementById('canvas') as HTMLCanvasElement;
    return c && c.width > 0 && c.height > 0;
  }, { timeout: 10000 });
  await page.waitForSelector('#annotation-toolbar', { timeout: 5000 });
  await page.waitForSelector('#pin-overlay', { timeout: 5000 });
}

test('annotation toolbar renders with three mode buttons', async ({ page }) => {
  await waitForAppReady(page);
  const buttons = page.locator('#annotation-toolbar .toolbar-btn');
  await expect(buttons).toHaveCount(3);
});

test('clicking toolbar buttons switches annotation mode', async ({ page }) => {
  await waitForAppReady(page);

  // Pin mode is active by default — its border should be highlighted
  const pinBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="pin"]');
  const arrowBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]');
  const textBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]');

  // Switch to arrow mode
  await arrowBtn.click();
  await expect(arrowBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');

  // Switch to text mode
  await textBtn.click();
  await expect(textBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');

  // Switch back to pin
  await pinBtn.click();
  await expect(pinBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');
});

test('pin mode — double-click creates pin annotation', async ({ page }) => {
  await waitForAppReady(page);

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const pins = page.locator('#pin-overlay > div[data-annotation-type="pin"]');
  await expect(pins).toHaveCount(1, { timeout: 5000 });
});

test('arrow mode — two double-clicks create arrow annotation', async ({ page }) => {
  await waitForAppReady(page);

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Switch to arrow mode
  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]').click();

  // First double-click: arrow start
  await page.mouse.dblclick(box.x + 100, box.y + 200);
  // Second double-click: arrow end
  await page.mouse.dblclick(box.x + 300, box.y + 200);

  const arrows = page.locator('#pin-overlay > svg[data-annotation-type="arrow"]');
  await expect(arrows).toHaveCount(1, { timeout: 5000 });
});

test('text mode — double-click with prompt creates text label', async ({ page }) => {
  await waitForAppReady(page);

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Switch to text mode
  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]').click();

  // prompt() is synchronous and blocks the dblclick — handle concurrently
  page.on('dialog', (dialog) => dialog.accept('Hello World'));
  await page.mouse.dblclick(box.x + 200, box.y + 200);

  const textLabels = page.locator('#pin-overlay > div[data-annotation-type="text"]');
  await expect(textLabels).toHaveCount(1, { timeout: 5000 });
  await expect(textLabels.first()).toHaveText('Hello World');
});

test('text mode — cancelling prompt does not create annotation', async ({ page }) => {
  await waitForAppReady(page);

  const box = await page.locator('canvas#canvas').boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');

  // Switch to text mode
  await page.locator('#annotation-toolbar .toolbar-btn[data-mode="text"]').click();

  // Dismiss the prompt
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });

  await page.mouse.dblclick(box.x + 200, box.y + 200);

  // Wait a moment for any potential annotation to appear
  await page.waitForTimeout(500);
  const textLabels = page.locator('#pin-overlay > div[data-annotation-type="text"]');
  await expect(textLabels).toHaveCount(0);
});

test('two users see synced arrow annotations', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    await waitForAppReady(page1);
    await waitForAppReady(page2);

    const box = await page1.locator('canvas#canvas').boundingBox();
    if (!box) throw new Error('Canvas bounding box not found');

    // Give Yjs WebSocket time to connect
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    // Switch page1 to arrow mode and place an arrow
    await page1.locator('#annotation-toolbar .toolbar-btn[data-mode="arrow"]').click();
    await page1.mouse.dblclick(box.x + 100, box.y + 150);
    await page1.mouse.dblclick(box.x + 300, box.y + 150);

    // Verify arrow on page1
    await expect(page1.locator('#pin-overlay > svg[data-annotation-type="arrow"]'))
      .toHaveCount(1, { timeout: 5000 });

    // Verify sync to page2
    await expect(page2.locator('#pin-overlay > svg[data-annotation-type="arrow"]'))
      .toHaveCount(1, { timeout: 10000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
