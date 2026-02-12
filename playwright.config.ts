import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/lib/components/shader/tests',
  snapshotPathTemplate: '{testDir}/.generated-screenshots/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 4,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    contextOptions: {
      // Disable animations so screenshots are comparable
      reducedMotion: 'reduce'
    }
  },
  expect: {
    timeout: 30_000
  },
  projects: [
    {
      name: 'Firefox <No WebGPU>',
      use: {
        ...devices['Desktop Firefox']
      }
    },
    {
      name: 'Chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          args: ['--high-dpi-support=1', '--force-device-scale-factor=1']
        }
      }
    },
    {
      name: 'WebKit <No WebGPU>',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'pnpm dev',
    port: 5180,
    reuseExistingServer: !process.env.CI
  }
});
