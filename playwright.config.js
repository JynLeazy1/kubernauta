import { defineConfig, devices } from '@playwright/test'

const baselineSpecs = /(routes|content)\.spec\.ts/

export default defineConfig({
  testDir: './qa/tests',
  // Text baselines are shared by every browser and OS: one file per page and language.
  snapshotPathTemplate: '{testDir}/../baseline/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    // Fixed so dates and the default language render the same locally and in CI.
    locale: 'es-MX',
    timezoneId: 'UTC',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && vite preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Route and content baselines do not depend on the browser, so only
    // chromium runs them; the other projects run the UI flow tests.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: baselineSpecs },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: baselineSpecs },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testIgnore: baselineSpecs },
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] }, testIgnore: baselineSpecs },
  ],
})
