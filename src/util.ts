import { KJUR } from 'jsrsasign'
import dotenv from 'dotenv'
dotenv.config()

type AwsCredentials = {
    access_key_id?: string
    secret_access_key?: string
    session_token?: string
}

type BatchInput = {
    source?: string
    mode?: string
    uri?: string
    manifest?: string[]
    filters?: { include_globs?: string[]; exclude_globs?: string[] }
    auth?: { aws?: AwsCredentials }
}

type BatchOutput = {
    destination?: string
    uri?: string
    layout?: string
    overwrite?: boolean
    auth?: { aws?: AwsCredentials }
}

type BatchJobRequest = {
    input?: BatchInput
    output?: BatchOutput
    config?: Record<string, unknown>
    reference_id?: string
    notifications?: { webhook_url?: string; secret?: string }
}

const ZOOM_API_KEY = process.env.ZOOM_API_KEY
const ZOOM_API_SECRET = process.env.ZOOM_API_SECRET

if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    throw new Error('ZOOM_API_KEY and ZOOM_API_SECRET are required')
}

const generateJWT = () => {
    const now = Math.round(Date.now() / 1000)
    const iat = now - 30
    const exp = iat + 60 * 60 * 2
    const oHeader = { alg: 'HS256', typ: 'JWT' }
    const oPayload = {
        iss: ZOOM_API_KEY,
        iat: iat,
        exp: exp
    }
    const sHeader = JSON.stringify(oHeader)
    const sPayload = JSON.stringify(oPayload)
    const API_JWT = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, ZOOM_API_SECRET)
    return API_JWT
}

function getEnvAwsCredentials(): AwsCredentials | undefined {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return undefined
    return {
        access_key_id: process.env.AWS_ACCESS_KEY_ID,
        secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN && { session_token: process.env.AWS_SESSION_TOKEN }),
    }
}

function isS3(value?: string): boolean {
    return String(value ?? '').toLowerCase() === 's3'
}

function withAwsAuth<T extends { auth?: { aws?: AwsCredentials } }>(value: T | undefined, aws: AwsCredentials | undefined): T | undefined {
    if (!value) return undefined
    if (!aws) return value
    return { ...value, auth: { ...(value.auth ?? {}), aws } }
}


export { generateJWT, getEnvAwsCredentials, isS3, withAwsAuth, BatchJobRequest, BatchInput, BatchOutput, AwsCredentials }
