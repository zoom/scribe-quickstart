/**
 * Integration tests for the Scribe Quickstart backend.
 *
 * Every request is forwarded all the way to the Zoom Scribe API.
 * The test-setup.ts globalSetup starts the real server on port 4000 and
 * launches a cloudflared tunnel so Zoom can reach the /webhooks/scribe
 * endpoint. After confirming the URL is registered in the Zoom Marketplace
 * the tests run.
 *
 * Prerequisites (.env):
 *   ZOOM_API_KEY, ZOOM_API_SECRET, AWS_*, S3_INPUT_URI, S3_OUTPUT_URI
 */

import { describe, test, expect } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { app } from './index.js'

// ─── env ──────────────────────────────────────────────────────────────────────

const S3_INPUT    = process.env.S3_INPUT_URI  ?? 's3://my-bucket'
const S3_OUTPUT   = process.env.S3_OUTPUT_URI ?? 's3://my-bucket/transcripts'
const AWS_KEY     = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET  = process.env.AWS_SECRET_ACCESS_KEY
const AWS_TOKEN   = process.env.AWS_SESSION_TOKEN
const LANGUAGE    = process.env.LANGUAGE ?? 'en-US'
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'https://example.com/hooks/scribe'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid 1-second silent PCM WAV (44-byte header + zero samples). */
function createSilentWav(durationSec = 1, sampleRate = 16_000): Buffer {
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8
    const numSamples = Math.floor(sampleRate * durationSec)
    const dataSize = numSamples * blockAlign

    const buf = Buffer.alloc(44 + dataSize)

    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)             // PCM
    buf.writeUInt16LE(numChannels, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(byteRate, 28)
    buf.writeUInt16LE(blockAlign, 32)
    buf.writeUInt16LE(bitsPerSample, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(dataSize, 40)

    return buf
}

const WAV = createSilentWav()

/**
 * For requests our server forwards to Zoom, we accept:
 *   200 / 201 / 204 — Zoom accepted it
 *   502             — Zoom rejected it (bad creds, wrong S3 URI, etc.)
 * A 4xx or 5xx from *our* server would mean a bug in payload handling.
 */
function expectForwarded(status: number) {
    expect([200, 201, 204, 502]).toContain(status)
}

/**
 * Poll GET /batch/jobs/:jobId until the job reaches a terminal state
 * (SUCCEEDED, FAILED, or PARTIAL) or the timeout expires.
 */
async function waitForJobCompletion(jobId: string, maxWaitMs = 5 * 60_000): Promise<string> {
    const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'PARTIAL'])
    const deadline = Date.now() + maxWaitMs

    while (Date.now() < deadline) {
        const res = await request(app).get(`/batch/jobs/${jobId}`)
        const state: string | undefined = res.body?.state
        if (res.status === 200 && state && TERMINAL.has(state)) return state
        console.log(`  [poll] ${jobId}: ${state ?? '?'} — checking again in 10 s`)
        await new Promise(r => setTimeout(r, 10_000))
    }
    throw new Error(`Job ${jobId} did not reach a terminal state within ${maxWaitMs / 60_000} min`)
}

// Shared job ID set by the first batch/create test that returns 201
let batchJobId: string | undefined

// ─── POST /transcribe ─────────────────────────────────────────────────────────

describe('POST /transcribe', () => {
    test('missing file → 400', async () => {
        const res = await request(app).post('/transcribe').send()
        expect(res.status).toBe(400)
        expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    test('WAV file, no config field (server default language)', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ result: expect.any(Object) })
        console.log('[transcribe] no config →', res.body)
    })

    test('WAV file, explicit language: en-US', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: 'en-US' }))

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ result: expect.any(Object) })
        console.log('[transcribe] en-US →', res.body)
    })

    test('WAV file, channel_separation: false', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: LANGUAGE, channel_separation: false }))

        expect(res.status).toBe(200)
        console.log('[transcribe] channel_separation:false →', res.body)
    })

    test('WAV file, channel_separation: true', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: LANGUAGE, channel_separation: true }))

        expect(res.status).toBe(200)
        console.log('[transcribe] channel_separation:true →', res.body)
    })

    test('WAV file, malformed config JSON (server falls back to default)', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', 'NOT_VALID_JSON')

        expect(res.status).toBe(200)
        console.log('[transcribe] malformed config →', res.body)
    })
})

// ─── POST /batch/jobs ─────────────────────────────────────────────────────────

describe('POST /batch/jobs', () => {
    // Note: Zoom API constraints discovered during testing:
    //   • SINGLE input requires output layout: PREFIX
    //   • PREFIX input + ADJACENT layout must NOT include a separate output URI
    //   • MANIFEST input requires output layout: PREFIX

    test('SINGLE mode – S3 input + PREFIX output, env AWS creds', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE env-creds →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('SINGLE mode – inline AWS credentials (key + secret)', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                    auth: { aws: { access_key_id: AWS_KEY, secret_access_key: AWS_SECRET } },
                },
                output: {
                    uri: S3_OUTPUT,
                    layout: 'PREFIX',
                    auth: { aws: { access_key_id: AWS_KEY, secret_access_key: AWS_SECRET } },
                },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE inline-creds →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('SINGLE mode – inline AWS credentials with session token', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                    auth: { aws: { access_key_id: AWS_KEY, secret_access_key: AWS_SECRET, session_token: AWS_TOKEN } },
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE session-token →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('PREFIX mode – include + exclude glob filters, PREFIX output', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'PREFIX',
                    uri: `${S3_INPUT}/`,
                    filters: {
                        include_globs: ['**/*.wav', '**/*.mp3'],
                        exclude_globs: ['**/tmp/**', '*_draft.*'],
                    },
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] PREFIX filters →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('PREFIX mode – include globs only, PREFIX output', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'PREFIX',
                    uri: `${S3_INPUT}/`,
                    filters: { include_globs: ['**/*.flac'] },
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] PREFIX include-only →', res.status, res.body)
    })

    test('PREFIX mode – ADJACENT output layout (no separate output URI)', async () => {
        // ADJACENT: transcripts written next to each input file; no output URI allowed.
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'PREFIX', uri: `${S3_INPUT}/` },
                output: { layout: 'ADJACENT' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] PREFIX+ADJACENT →', res.status, res.body)
    })

    test('MANIFEST mode – S3 URIs list', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'MANIFEST',
                    manifest: [
                        `${S3_INPUT}/file1.wav`,
                        `${S3_INPUT}/file2.mp3`,
                        `${S3_INPUT}/file3.m4a`,
                    ],
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] MANIFEST S3 →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('MANIFEST mode – HTTP URIs', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'MANIFEST',
                    manifest: [
                        process.env.TEST_PUBLIC_URL,
                        process.env.TEST_PUBLIC_URL,
                    ],
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] MANIFEST HTTP →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })

    test('SINGLE mode – with reference_id', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                reference_id: 'test-run-001',
            })

        expectForwarded(res.status)
        console.log('[batch/create] reference_id →', res.status, res.body)
    })

    test('SINGLE mode – webhook notifications, no secret', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                notifications: { webhook_url: WEBHOOK_URL },
            })

        expectForwarded(res.status)
        console.log('[batch/create] webhook no-secret →', res.status, res.body)
    })

    test('SINGLE mode – webhook notifications + HMAC secret', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                notifications: {
                    webhook_url: WEBHOOK_URL,
                    secret: process.env.WEBHOOK_SECRET ?? 'my-hmac-secret',
                },
            })

        expectForwarded(res.status)
        console.log('[batch/create] webhook+secret →', res.status, res.body)
    })

    test('output overwrite: true', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX', overwrite: true },
            })

        expectForwarded(res.status)
        console.log('[batch/create] overwrite:true →', res.status, res.body)
    })

    test('non-default language: fr-FR', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                config: { language: 'fr-FR' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] lang fr-FR →', res.status, res.body)
    })

    test('full payload – all optional fields set', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'PREFIX',
                    uri: `${S3_INPUT}/`,
                    filters: {
                        include_globs: ['**/*.wav', '**/*.mp3', '**/*.m4a', '**/*.flac'],
                        exclude_globs: ['**/tmp/**'],
                    },
                    auth: {
                        aws: {
                            access_key_id: AWS_KEY,
                            secret_access_key: AWS_SECRET,
                            ...(AWS_TOKEN && { session_token: AWS_TOKEN }),
                        },
                    },
                },
                output: {
                    destination: 'S3',
                    uri: S3_OUTPUT,
                    layout: 'PREFIX',
                    overwrite: false,
                    auth: {
                        aws: {
                            access_key_id: AWS_KEY,
                            secret_access_key: AWS_SECRET,
                            ...(AWS_TOKEN && { session_token: AWS_TOKEN }),
                        },
                    },
                },
                config: { language: LANGUAGE, channel_separation: false },
                reference_id: 'full-payload-test',
                notifications: {
                    webhook_url: WEBHOOK_URL,
                    secret: process.env.WEBHOOK_SECRET ?? 'hmac-secret',
                },
            })

        expectForwarded(res.status)
        console.log('[batch/create] full payload →', res.status, res.body)
        if (res.status === 201) batchJobId ??= res.body.job_id
    })
})

// ─── Batch job completion (polls until terminal state) ────────────────────────

describe('Batch job completion', () => {
    test('job reaches SUCCEEDED, PARTIAL or FAILED within 5 minutes', async () => {
        const tunnelUrl = process.env.TEST_TUNNEL_URL
        if (!tunnelUrl) {
            console.log('[batch/complete] skipping — TEST_TUNNEL_URL not set (cloudflared not running)')
            return
        }

        // Submit a PREFIX job that scans the entire input bucket.
        // The webhook URL points to the cloudflared tunnel → localhost:4000/webhooks/scribe
        // so Zoom will notify the local server when the job finishes.
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'PREFIX',
                    uri: `${S3_INPUT}/`,
                    filters: { include_globs: ['**/*.wav', '**/*.mp3', '**/*.m4a', '**/*.flac'] },
                },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
                config: { language: LANGUAGE },
                notifications: {
                    webhook_url: `${tunnelUrl}/webhooks/scribe`,
                    secret: process.env.WEBHOOK_SECRET,
                },
            })

        expect(res.status).toBe(201)
        const jobId: string = res.body.job_id
        console.log(`[batch/complete] job created: ${jobId} (${res.body.state})`)
        console.log(`[batch/complete] webhook: ${tunnelUrl}/webhooks/scribe`)

        // Poll until the job finishes; webhook events will arrive at the real server
        // on port 4000 (handled by /webhooks/scribe in index.ts and logged there).
        const finalState = await waitForJobCompletion(jobId)
        console.log(`[batch/complete] job ${jobId} finished → ${finalState}`)

        // Fetch final job details to verify structure
        const detail = await request(app).get(`/batch/jobs/${jobId}`)
        expect(detail.status).toBe(200)
        expect(detail.body).toMatchObject({
            job_id: jobId,
            state: finalState,
            summary: expect.any(Object),
        })
        console.log('[batch/complete] summary:', detail.body.summary)

        // Fetch the file list to verify output structure
        const files = await request(app).get(`/batch/jobs/${jobId}/files`)
        expect(files.status).toBe(200)
        expect(files.body).toHaveProperty('files')
        expect(Array.isArray(files.body.files)).toBe(true)
        console.log(`[batch/complete] files processed: ${files.body.files.length}`)

        expect(['SUCCEEDED', 'PARTIAL', 'FAILED']).toContain(finalState)
    })
})

// ─── GET /batch/jobs ──────────────────────────────────────────────────────────

describe('GET /batch/jobs', () => {
    test('no filters — returns jobs array', async () => {
        const res = await request(app).get('/batch/jobs')

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('jobs')
        expect(Array.isArray(res.body.jobs)).toBe(true)
        console.log(`[batch/list] jobs: ${res.body.jobs.length}`)
    })

    test('filter by state: SUCCEEDED', async () => {
        const res = await request(app).get('/batch/jobs?state=SUCCEEDED')

        expect(res.status).toBe(200)
        console.log(`[batch/list] SUCCEEDED: ${res.body.jobs?.length ?? 0}`)
    })

    test('filter by state: FAILED', async () => {
        const res = await request(app).get('/batch/jobs?state=FAILED')

        expect(res.status).toBe(200)
        console.log(`[batch/list] FAILED: ${res.body.jobs?.length ?? 0}`)
    })
})

// ─── GET /batch/jobs/:jobId ───────────────────────────────────────────────────

describe('GET /batch/jobs/:jobId', () => {
    test('returns full job details for a created job', async () => {
        if (!batchJobId) {
            console.log('[batch/get] skipping — no job was created (all POSTs returned 502)')
            return
        }
        const res = await request(app).get(`/batch/jobs/${batchJobId}`)

        expectForwarded(res.status)
        if (res.status === 200) {
            expect(res.body).toMatchObject({ job_id: batchJobId, state: expect.any(String) })
        }
        console.log('[batch/get] →', res.status, res.body)
    })

    test('non-existent ID → 502 with Zoom 404 payload', async () => {
        const res = await request(app).get('/batch/jobs/nonexistent-job-id-000')

        expect(res.status).toBe(502)
        expect(res.body).toHaveProperty('error')
        console.log('[batch/get] invalid id →', res.body)
    })
})

// ─── GET /batch/jobs/:jobId/files ─────────────────────────────────────────────

describe('GET /batch/jobs/:jobId/files', () => {
    test('returns files array for a created job', async () => {
        if (!batchJobId) {
            console.log('[batch/files] skipping — no job was created')
            return
        }
        const res = await request(app).get(`/batch/jobs/${batchJobId}/files`)

        expectForwarded(res.status)
        if (res.status === 200) {
            expect(res.body).toHaveProperty('files')
        }
        console.log('[batch/files] →', res.status, res.body)
    })

    test('non-existent ID → 502', async () => {
        const res = await request(app).get('/batch/jobs/nonexistent-job-id-000/files')

        expect(res.status).toBe(502)
        console.log('[batch/files] invalid id →', res.body)
    })
})

// ─── DELETE /batch/jobs/:jobId ────────────────────────────────────────────────

describe('DELETE /batch/jobs/:jobId', () => {
    test('cancels a created job (or 502 if already terminal)', async () => {
        if (!batchJobId) {
            console.log('[batch/cancel] skipping — no job was created')
            return
        }
        const res = await request(app).delete(`/batch/jobs/${batchJobId}`)

        expectForwarded(res.status) // 204 = cancelled, 502 = job already finished
        console.log('[batch/cancel] →', res.status)
    })

    test('non-existent ID → 502', async () => {
        const res = await request(app).delete('/batch/jobs/nonexistent-job-id-000')

        expect(res.status).toBe(502)
        console.log('[batch/cancel] invalid id →', res.body)
    })
})

// ─── POST /webhooks/scribe ────────────────────────────────────────────────────

describe('POST /webhooks/scribe', () => {
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

    function signWebhook(body: string, secret: string, timestamp = Date.now().toString()) {
        const message = `v0:${timestamp}:${body}`
        const sig = crypto.createHmac('sha256', secret).update(message).digest('hex')
        return { signature: `sha256=${sig}`, timestamp }
    }

    test('unsigned request: accepted when no secret, rejected (401) when secret is set', async () => {
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-abc-123' },
        })

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .send(payload)

        if (WEBHOOK_SECRET) {
            expect(res.status).toBe(401)
        } else {
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ status: 'received' })
        }
        console.log('[webhook] unsigned →', res.status, res.body)
    })

    test('job completed event with summary (with valid signature if secret is set)', async () => {
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.completed',
            job: {
                job_id: 'job-abc-123',
                summary: { total: 10, succeeded: 9, failed: 1, processing: 0, queued: 0 },
            },
        })

        const headers: Record<string, string> = {}
        if (WEBHOOK_SECRET) {
            const { signature, timestamp } = signWebhook(payload, WEBHOOK_SECRET)
            headers['x-zm-signature'] = signature
            headers['x-zm-request-timestamp'] = timestamp
        }

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .set(headers)
            .send(payload)

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ status: 'received' })
        console.log('[webhook] completed+summary →', res.status, res.body)
    })

    test('valid HMAC signature is accepted', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping — WEBHOOK_SECRET not set')
            return
        }
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-xyz-999' },
        })
        const { signature, timestamp } = signWebhook(payload, WEBHOOK_SECRET)

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .set('x-zm-signature', signature)
            .set('x-zm-request-timestamp', timestamp)
            .send(payload)

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ status: 'received' })
        console.log('[webhook] valid sig →', res.status)
    })

    test('wrong HMAC secret → 401', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping — WEBHOOK_SECRET not set')
            return
        }
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-xyz-999' },
        })
        // Signing with a different key produces a correctly-sized but wrong HMAC
        const { signature, timestamp } = signWebhook(payload, 'wrong-secret')

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .set('x-zm-signature', signature)
            .set('x-zm-request-timestamp', timestamp)
            .send(payload)

        expect(res.status).toBe(401)
        expect(res.body).toHaveProperty('error')
        console.log('[webhook] wrong sig →', res.status)
    })

    test('missing signature headers → 401', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping — WEBHOOK_SECRET not set')
            return
        }
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-xyz-999' },
        })

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .send(payload)

        expect(res.status).toBe(401)
        console.log('[webhook] missing headers →', res.status)
    })
})
