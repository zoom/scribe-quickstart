import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        testTimeout: 300_000, // 5 min — batch jobs can take a while to complete
        hookTimeout: 120_000, // 2 min — cloudflared startup + user interaction
        globalSetup: './src/test-setup.ts',
        reporters: ['verbose'],
    },
})
