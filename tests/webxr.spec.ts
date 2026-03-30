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

test('webxr toggle button appears on room load', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-btn'));
  const btn = page.locator('#webxr-toggle-btn');
  await expect(btn).toBeVisible();
});

test('clicking toggle shows webxr panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-panel'));
  await page.locator('#webxr-toggle-btn').click();
  const panel = page.locator('#webxr-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('WebXR Immersive');
});

test('pressing W key toggles webxr panel', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-key'));
  const panel = page.locator('#webxr-panel');

  await page.keyboard.press('w');
  await expect(panel).toBeVisible();

  await page.keyboard.press('w');
  await expect(panel).toBeHidden();
});

test('W key does not toggle when input is focused', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-input'));
  const panel = page.locator('#webxr-panel');

  // Open panel first
  await page.keyboard.press('w');
  await expect(panel).toBeVisible();

  // Focus the mode select
  await page.locator('#webxr-mode-select').focus();
  await page.keyboard.press('w');
  // Panel should still be visible — key should not toggle
  await expect(panel).toBeVisible();
});

test('panel shows status and mode selector', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-status'));
  await page.locator('#webxr-toggle-btn').click();
  const panel = page.locator('#webxr-panel');
  await expect(panel).toBeVisible();

  // Status label exists
  const status = page.locator('#webxr-status');
  await expect(status).toBeVisible();

  // Mode selector exists with VR and AR options
  const modeSelect = page.locator('#webxr-mode-select');
  await expect(modeSelect).toBeVisible();
  const options = modeSelect.locator('option');
  await expect(options).toHaveCount(2);
});

test('enter XR button exists and is disabled without XR support', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-enter'));
  await page.locator('#webxr-toggle-btn').click();

  const enterBtn = page.locator('#webxr-enter-btn');
  await expect(enterBtn).toBeVisible();
  await expect(enterBtn).toContainText('Enter XR');

  // In headless Chromium, WebXR is not available, so button should be disabled
  await expect(enterBtn).toBeDisabled();
});

test('status shows unsupported message in non-XR browser', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-unsupported'));
  await page.locator('#webxr-toggle-btn').click();

  const status = page.locator('#webxr-status');
  // Wait for async detection to complete
  await expect(status).not.toHaveText('Detecting...');
  // Should show an error/unsupported message since headless has no XR
  const text = await status.textContent();
  expect(text).toBeTruthy();
  // Either "WebXR not available" or "No VR/AR sessions supported"
  expect(
    text!.includes('not available') || text!.includes('not supported') || text!.includes('No VR/AR')
  ).toBeTruthy();
});

test('exit XR button is hidden by default', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-exit'));
  await page.locator('#webxr-toggle-btn').click();

  const exitBtn = page.locator('#webxr-exit-btn');
  await expect(exitBtn).toBeHidden();
});

test('panel shows XR Immersive title with correct styling', async ({ page }) => {
  await waitForAppReady(page, uniqueRoom('xr-title'));
  await page.locator('#webxr-toggle-btn').click();

  const panel = page.locator('#webxr-panel');
  await expect(panel).toContainText('WebXR Immersive');
  await expect(panel).toContainText('Status:');
  await expect(panel).toContainText('Mode:');
});

test('two users see synced XR awareness state', async ({ browser }) => {
  const room = uniqueRoom('xr-sync');
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // Wait for both users to sync
  await page1.waitForTimeout(600);

  // User 1 sets XR awareness state manually (since we can't enter real XR)
  await page1.evaluate(() => {
    const sync = (window as Record<string, unknown>)['__syncManager'] as {
      awareness: { setLocalStateField: (field: string, value: unknown) => void };
    };
    sync.awareness.setLocalStateField('xr', { active: true, mode: 'immersive-vr' });
    sync.awareness.setLocalStateField('presence', {
      userId: 'test-user-1',
      color: '#ff0000',
      name: 'VR User',
      role: 'editor',
    });
  });

  // User 2 should see the remote XR user info
  await page2.locator('#webxr-toggle-btn').click();
  const info = page2.locator('#webxr-remote-info');
  await expect(info).toBeVisible({ timeout: 5000 });
  await expect(info).toContainText('VR User');
  await expect(info).toContainText('VR');

  await ctx1.close();
  await ctx2.close();
});
