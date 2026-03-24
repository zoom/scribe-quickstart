import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        testTimeout: 60_000, // 60s for real Zoom API calls
        hookTimeout: 30_000,
        reporters: ['verbose'],
    },
})
