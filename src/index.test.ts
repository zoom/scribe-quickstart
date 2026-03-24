/**
 * Integration tests for the Scribe Quickstart backend.
 *
 * These tests cover every request shape the playground can generate and forward
 * them all the way to the Zoom Scribe API. Responses from Zoom may be errors
 * (e.g. invalid credentials, bad S3 URI) — that is expected when running without
 * real cloud resources.  The important thing being verified is:
 *   - Our server correctly parses and forwards every payload shape (no 500s)
 *   - Bad inputs from the client are rejected with 400 before reaching Zoom
 *   - Webhook signature verification works correctly
 *
 * Prerequisites:
 *   - A .env file with ZOOM_API_KEY, ZOOM_API_SECRET, AWS_*, S3_INPUT_URI, S3_OUTPUT_URI set
 */

import { describe, test, expect } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { app } from './index.js'

// ─── env ──────────────────────────────────────────────────────────────────────
// util.ts calls dotenv.config() at import time, so these are populated from .env

const S3_INPUT   = process.env.S3_INPUT_URI  ?? 's3://my-bucket'
const S3_OUTPUT  = process.env.S3_OUTPUT_URI ?? 's3://my-bucket/transcripts'
const AWS_KEY    = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY
const AWS_TOKEN  = process.env.AWS_SESSION_TOKEN
const LANGUAGE   = process.env.LANGUAGE ?? 'en-US'
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

    const buf = Buffer.alloc(44 + dataSize) // zeros = silence

    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)            // fmt chunk size
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
 * Acceptable HTTP status codes when forwarding to the Zoom API:
 *   201 / 200 / 204  — Zoom accepted the request
 *   502              — Zoom rejected it (bad creds, bad URI, etc.)
 *
 * 4xx from *our* server means a bug in how we handle the payload.
 * 5xx (other than 502) means an internal crash.
 */
function expectForwarded(status: number) {
    expect([200, 201, 204, 502]).toContain(status)
}

// Shared state for dependent batch-job tests
let batchJobId: string | undefined

// ─── POST /transcribe ─────────────────────────────────────────────────────────

describe('POST /transcribe', () => {
    test('missing file → 400', async () => {
        const res = await request(app).post('/transcribe').send()
        expect(res.status).toBe(400)
        expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    test('WAV file with no config field (default language)', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })

        expectForwarded(res.status)
        console.log('[transcribe] no config →', res.status, res.body)
    })

    test('WAV file with explicit language: en-US', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: 'en-US' }))

        expectForwarded(res.status)
        console.log('[transcribe] en-US →', res.status, res.body)
    })

    test('WAV file with channel_separation: false', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: 'en-US', channel_separation: false }))

        expectForwarded(res.status)
        console.log('[transcribe] channel_separation:false →', res.status, res.body)
    })

    test('WAV file with channel_separation: true', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', JSON.stringify({ language: 'en-US', channel_separation: true }))

        expectForwarded(res.status)
        console.log('[transcribe] channel_separation:true →', res.status, res.body)
    })

    test('malformed config JSON falls back to default language', async () => {
        const res = await request(app)
            .post('/transcribe')
            .attach('file', WAV, { filename: 'audio.wav', contentType: 'audio/wav' })
            .field('config', 'NOT_VALID_JSON')

        // Server should still forward (using default config), not crash
        expectForwarded(res.status)
        console.log('[transcribe] malformed config →', res.status, res.body)
    })
})

// ─── POST /batch/jobs ─────────────────────────────────────────────────────────

describe('POST /batch/jobs', () => {
    test('SINGLE mode - minimal payload (output only)', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                output: { uri: S3_OUTPUT },
            })

        expectForwarded(res.status)
        console.log('[batch/create] minimal →', res.status, res.body)
        if (res.status === 201 && res.body.job_id) batchJobId = res.body.job_id
    })

    test('SINGLE mode – S3 input + S3 output, env AWS creds', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                },
                output: {
                    uri: S3_OUTPUT,
                },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE S3 →', res.status, res.body)
        if (res.status === 201 && res.body.job_id) batchJobId = res.body.job_id
    })

    test('SINGLE mode – S3 input + output, inline AWS credentials', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                    auth: {
                        aws: {
                            access_key_id: AWS_KEY,
                            secret_access_key: AWS_SECRET,
                            ...(AWS_TOKEN && { session_token: AWS_TOKEN }),
                        },
                    },
                },
                output: {
                    uri: S3_OUTPUT,
                    auth: {
                        aws: {
                            access_key_id: AWS_KEY,
                            secret_access_key: AWS_SECRET,
                            ...(AWS_TOKEN && { session_token: AWS_TOKEN }),
                        },
                    },
                },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE inline creds →', res.status, res.body)
    })

    test('SINGLE mode – inline AWS credentials with session token', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                    auth: {
                        aws: {
                            access_key_id: AWS_KEY,
                            secret_access_key: AWS_SECRET,
                            session_token: AWS_TOKEN,
                        },
                    },
                },
                output: { uri: S3_OUTPUT },
            })

        expectForwarded(res.status)
        console.log('[batch/create] SINGLE session token →', res.status, res.body)
    })

    test('PREFIX mode – S3 prefix with include/exclude glob filters', async () => {
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
                output: {
                    uri: S3_OUTPUT,
                    layout: 'ADJACENT',
                    overwrite: false,
                },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] PREFIX filters →', res.status, res.body)
    })

    test('PREFIX mode – include globs only (no exclude)', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'PREFIX',
                    uri: `${S3_INPUT}/`,
                    filters: {
                        include_globs: ['**/*.flac'],
                    },
                },
                output: { uri: S3_OUTPUT },
            })

        expectForwarded(res.status)
        console.log('[batch/create] PREFIX include only →', res.status, res.body)
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
                output: {
                    uri: S3_OUTPUT,
                    layout: 'PREFIX',
                },
                config: { language: LANGUAGE },
            })

        expectForwarded(res.status)
        console.log('[batch/create] MANIFEST S3 →', res.status, res.body)
    })

    test('MANIFEST mode – mixed HTTP and S3 URIs', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'MANIFEST',
                    manifest: [
                        'https://example.com/audio/meeting1.wav',
                        'https://cdn.example.com/recordings/call.mp3',
                    ],
                },
                output: {
                    uri: S3_OUTPUT,
                    layout: 'PREFIX',
                },
            })

        expectForwarded(res.status)
        console.log('[batch/create] MANIFEST HTTP →', res.status, res.body)
    })

    test('SINGLE mode – with reference_id for tracking', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                },
                output: { uri: S3_OUTPUT },
                reference_id: 'test-run-001',
            })

        expectForwarded(res.status)
        console.log('[batch/create] reference_id →', res.status, res.body)
    })

    test('SINGLE mode – with webhook notifications (no secret)', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                },
                output: { uri: S3_OUTPUT },
                notifications: {
                    webhook_url: WEBHOOK_URL,
                },
            })

        expectForwarded(res.status)
        console.log('[batch/create] webhook no secret →', res.status, res.body)
    })

    test('SINGLE mode – with webhook notifications + HMAC secret', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: {
                    mode: 'SINGLE',
                    uri: `${S3_INPUT}/sample.wav`,
                },
                output: { uri: S3_OUTPUT },
                notifications: {
                    webhook_url: WEBHOOK_URL,
                    secret: process.env.WEBHOOK_SECRET ?? 'my-hmac-secret',
                },
            })

        expectForwarded(res.status)
        console.log('[batch/create] webhook + secret →', res.status, res.body)
    })

    test('output layout: ADJACENT', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'ADJACENT' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] layout ADJACENT →', res.status, res.body)
    })

    test('output layout: PREFIX', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, layout: 'PREFIX' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] layout PREFIX →', res.status, res.body)
    })

    test('output overwrite: true', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT, overwrite: true },
            })

        expectForwarded(res.status)
        console.log('[batch/create] overwrite:true →', res.status, res.body)
    })

    test('non-default language: fr-FR', async () => {
        const res = await request(app)
            .post('/batch/jobs')
            .send({
                input: { mode: 'SINGLE', uri: `${S3_INPUT}/sample.wav` },
                output: { uri: S3_OUTPUT },
                config: { language: 'fr-FR' },
            })

        expectForwarded(res.status)
        console.log('[batch/create] lang fr-FR →', res.status, res.body)
    })

    test('full payload – all fields set', async () => {
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
                    layout: 'ADJACENT',
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
        if (res.status === 201 && res.body.job_id) batchJobId = res.body.job_id
    })
})

// ─── GET /batch/jobs ──────────────────────────────────────────────────────────

describe('GET /batch/jobs', () => {
    test('no filters', async () => {
        const res = await request(app).get('/batch/jobs')

        expectForwarded(res.status)
        console.log('[batch/list] no filter →', res.status, res.body)
        if (res.status === 200) {
            expect(res.body).toHaveProperty('jobs')
            expect(Array.isArray(res.body.jobs)).toBe(true)
        }
    })

    test('filter by state: SUCCEEDED', async () => {
        const res = await request(app).get('/batch/jobs?state=SUCCEEDED')

        expectForwarded(res.status)
        console.log('[batch/list] state=SUCCEEDED →', res.status, res.body)
    })

    test('filter by state: FAILED', async () => {
        const res = await request(app).get('/batch/jobs?state=FAILED')

        expectForwarded(res.status)
        console.log('[batch/list] state=FAILED →', res.status, res.body)
    })

    test('filter by state: IN_PROGRESS', async () => {
        const res = await request(app).get('/batch/jobs?state=IN_PROGRESS')

        expectForwarded(res.status)
        console.log('[batch/list] state=IN_PROGRESS →', res.status, res.body)
    })
})

// ─── GET /batch/jobs/:jobId ───────────────────────────────────────────────────

describe('GET /batch/jobs/:jobId', () => {
    test('get created job (if available)', async () => {
        if (!batchJobId) {
            console.log('[batch/get] skipping — no job was created successfully')
            return
        }
        const res = await request(app).get(`/batch/jobs/${batchJobId}`)

        expectForwarded(res.status)
        console.log('[batch/get] →', res.status, res.body)
        if (res.status === 200) {
            expect(res.body).toHaveProperty('job_id', batchJobId)
        }
    })

    test('non-existent job ID → 502 (Zoom 404)', async () => {
        const res = await request(app).get('/batch/jobs/nonexistent-job-id-000')

        expect(res.status).toBe(502)
        expect(res.body).toHaveProperty('error')
        console.log('[batch/get] invalid id →', res.status, res.body)
    })
})

// ─── GET /batch/jobs/:jobId/files ─────────────────────────────────────────────

describe('GET /batch/jobs/:jobId/files', () => {
    test('list files for created job (if available)', async () => {
        if (!batchJobId) {
            console.log('[batch/files] skipping — no job was created successfully')
            return
        }
        const res = await request(app).get(`/batch/jobs/${batchJobId}/files`)

        expectForwarded(res.status)
        console.log('[batch/files] →', res.status, res.body)
        if (res.status === 200) {
            expect(res.body).toHaveProperty('files')
        }
    })

    test('non-existent job ID → 502', async () => {
        const res = await request(app).get('/batch/jobs/nonexistent-job-id-000/files')

        expect(res.status).toBe(502)
        console.log('[batch/files] invalid id →', res.status, res.body)
    })
})

// ─── DELETE /batch/jobs/:jobId ────────────────────────────────────────────────

describe('DELETE /batch/jobs/:jobId', () => {
    test('cancel created job (if available)', async () => {
        if (!batchJobId) {
            console.log('[batch/cancel] skipping — no job was created successfully')
            return
        }
        const res = await request(app).delete(`/batch/jobs/${batchJobId}`)

        // 204 = cancelled, 502 = Zoom rejected (e.g. job already finished)
        expectForwarded(res.status)
        console.log('[batch/cancel] →', res.status)
    })

    test('non-existent job ID → 502', async () => {
        const res = await request(app).delete('/batch/jobs/nonexistent-job-id-000')

        expect(res.status).toBe(502)
        console.log('[batch/cancel] invalid id →', res.status, res.body)
    })
})

// ─── POST /webhooks/scribe ────────────────────────────────────────────────────

describe('POST /webhooks/scribe', () => {
    // Webhooks don't forward to Zoom — they just log and ack
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

    function signWebhook(body: string, secret: string, timestamp = Date.now().toString()) {
        const message = `v0:${timestamp}:${body}`
        const sig = crypto.createHmac('sha256', secret).update(message).digest('hex')
        return { signature: `sha256=${sig}`, timestamp }
    }

    test('job created event – no WEBHOOK_SECRET configured', async () => {
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-abc-123' },
        })

        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .send(payload)

        // If WEBHOOK_SECRET is set we may get 401; if not, we get 200
        if (!WEBHOOK_SECRET) {
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ status: 'received' })
        } else {
            expect(res.status).toBe(401)
        }
        console.log('[webhook] created, no sig →', res.status, res.body)
    })

    test('job completed event with summary', async () => {
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.completed',
            job: {
                job_id: 'job-abc-123',
                summary: { total: 10, succeeded: 9, failed: 1, processing: 0, queued: 0 },
            },
        })

        if (!WEBHOOK_SECRET) {
            const res = await request(app)
                .post('/webhooks/scribe')
                .set('Content-Type', 'application/json')
                .send(payload)

            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ status: 'received' })
            console.log('[webhook] completed with summary →', res.status, res.body)
        } else {
            const { signature, timestamp } = signWebhook(payload, WEBHOOK_SECRET)
            const res = await request(app)
                .post('/webhooks/scribe')
                .set('Content-Type', 'application/json')
                .set('x-zm-signature', signature)
                .set('x-zm-request-timestamp', timestamp)
                .send(payload)

            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ status: 'received' })
            console.log('[webhook] completed + valid sig →', res.status, res.body)
        }
    })

    test('valid HMAC signature is accepted', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping signature test — WEBHOOK_SECRET not set')
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
        console.log('[webhook] valid sig →', res.status, res.body)
    })

    test('invalid HMAC signature is rejected with 401', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping signature test — WEBHOOK_SECRET not set')
            return
        }
        const payload = JSON.stringify({
            event_type: 'scribe.batch_job.created',
            job: { job_id: 'job-xyz-999' },
        })

        // Sign with a wrong secret so the HMAC is correctly formatted but won't match
        const { signature, timestamp } = signWebhook(payload, 'wrong-secret')
        const res = await request(app)
            .post('/webhooks/scribe')
            .set('Content-Type', 'application/json')
            .set('x-zm-signature', signature)
            .set('x-zm-request-timestamp', timestamp)
            .send(payload)

        expect(res.status).toBe(401)
        expect(res.body).toHaveProperty('error')
        console.log('[webhook] invalid sig →', res.status, res.body)
    })

    test('missing signature headers are rejected with 401', async () => {
        if (!WEBHOOK_SECRET) {
            console.log('[webhook] skipping signature test — WEBHOOK_SECRET not set')
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
        console.log('[webhook] missing headers →', res.status, res.body)
    })
})
