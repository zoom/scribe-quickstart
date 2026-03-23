import cors from 'cors'
import crypto from 'crypto'
import dotenv from 'dotenv'
import express from 'express'
import { generateJWT, getEnvAwsCredentials, isS3, withAwsAuth } from './util.js'
import multer from 'multer'
import type { BatchJobRequest, BatchOutput } from './util.js'
dotenv.config()

const BASE_PATH = 'https://api.zoom.us/v2/aiservices/scribe'

async function makeZoomRequest(path: string, init?: RequestInit) {
    const res = await fetch(`${BASE_PATH}${path}`, { ...init, headers: { Authorization: `Bearer ${generateJWT()}`, ...init?.headers } })
    if (!res.ok) throw new Error(await res.text() || res.statusText)
    if (res.status === 204) return null
    return res.json()
}

const app = express()
const port = process.env.PORT || 4000
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

app.use(cors())
app.options('*', cors())
// POST /webhooks/scribe — receive job status notifications
// Registered before express.json() so we can access the raw body for HMAC verification
app.post('/webhooks/scribe', express.raw({ type: 'application/json' }), handleWebhook)
app.use(express.json())

// POST /transcribe — synchronous transcription
// Accepts multipart/form-data with `file` and optional `config` JSON fields
// Forwards to Zoom as JSON with base64-encoded data URI
app.post('/transcribe', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) { res.status(400).json({ error: 'Missing "file" field' }); return }
        let config: Record<string, unknown> = { language: 'en-US' }
        if (req.body.config) {
            try { config = JSON.parse(req.body.config) } catch { /* use default */ }
        }
        const base64File = Buffer.from(req.file.buffer).toString('base64')
        const dataUri = `data:${req.file.mimetype};base64,${base64File}`
        res.json(await makeZoomRequest('/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: dataUri, config }),
        }))
    } catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// POST /batch/jobs — submit a batch job
// Body is forwarded to the Zoom API with AWS creds injected if provided/env-configured
app.post('/batch/jobs', async (req, res) => {
    try {
        const body = req.body as BatchJobRequest
        const envAws = getEnvAwsCredentials()

        const inputSource = body.input?.source ?? (body.input?.uri?.startsWith('s3://') ? 'S3' : undefined)
        const inputAws = isS3(inputSource) ? (body.input?.auth?.aws ?? envAws) : undefined
        const input = withAwsAuth(body.input, inputAws)

        const outputBase: BatchOutput = {
            destination: body.output?.destination ?? 'S3',
            uri: body.output?.uri ?? body.input?.uri,
            layout: body.output?.layout ?? 'ADJACENT',
            overwrite: body.output?.overwrite ?? false,
            ...(body.output?.auth && { auth: body.output.auth }),
        }
        const outputAws = isS3(outputBase.destination) ? (outputBase.auth?.aws ?? envAws) : undefined
        const output = withAwsAuth(outputBase, outputAws)

        const payload = {
            ...(input && { input }),
            output,
            config: body.config ?? { language: 'en-US' },
            ...(body.reference_id && { reference_id: body.reference_id }),
            ...(body.notifications?.webhook_url && { notifications: body.notifications }),
        }

        res.status(201).json(await makeZoomRequest('/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }))
    } catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// GET /batch/jobs — list batch jobs
app.get('/batch/jobs', async (req, res) => {
    try { res.json(await makeZoomRequest(`/jobs?${new URLSearchParams(req.query as Record<string, string>)}`)) }
    catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// GET /batch/jobs/:jobId — get job status
app.get('/batch/jobs/:jobId', async (req, res) => {
    try { res.json(await makeZoomRequest(`/jobs/${req.params.jobId}`)) }
    catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// GET /batch/jobs/:jobId/files — list files for a job
app.get('/batch/jobs/:jobId/files', async (req, res) => {
    try { res.json(await makeZoomRequest(`/jobs/${req.params.jobId}/files?${new URLSearchParams(req.query as Record<string, string>)}`)) }
    catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// DELETE /batch/jobs/:jobId — cancel a job
app.delete('/batch/jobs/:jobId', async (req, res) => {
    try {
        await makeZoomRequest(`/jobs/${req.params.jobId}`, { method: 'DELETE' })
        res.status(204).send()
    } catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

function handleWebhook(req: express.Request, res: express.Response) {
    const rawBody = req.body as Buffer
    const body = JSON.parse(rawBody.toString('utf8'))
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
        const signature = req.headers['x-zm-signature'] as string
        const timestamp = req.headers['x-zm-request-timestamp'] as string
        if (!signature || !timestamp) { res.status(401).json({ error: 'Missing signature or timestamp header' }); return }
        const message = `v0:${timestamp}:${rawBody.toString('utf8')}`
        const expected = `sha256=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            console.log(`[webhook] invalid signature`);
            res.status(401).json({ error: 'Invalid signature' }); return
        }
    }
    console.log(`[webhook] job ${body.job?.job_id}: ${body.event_type}`);
    if (body.job?.summary) console.log(`[webhook] summary:`, body.job.summary);
    res.json({ status: 'received' })
}

app.listen(port, () => console.log(`Scribe API listening on port ${port}`))
