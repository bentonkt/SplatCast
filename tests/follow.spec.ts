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
  await page.waitForSelector('#presence-sidebar', { timeout: 5000 });
}

test('follow button appears for remote users', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('follow-btn');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    // Wait for both users to appear
    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Follow button should appear for the remote user (not local)
    const followBtns = page1.locator('.follow-btn');
    await expect(followBtns).toHaveCount(1, { timeout: 5000 });
    await expect(followBtns.first()).toHaveText('Follow');
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('clicking follow shows follow banner and unfollow button', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('follow-banner');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Click follow on remote user
    await page1.locator('.follow-btn').first().click();

    // Follow banner should appear
    await expect(page1.locator('#follow-banner')).toBeVisible({ timeout: 3000 });
    await expect(page1.locator('#follow-banner')).toContainText('Following');

    // Unfollow button in banner
    await expect(page1.locator('#unfollow-btn')).toBeVisible();

    // Follow button in sidebar should now say "Unfollow"
    await expect(page1.locator('.follow-btn').first()).toHaveText('Unfollow');
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('following user camera syncs to followed user camera', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('follow-cam');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Get page2's initial camera state
    const cam2Before = await page2.evaluate(() => {
      const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number; phi: number; radius: number } };
      return cam.getOrbitalState();
    });

    // Orbit page2's camera significantly
    const canvas2 = page2.locator('canvas#canvas');
    const box2 = await canvas2.boundingBox();
    await page2.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2);
    await page2.mouse.down();
    await page2.mouse.move(box2!.x + box2!.width / 2 + 200, box2!.y + box2!.height / 2, { steps: 5 });
    await page2.mouse.up();

    // Wait a tick for broadcast
    await page2.waitForTimeout(200);

    // Verify page2's camera actually changed
    const cam2After = await page2.evaluate(() => {
      const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number; phi: number; radius: number } };
      return cam.getOrbitalState();
    });
    expect(Math.abs(cam2After.theta - cam2Before.theta)).toBeGreaterThan(0.1);

    // Get page1's camera before follow
    const cam1Before = await page1.evaluate(() => {
      const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number; phi: number; radius: number } };
      return cam.getOrbitalState();
    });

    // Click follow on page1 to follow page2's user
    await page1.locator('.follow-btn').first().click();
    await expect(page1.locator('#follow-banner')).toBeVisible({ timeout: 3000 });

    // Wait for camera sync
    await page1.waitForTimeout(500);

    // Page1's camera should now match page2's camera
    const cam1After = await page1.evaluate(() => {
      const cam = (window as Record<string, unknown>)['__camera'] as { getOrbitalState: () => { theta: number; phi: number; radius: number } };
      return cam.getOrbitalState();
    });

    // Theta should have changed to match page2
    expect(Math.abs(cam1After.theta - cam2After.theta)).toBeLessThan(0.1);
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('clicking unfollow stops camera sync', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('follow-unfollow');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Follow remote user
    await page1.locator('.follow-btn').first().click();
    await expect(page1.locator('#follow-banner')).toBeVisible({ timeout: 3000 });

    // Click unfollow banner button
    await page1.locator('#unfollow-btn').click();

    // Banner should disappear
    await expect(page1.locator('#follow-banner')).toHaveCount(0, { timeout: 3000 });

    // Follow button should say "Follow" again
    await expect(page1.locator('.follow-btn').first()).toHaveText('Follow');
  } finally {
    await context1.close();
    await context2.close();
  }
});

test('mouse interaction unfollows automatically', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    const room = uniqueRoom('follow-auto-unfollow');
    await waitForAppReady(page1, room);
    await waitForAppReady(page2, room);

    await expect(page1.locator('#presence-count')).toHaveText('2', { timeout: 10000 });

    // Follow remote user
    await page1.locator('.follow-btn').first().click();
    await expect(page1.locator('#follow-banner')).toBeVisible({ timeout: 3000 });

    // Click on canvas (mousedown on canvas triggers unfollow)
    const canvas1 = page1.locator('canvas#canvas');
    const box1 = await canvas1.boundingBox();
    await page1.mouse.click(box1!.x + box1!.width / 2, box1!.y + box1!.height / 2);

    // Banner should disappear
    await expect(page1.locator('#follow-banner')).toHaveCount(0, { timeout: 3000 });
  } finally {
    await context1.close();
    await context2.close();
  }
});
