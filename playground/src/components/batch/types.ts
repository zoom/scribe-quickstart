import type { AsrConfig } from '../../lib/constants'

export type ApiError = string | { code?: string; message?: string; details?: unknown }
export type ErrorResponse = { error: ApiError }

export type JobFile = {
    file_id: string
    input_uri: string
    output_uri: string
    state: string
    duration_sec: number
    error: ApiError | null
}

export type FilesResponse = { files: JobFile[] }

export type JobStats = {
    total?: number
    succeeded?: number
    failed?: number
    processing?: number
    queued?: number
    [key: string]: number | undefined
}

export type JobInput = {
    mode: string
    source?: string
    uri?: string
    manifest?: string[]
    filters?: { include_globs?: string[]; exclude_globs?: string[] } | null
    auth?: unknown
}

export type JobOutput = {
    destination: string
    uri: string
    layout: string
    overwrite: boolean
    auth?: unknown
}

export type JobResponse = {
    job_id: string
    state: string
    reference_id?: string
    submitted_at?: string
    completed_at?: string
    input?: JobInput
    output?: JobOutput
    stats?: JobStats
    summary?: JobStats
    config?: Record<string, string | number | boolean>
    status?: string
    error?: null
}

export type CancelResponse = { status: string }

export type BatchApiResponse = ErrorResponse | FilesResponse | JobResponse | CancelResponse

export function isErrorResponse(d: BatchApiResponse): d is ErrorResponse {
    return 'error' in d && (d as ErrorResponse).error != null
}

export function isFilesResponse(d: BatchApiResponse): d is FilesResponse {
    return 'files' in d && Array.isArray((d as FilesResponse).files)
}

export function isJobResponse(d: BatchApiResponse): d is JobResponse {
    return 'job_id' in d || 'state' in d
}

export type Job = { job_id: string; state: string; submitted_at?: string }

export type InputMode = 'SINGLE' | 'PREFIX' | 'MANIFEST'
export type OutputLayout = 'SINGLE' | 'ADJACENT' | 'PREFIX'

export type BatchFormState = {
    inputMode: InputMode
    inputUri: string
    manifest: string
    includeGlobs: string
    excludeGlobs: string
    inputAwsFromEnv: boolean
    inputAwsKeyId: string
    inputAwsSecret: string
    inputAwsSession: string
    outputUri: string
    outputLayout: OutputLayout
    outputAwsFromEnv: boolean
    outputAwsKeyId: string
    outputAwsSecret: string
    outputAwsSession: string
    config: AsrConfig
    referenceId: string
    webhookUrl: string
    webhookSecret: string
    stateFilter: string
}

export const defaultBatch: BatchFormState = {
    inputMode: 'PREFIX', inputUri: '', manifest: '',
    includeGlobs: '', excludeGlobs: '',
    inputAwsFromEnv: true, inputAwsKeyId: '', inputAwsSecret: '', inputAwsSession: '',
    outputUri: '', outputLayout: 'ADJACENT',
    outputAwsFromEnv: true, outputAwsKeyId: '', outputAwsSecret: '', outputAwsSession: '',
    config: {
        language: 'en-US',
        channel_separation: false,
    },
    referenceId: '', webhookUrl: '', webhookSecret: '',
    stateFilter: '',
}

export const MODE_DESCRIPTIONS: Record<InputMode, { title: string; hint: string }> = {
    SINGLE: { title: 'Single file', hint: 'One S3 audio file' },
    PREFIX: { title: 'S3 directory', hint: 'All files under an S3 prefix' },
    MANIFEST: { title: 'Manifest', hint: 'List of S3 URIs or public URLs' },
}

export const STATE_META: Record<string, { color: string; dot: string }> = {
    QUEUED: { color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    PROCESSING: { color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500 animate-pulse' },
    SUCCEEDED: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    PARTIAL: { color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
    FAILED: { color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    CANCELED: { color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
    FILE_QUEUED: { color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    FILE_PROCESSING: { color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500 animate-pulse' },
    FILE_SUCCEEDED: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    FILE_FAILED: { color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    FILE_SKIPPED: { color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
    FILE_CANCELED: { color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
}
