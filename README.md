# Zoom AI Scribe API Quickstart

A Node.js/Express server that proxies to the [Zoom AI Scribe API](https://developers.zoom.us/docs/ai-scribe/) for speech-to-text transcription. It handles JWT authentication and exposes simple REST endpoints for **fast mode** (with file upload) and **batch jobs** (S3-based).

## Features

- **Sync transcription** — `POST /transcribe` with an audio/video file; returns transcript with optional timestamps and diarization.
- **Batch jobs** — Create, list, get, and delete Scribe batch jobs using S3 input/output buckets.
- **Webhooks** — Optional `POST /webhooks/scribe` endpoint to receive job status notifications.

## Installation

```bash
git clone https://github.com/zoom/scribe-api-quickstart.git
cd scribe-quickstart
npm install
```

## Setup

1. Copy environment variables and add your [Zoom API](https://developers.zoom.us/docs/ai-scribe/setup/) and [AWS Security Token Service](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html) credentials:

   ```bash
   cp .env.example .env
   ```

You can use `scripts/generate-sts-creds.sh` to generate temporary AWS STS credentials using your IAM access key and secret key if you have the aws cli installed:

   ```bash
   ./scripts/generate-sts-creds.sh <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY>
   ```
This will generate a temporary AWS STS credentials and write them to the `.env` file.

2. Edit `.env` and set at minimum:

   | Variable           | Required | Description                                      |
   | ------------------ | -------- | ------------------------------------------------ |
   | `ZOOM_API_KEY`     | **Yes**  | Zoom server-to-server app API key                |
   | `ZOOM_API_SECRET`  | **Yes**  | Zoom server-to-server app API secret             |
   | `PORT`             | No       | Server port (default: `4000`)                     |
   | `LANGUAGE`         | No       | Default transcription language (default: `en-US`)|

   For **batch jobs** you must also set:

   | Variable               | Required for batch | Description                    |
   | ---------------------- | ------------------- | ------------------------------ |
   | `S3_INPUT_URI`         | Yes                 | S3 URI for input files (e.g. `s3://bucket/`) |
   | `S3_OUTPUT_URI`        | Yes                 | S3 URI for output transcripts  |
   | `AWS_ACCESS_KEY_ID`    | Yes                 | AWS credentials for Scribe     |
   | `AWS_SECRET_ACCESS_KEY`| Yes                 | AWS credentials for Scribe     |
   | `AWS_SESSION_TOKEN`    | Yes (if using temp) | AWS session token              |

   Optional:

   | Variable         | Description                          |
   | ---------------- | ------------------------------------ |
   | `WEBHOOK_URL`    | URL for batch job status webhooks    |
   | `WEBHOOK_SECRET` | Secret to verify webhook payloads    |

3. Start the server:

   ```bash
   npm run start
   ```

   The server runs at `http://localhost:4000` (or your `PORT`).

## Playground

A small web UI is provided to try transcription and batch jobs.

1. Start the API server (from the project root):

   ```bash
   npm run start
   ```

2. In another terminal, run the playground:

   ```bash
   cd playground && npm install && npm run dev
   ```

3. Open the URL shown by Vite (e.g. `http://localhost:5173`). If the API runs on a different origin, set the `API` base URL in `playground/src/shared.ts` (e.g. `export const API = 'http://localhost:4000'`) or use a Vite proxy to the API.

## Deployment

- **Environment:** Set `ZOOM_API_KEY`, `ZOOM_API_SECRET`, and `PORT` (if needed). For batch, also set S3 and AWS variables.
- **Process:** Run `npm run start` (or build and run the compiled `src/index.ts` with Node).
- Use your deployed URL as the base for `/transcribe`, `/batch/jobs`, and `/webhooks/scribe` as needed.

## API Usage

### Synchronous transcription

Upload a single file and get the transcript immediately.

**Request:** `POST /transcribe`

- **Content-Type:** `multipart/form-data`
- **Body:** one field `file` (audio or video file, max 100 MB)

**Example:**

```bash
curl -X POST http://localhost:4000/transcribe -F "file=@recording.mp4"
```

**Response:** JSON from the Zoom Scribe API (e.g. transcript segments, language, timestamps, diarization if enabled).

### Batch jobs

Batch endpoints proxy to the Zoom AI Scribe batch Jobs API. S3 and AWS credentials must be set in `.env`.

| Method   | Endpoint                    | Description                |
| -------- | --------------------------- | -------------------------- |
| `POST`   | `/batch/jobs`               | Create a batch job         |
| `GET`    | `/batch/jobs`               | List jobs (query params)   |
| `GET`    | `/batch/jobs/:jobId`        | Get job details            |
| `GET`    | `/batch/jobs/:jobId/files`  | List output files          |

**Create job example:**

```bash
curl -X POST http://localhost:4000/batch/jobs -H "Content-Type: application/json" -d '{"folder": "meetings/2025/"}' 
```

- `folder` is optional; it is appended to `S3_INPUT_URI` and `S3_OUTPUT_URI` so you can organize input/output by prefix.

## Need help?

- [Zoom AI Scribe documentation](https://developers.zoom.us/docs/ai-services/)
- [Developer Support](https://devsupport.zoom.us) · [Developer Forum](https://devforum.zoom.us)
