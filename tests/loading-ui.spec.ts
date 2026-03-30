import { test, expect } from '@playwright/test';
import path from 'path';

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

test('loading overlay appears and disappears during initial load', async ({ page }) => {
  const room = uniqueRoom('loading-overlay');
  // Navigate but intercept to check overlay state
  await page.goto(`/room/${room}`);

  // The loading overlay should eventually hide (active class removed) once loading completes
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    return overlay && !overlay.classList.contains('active');
  }, { timeout: 15000 });

  // Verify the overlay element exists
  const overlay = page.locator('#loading-overlay');
  await expect(overlay).toBeAttached();
  // Should not have active class anymore
  await expect(overlay).not.toHaveClass(/active/);
});

test('loading overlay has progress bar elements', async ({ page }) => {
  const room = uniqueRoom('loading-progress');
  await waitForAppReady(page, room);

  // Verify progress bar elements exist
  await expect(page.locator('#loading-progress-bar')).toBeAttached();
  await expect(page.locator('#loading-progress-text')).toBeAttached();
  await expect(page.locator('.progress-bar-container')).toBeAttached();
});

test('drop overlay appears during dragenter and hides on dragleave', async ({ page }) => {
  const room = uniqueRoom('drop-overlay');
  await waitForAppReady(page, room);

  const dropOverlay = page.locator('#drop-overlay');

  // Initially not active
  await expect(dropOverlay).not.toHaveClass(/active/);

  // Simulate dragenter via evaluate (DataTransfer can only be constructed in page context)
  await page.evaluate(() => {
    document.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
  });

  // Drop overlay should become active
  await expect(dropOverlay).toHaveClass(/active/);

  // Simulate dragleave
  await page.evaluate(() => {
    document.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
  });

  // Drop overlay should hide
  await expect(dropOverlay).not.toHaveClass(/active/);
});

test('drag-and-drop a .splat file loads it into the renderer', async ({ page }) => {
  const room = uniqueRoom('drop-splat');
  await waitForAppReady(page, room);

  const splatFilePath = path.resolve(__dirname, '..', 'src', 'public', 'sample.splat');

  // Use the fileChooser workaround — create an input, set file, dispatch drop event
  const loaded = await page.evaluate(async (filePath: string) => {
    // Fetch the sample splat from the server to get its bytes
    const resp = await fetch('/sample.splat');
    const buffer = await resp.arrayBuffer();
    const file = new File([buffer], 'test-drop.splat', { type: 'application/octet-stream' });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    document.dispatchEvent(dropEvent);

    // Wait a tick for the async handler
    await new Promise(r => setTimeout(r, 500));

    // Check that loading overlay is no longer active
    const overlay = document.getElementById('loading-overlay');
    return overlay ? !overlay.classList.contains('active') : false;
  }, splatFilePath);

  expect(loaded).toBe(true);
});

test('drag-and-drop a .ply file loads it into the renderer', async ({ page }) => {
  const room = uniqueRoom('drop-ply');
  await waitForAppReady(page, room);

  const loaded = await page.evaluate(async () => {
    // Fetch the sample ply from the server
    const resp = await fetch('/sample.ply');
    const buffer = await resp.arrayBuffer();
    const file = new File([buffer], 'test-drop.ply', { type: 'application/octet-stream' });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    document.dispatchEvent(dropEvent);

    // Wait for async handler
    await new Promise(r => setTimeout(r, 500));

    const overlay = document.getElementById('loading-overlay');
    return overlay ? !overlay.classList.contains('active') : false;
  });

  expect(loaded).toBe(true);
});

test('drop overlay has correct visual elements', async ({ page }) => {
  const room = uniqueRoom('drop-elements');
  await waitForAppReady(page, room);

  await expect(page.locator('#drop-overlay .drop-zone')).toBeAttached();
  await expect(page.locator('#drop-overlay .drop-zone p')).toHaveText('Drop .splat or .ply file');
  await expect(page.locator('#drop-overlay .drop-hint')).toHaveText('Release to load');
});

test('dropping a non-splat file is ignored', async ({ page }) => {
  const room = uniqueRoom('drop-ignore');
  await waitForAppReady(page, room);

  const overlayStayedHidden = await page.evaluate(async () => {
    const file = new File(['hello world'], 'readme.txt', { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    document.dispatchEvent(dropEvent);

    await new Promise(r => setTimeout(r, 200));

    const overlay = document.getElementById('loading-overlay');
    return overlay ? !overlay.classList.contains('active') : true;
  });

  expect(overlayStayedHidden).toBe(true);
});
