import { defineConfig } from '@playwright/test';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=swiftshader',
      ],
    },
  },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      port: 4000,
      reuseExistingServer: true,
      cwd: projectRoot,
    },
    {
      command: 'npx vite --port 3000',
      port: 3000,
      reuseExistingServer: true,
      cwd: projectRoot,
    },
  ],
});
