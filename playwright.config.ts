import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const candidate = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = existsSync(candidate) ? candidate : undefined;
// In sandboxes that export HTTPS_PROXY, Chromium's tunnel through it resets; go direct instead.
const args = process.env.HTTPS_PROXY || process.env.https_proxy ? ['--no-proxy-server'] : [];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    launchOptions: { ...(executablePath ? { executablePath } : {}), args },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
