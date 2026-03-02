import cors from 'cors'
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

app.use(express.json(), cors())
app.options('*', cors())

// POST /transcribe — synchronous transcription
// Accepts multipart/form-data with `file` and optional `config` JSON fields
app.post('/transcribe', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) { res.status(400).json({ error: 'Missing "file" field' }); return }
        let config: Record<string, unknown> = { language: 'en-US' }
        if (req.body.config) {
            try { config = JSON.parse(req.body.config) } catch { /* use default */ }
        }
        const form = new FormData()
        form.append('file', new Blob([new Uint8Array(req.file.buffer)]), req.file.originalname)
        form.append('config', JSON.stringify(config))
        res.json(await makeZoomRequest('/transcribe', { method: 'POST', body: form }))
    } catch (e: unknown) { res.status(502).json({ error: (e as Error).message }) }
})

// POST /batch/jobs — submit a batch job
// Body is forwarded to the Zoom API with AWS creds injected if provided/env-configured
app.post('/batch/jobs', async (req, res) => {
    try {
        const body = req.body as BatchJobRequest
        const envAws = getEnvAwsCredentials()

        const inputSource = body.input?.source ?? (body.input?.uri?.startsWith('s3://') ? 's3' : undefined)
        const inputAws = isS3(inputSource) ? (body.input?.auth?.aws ?? envAws) : undefined
        const input = withAwsAuth(body.input, inputAws)

        const outputBase: BatchOutput = {
            destination: body.output?.destination ?? 's3',
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

// POST /webhooks/scribe — receive job status notifications
app.post('/webhooks/scribe', (req, res) => {
    console.log(`[webhook] ${req.body.event} — job ${req.body.payload?.job_id} → ${req.body.payload?.status}`)
    res.json({ status: 'received' })
})

app.listen(port, () => console.log(`Scribe API listening on port ${port}`))
