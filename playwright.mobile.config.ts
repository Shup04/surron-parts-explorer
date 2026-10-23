import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Build first: service-worker recovery is intentionally disabled in next dev.
export default defineConfig({
  ...base,
  testMatch: ['mobile-app.spec.ts', 'app-install.spec.ts'],
  metadata: { production: true },
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:31397' },
  webServer: {
    command: 'npm run start -- --port 31397',
    url: 'http://127.0.0.1:31397',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
