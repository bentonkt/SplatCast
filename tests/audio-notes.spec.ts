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

test('audio mode button appears in toolbar', async ({ page }) => {
  const room = uniqueRoom('audio-btn');
  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await expect(audioBtn).toBeVisible();
  await expect(audioBtn).toHaveText('\u{1F3A4}');
});

test('clicking audio button activates audio mode', async ({ page }) => {
  const room = uniqueRoom('audio-mode');
  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();
  await expect(audioBtn).toHaveCSS('border-color', 'rgb(78, 205, 196)');

  // Other mode buttons should be deactivated
  const pinBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="pin"]');
  await expect(pinBtn).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
});

test('double-click in audio mode triggers recording UI', async ({ page, context }) => {
  const room = uniqueRoom('audio-record');

  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  // Mock getUserMedia to return a fake audio stream
  await page.addInitScript(() => {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        // Create a silent audio stream using AudioContext
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();
        return dest.stream;
      }
      return origGetUserMedia(constraints);
    };
  });

  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();

  // Double-click on canvas to start recording
  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  // Recording overlay should appear
  const recordingOverlay = page.locator('#audio-recording-overlay');
  await expect(recordingOverlay).toBeVisible({ timeout: 5000 });

  // Stop button should be present
  const stopBtn = page.locator('#audio-stop-btn');
  await expect(stopBtn).toBeVisible();
});

test('stopping recording creates audio annotation', async ({ page, context }) => {
  const room = uniqueRoom('audio-create');

  await context.grantPermissions(['microphone']);

  await page.addInitScript(() => {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();
        return dest.stream;
      }
      return origGetUserMedia(constraints);
    };
  });

  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  // Wait for recording overlay
  const recordingOverlay = page.locator('#audio-recording-overlay');
  await expect(recordingOverlay).toBeVisible({ timeout: 5000 });

  // Click stop
  const stopBtn = page.locator('#audio-stop-btn');
  await stopBtn.click();

  // Recording overlay should disappear
  await expect(recordingOverlay).not.toBeVisible({ timeout: 5000 });

  // Audio annotation should appear in pin overlay
  const audioAnnotations = page.locator('#pin-overlay > div[data-annotation-type="audio"]');
  await expect(audioAnnotations).toHaveCount(1, { timeout: 5000 });
});

test('audio annotation shows speaker icon', async ({ page, context }) => {
  const room = uniqueRoom('audio-icon');

  await context.grantPermissions(['microphone']);

  await page.addInitScript(() => {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();
        return dest.stream;
      }
      return origGetUserMedia(constraints);
    };
  });

  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#audio-recording-overlay')).toBeVisible({ timeout: 5000 });
  await page.locator('#audio-stop-btn').click();

  // Check speaker icon
  const audioIcon = page.locator('#pin-overlay > div[data-annotation-type="audio"] .audio-icon');
  await expect(audioIcon).toBeVisible({ timeout: 5000 });
  await expect(audioIcon).toHaveText('\u{1F50A}');
});

test('clicking audio annotation triggers playback', async ({ page, context }) => {
  const room = uniqueRoom('audio-play');

  await context.grantPermissions(['microphone']);

  // Track Audio.play calls
  await page.addInitScript(() => {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();
        return dest.stream;
      }
      return origGetUserMedia(constraints);
    };

    (window as Record<string, unknown>).__audioPlayCount = 0;
    const OrigAudio = window.Audio;
    class MockAudio extends OrigAudio {
      play(): Promise<void> {
        (window as Record<string, unknown>).__audioPlayCount =
          ((window as Record<string, unknown>).__audioPlayCount as number) + 1;
        return Promise.resolve();
      }
    }
    window.Audio = MockAudio as typeof Audio;
  });

  await waitForAppReady(page, room);

  const audioBtn = page.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();

  const canvas = page.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#audio-recording-overlay')).toBeVisible({ timeout: 5000 });
  await page.locator('#audio-stop-btn').click();

  // Wait for annotation to appear
  const audioAnnotation = page.locator('#pin-overlay > div[data-annotation-type="audio"]');
  await expect(audioAnnotation).toHaveCount(1, { timeout: 5000 });

  // Click the audio annotation to play
  await audioAnnotation.click();

  // Verify Audio.play was called
  const playCount = await page.evaluate(() =>
    (window as Record<string, unknown>).__audioPlayCount as number
  );
  expect(playCount).toBe(1);
});

test('two users see synced audio annotations', async ({ browser }) => {
  const room = uniqueRoom('audio-sync');

  const ctx1 = await browser.newContext({ permissions: ['microphone'] });
  const ctx2 = await browser.newContext();

  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  // Mock getUserMedia on page1
  await page1.addInitScript(() => {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();
        return dest.stream;
      }
      return origGetUserMedia(constraints);
    };
  });

  await waitForAppReady(page1, room);
  await waitForAppReady(page2, room);

  // User 1 creates audio annotation
  const audioBtn = page1.locator('#annotation-toolbar .toolbar-btn[data-mode="audio"]');
  await audioBtn.click();

  const canvas = page1.locator('canvas#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page1.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page1.locator('#audio-recording-overlay')).toBeVisible({ timeout: 5000 });
  await page1.locator('#audio-stop-btn').click();

  // User 1 should see the audio annotation
  const audio1 = page1.locator('#pin-overlay > div[data-annotation-type="audio"]');
  await expect(audio1).toHaveCount(1, { timeout: 5000 });

  // User 2 should also see the synced audio annotation
  const audio2 = page2.locator('#pin-overlay > div[data-annotation-type="audio"]');
  await expect(audio2).toHaveCount(1, { timeout: 10000 });

  await ctx1.close();
  await ctx2.close();
});
