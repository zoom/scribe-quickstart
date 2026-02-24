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
    aws?: unknown
}

export type JobOutput = {
    destination: string
    uri: string
    layout: string
    overwrite: boolean
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

export type InputMode = 'SINGLE' | 'INPUT_PREFIX' | 'MANIFEST'
export type OutputLayout = 'ADJACENT' | 'PREFIX'

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
    inputMode: 'INPUT_PREFIX', inputUri: '', manifest: '',
    includeGlobs: '', excludeGlobs: '',
    inputAwsFromEnv: true, inputAwsKeyId: '', inputAwsSecret: '', inputAwsSession: '',
    outputUri: '', outputLayout: 'ADJACENT',
    outputAwsFromEnv: true, outputAwsKeyId: '', outputAwsSecret: '', outputAwsSession: '',
    config: {
        language: 'en-US',
        timestamps: false,
        word_time_offsets: false,
        channel_separation: false,
        diarization: false,
        profanity_filter: false,
        output_format: 'json',
    },
    referenceId: '', webhookUrl: '', webhookSecret: '',
    stateFilter: '',
}

export const MODE_DESCRIPTIONS: Record<InputMode, { title: string; hint: string }> = {
    SINGLE: { title: 'Single file', hint: 'One S3 audio file' },
    INPUT_PREFIX: { title: 'S3 directory', hint: 'All files under an S3 prefix' },
    MANIFEST: { title: 'Manifest', hint: 'List of S3 URIs or public URLs' },
}

export const STATE_META: Record<string, { color: string; dot: string }> = {
    QUEUED: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
    PROCESSING: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
    SUCCEEDED: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    PARTIAL: { color: 'bg-orange-500/15 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
    FAILED: { color: 'bg-red-500/15 text-red-400 border-red-500/20', dot: 'bg-red-400' },
    CANCELED: { color: 'bg-gray-500/15 text-gray-400 border-gray-500/20', dot: 'bg-gray-500' },
    FILE_QUEUED: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
    FILE_PROCESSING: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
    FILE_SUCCEEDED: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
    FILE_FAILED: { color: 'bg-red-500/15 text-red-400 border-red-500/20', dot: 'bg-red-400' },
    FILE_SKIPPED: { color: 'bg-gray-500/15 text-gray-400 border-gray-500/20', dot: 'bg-gray-500' },
    FILE_CANCELED: { color: 'bg-gray-500/15 text-gray-400 border-gray-500/20', dot: 'bg-gray-500' },
}
