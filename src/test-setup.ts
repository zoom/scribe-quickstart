/**
 * Vitest globalSetup — runs once before all test files.
 *
 * 1. Starts the Express server on port 4000 (so cloudflared has something to tunnel to).
 * 2. Launches `cloudflared tunnel --url http://localhost:4000` and parses the tunnel URL.
 * 3. Prints the webhook URL and waits for the user to register it in the Zoom Marketplace
 *    before the tests begin.
 *
 * If cloudflared is not installed the setup still succeeds — batch completion tests
 * are skipped automatically when TEST_TUNNEL_URL is not set.
 */

import { spawn, type ChildProcess } from 'child_process'
import http from 'http'
import readline from 'readline'

let server: http.Server | undefined
let cf: ChildProcess | undefined

export async function setup() {
    // util.ts calls dotenv.config() when index.ts is imported, so .env is loaded here.
    const { app } = await import('./index.js')

    // Start a real TCP server so cloudflared can forward inbound webhooks to it.
    await new Promise<void>((resolve, reject) => {
        server = app.listen(4000, '127.0.0.1', () => resolve())
        server.on('error', reject)
    })
    console.log('\n[setup] backend listening on http://localhost:4000')

    try {
        const tunnelUrl = await launchCloudflared()
        process.env.TEST_TUNNEL_URL = tunnelUrl
        const webhookUrl = `${tunnelUrl}/webhooks/scribe`

        const line = '─'.repeat(68)
        console.log(`\n┌${line}┐`)
        console.log(`│  WEBHOOK SETUP REQUIRED${' '.repeat(44)}│`)
        console.log(`├${line}┤`)
        console.log(`│  Webhook URL:                                                      │`)
        console.log(`│  ${webhookUrl.padEnd(66)}│`)
        console.log(`│                                                                    │`)
        console.log(`│  Steps:                                                            │`)
        console.log(`│  1. Open Zoom Marketplace → your app → Feature → Event Subscriptions│`)
        console.log(`│  2. Set "Event notification endpoint URL" to the URL above         │`)
        console.log(`│  3. Save and come back here                                        │`)
        console.log(`└${line}┘`)

        await waitForEnter('Press Enter after updating the webhook URL in Zoom Marketplace...')
    } catch (err) {
        console.warn(`\n[setup] cloudflared not available: ${(err as Error).message}`)
        console.warn('[setup] Batch completion tests will be skipped (TEST_TUNNEL_URL not set)\n')
    }
}

export async function teardown() {
    cf?.kill()
    await new Promise<void>(r => (server ? server!.close(() => r()) : r()))
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function launchCloudflared(): Promise<string> {
    return new Promise((resolve, reject) => {
        cf = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:4000'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        const timer = setTimeout(
            () => reject(new Error('cloudflared did not emit a URL within 30 s')),
            30_000,
        )

        const scan = (buf: Buffer) => {
            const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
            if (m) {
                clearTimeout(timer)
                resolve(m[0])
            }
        }

        cf.stdout?.on('data', scan)
        cf.stderr?.on('data', scan)
        cf.on('error', err => { clearTimeout(timer); reject(err) })
    })
}

function waitForEnter(prompt: string): Promise<void> {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question(`\n${prompt} `, () => { rl.close(); resolve() })
    })
}
