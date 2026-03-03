import { useState, useCallback, useEffect } from 'react'
import { AsrConfigForm } from '../components/AsrConfig'
import { CredentialsBox } from '../components/CredentialsBox'
import { colorizeJson } from '../lib/colorizeJson'
import { CollapsibleCard, Card, Field, Spinner } from '../components/ui'
import { selectCls, inputCls, API } from '../lib/constants'
import { BatchResultVisual } from '../components/batch/BatchResultVisual'
import { ModeSelector } from '../components/batch/ModeSelector'
import { StateBadge } from '../components/batch/StateBadge'
import {
    type BatchApiResponse,
    type BatchFormState,
    type Job,
    type OutputLayout,
    defaultBatch,
    isErrorResponse,
    STATE_META,
} from '../components/batch/types'

export function BatchTab() {
    const [form, setForm] = useState<BatchFormState>(defaultBatch)
    const [jobs, setJobs] = useState<Job[]>([])
    const [detail, setDetail] = useState<BatchApiResponse | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [loadingJobs, setLoadingJobs] = useState(false)
    const [showVisual, setShowVisual] = useState(false)

    const set = <K extends keyof BatchFormState>(k: K, v: BatchFormState[K]) => setForm(f => ({ ...f, [k]: v }))

    const loadJobs = useCallback(async () => {
        setLoadingJobs(true)
        try {
            const params = form.stateFilter ? `?state=${form.stateFilter}` : ''
            const res = await fetch(`${API}/batch/jobs${params}`)
            const data = await res.json()
            setJobs(data.jobs ?? [])
        } catch (err) {
            setDetail({ error: String(err) })
        } finally {
            setLoadingJobs(false)
        }
    }, [form.stateFilter])

    useEffect(() => { loadJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const submitJob = useCallback(async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        setBusy(true)
        setDetailLoading(true)
        setDetail(null)
        try {
            const manifestList = form.manifest.trim()
                ? form.manifest.trim().split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
                : undefined
            const includeGlobs = form.includeGlobs.trim()
                ? form.includeGlobs.split(',').map(s => s.trim()).filter(Boolean)
                : undefined
            const excludeGlobs = form.excludeGlobs.trim()
                ? form.excludeGlobs.split(',').map(s => s.trim()).filter(Boolean)
                : undefined
            const inputAws = !form.inputAwsFromEnv && form.inputAwsKeyId
                ? { access_key_id: form.inputAwsKeyId, secret_access_key: form.inputAwsSecret, session_token: form.inputAwsSession }
                : undefined
            const outputAws = !form.outputAwsFromEnv && form.outputAwsKeyId
                ? { access_key_id: form.outputAwsKeyId, secret_access_key: form.outputAwsSecret, session_token: form.outputAwsSession }
                : undefined

            const isHttpInput = form.inputMode === 'MANIFEST'
                ? (manifestList ?? []).every(u => u.startsWith('http'))
                : form.inputUri.startsWith('http')
            const inputSource = isHttpInput ? undefined : 'S3'

            const payload = {
                input: {
                    ...(inputSource && { source: inputSource }),
                    mode: form.inputMode,
                    ...(form.inputUri && { uri: form.inputUri }),
                    ...(manifestList && { manifest: manifestList }),
                    ...((includeGlobs || excludeGlobs) && { filters: { ...(includeGlobs && { include_globs: includeGlobs }), ...(excludeGlobs && { exclude_globs: excludeGlobs }) } }),
                    ...(inputAws && { auth: { aws: inputAws } }),
                },
                output: {
                    destination: 'S3',
                    uri: form.outputUri,
                    layout: form.inputMode === 'PREFIX' ? form.outputLayout : 'PREFIX',
                    overwrite: false,
                    ...(outputAws && { auth: { aws: outputAws } }),
                },
                config: form.config,
                ...(form.referenceId && { reference_id: form.referenceId }),
                ...(form.webhookUrl && { notifications: { webhook_url: form.webhookUrl, ...(form.webhookSecret && { secret: form.webhookSecret }) } }),
            }

            const res = await fetch(`${API}/batch/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            setDetail(await res.json())
            loadJobs()
        } catch (err) {
            setDetail({ error: String(err) })
        } finally {
            setBusy(false)
            setDetailLoading(false)
        }
    }, [form, loadJobs])

    const jobAction = useCallback(async (action: 'status' | 'files' | 'cancel', jobId: string) => {
        setDetailLoading(true)
        setDetail(null)
        try {
            if (action === 'status') {
                const res = await fetch(`${API}/batch/jobs/${jobId}`)
                setDetail(await res.json())
            } else if (action === 'files') {
                const res = await fetch(`${API}/batch/jobs/${jobId}/files`)
                setDetail(await res.json())
            } else if (action === 'cancel') {
                const res = await fetch(`${API}/batch/jobs/${jobId}`, { method: 'DELETE' })
                setDetail(res.status === 204 ? { status: 'Job canceled successfully.' } : await res.json())
                loadJobs()
            }
        } catch (err) {
            setDetail({ error: String(err) })
        } finally {
            setDetailLoading(false)
        }
    }, [loadJobs])

    return (
        <div className="lg:grid lg:grid-cols-[5fr_3fr] gap-5">
            <div className="flex flex-col gap-5 min-w-0">
                <form id="batch-form" onSubmit={submitJob} className="flex flex-col gap-5">

                    {/* Input */}
                    <CollapsibleCard title="Input">
                        <div className="flex flex-col gap-4">
                            <ModeSelector value={form.inputMode} onChange={v => { set('inputMode', v); if (v !== 'PREFIX') set('outputLayout', 'PREFIX') }} />

                            {form.inputMode !== 'MANIFEST' && (
                                <Field label="S3 URI" hint={form.inputMode === 'SINGLE' ? 's3://bucket/audio/call.wav' : 's3://bucket/audio/2025/11/'}>
                                    <input className={inputCls + ' font-mono text-xs'} value={form.inputUri} onChange={e => set('inputUri', e.target.value)} placeholder={form.inputMode === 'SINGLE' ? 's3://my-bucket/audio/call.wav' : 's3://my-bucket/audio/'} />
                                </Field>
                            )}

                            {form.inputMode === 'PREFIX' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Include Globs" hint="Comma-separated — **/*.wav, **/*.mp3">
                                        <input className={inputCls + ' font-mono text-xs'} value={form.includeGlobs} onChange={e => set('includeGlobs', e.target.value)} placeholder="**/*.wav, **/*.mp3" />
                                    </Field>
                                    <Field label="Exclude Globs" hint="Comma-separated — **/tmp/**, *_draft.*">
                                        <input className={inputCls + ' font-mono text-xs'} value={form.excludeGlobs} onChange={e => set('excludeGlobs', e.target.value)} placeholder="**/tmp/**, *_draft.*" />
                                    </Field>
                                </div>
                            )}

                            {form.inputMode === 'MANIFEST' && (
                                <Field label="Manifest URIs" hint="One URI per line (max 1,000). Lines starting with # are ignored. Use https:// for public files or s3:// for private.">
                                    <textarea
                                        className={inputCls + ' min-h-32 resize-y font-mono text-xs leading-relaxed'}
                                        value={form.manifest}
                                        onChange={e => set('manifest', e.target.value)}
                                        placeholder={"# Public URLs — no AWS credentials needed:\nhttps://cdn.example.com/audio/call1.mp3\nhttps://cdn.example.com/audio/call2.wav\n\n# Private S3 URIs — AWS credentials required:\ns3://my-bucket/audio/call3.wav"}
                                    />
                                </Field>
                            )}

                            <CredentialsBox
                                title="Input AWS Credentials"
                                fromEnv={form.inputAwsFromEnv}
                                onFromEnvChange={v => set('inputAwsFromEnv', v)}
                                keyId={form.inputAwsKeyId} onKeyId={v => set('inputAwsKeyId', v)}
                                secret={form.inputAwsSecret} onSecret={v => set('inputAwsSecret', v)}
                                session={form.inputAwsSession} onSession={v => set('inputAwsSession', v)}
                                envNote={form.inputMode === 'MANIFEST'
                                    ? 'Not required if all manifest URLs are public https:// links. Enable to use server env AWS_* variables for private S3 access.'
                                    : undefined}
                            />
                        </div>
                    </CollapsibleCard>

                    {/* Output */}
                    <CollapsibleCard title="Output — S3">
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Layout" hint="Where transcripts will be written">
                                    {form.inputMode === 'PREFIX' ? (
                                        <select className={selectCls} value={form.outputLayout} onChange={e => set('outputLayout', e.target.value as OutputLayout)}>
                                            <option value="ADJACENT">ADJACENT — next to input file</option>
                                            <option value="PREFIX">PREFIX — under output URI</option>
                                        </select>
                                    ) : (
                                        <div className={inputCls + ' text-gray-400 select-none'}>PREFIX — under output URI</div>
                                    )}
                                </Field>
                                {(form.outputLayout === 'PREFIX' || form.inputMode !== 'PREFIX') && (
                                    <Field label="S3 URI" hint="Bucket URI for transcripts">
                                        <input className={inputCls + ' font-mono text-xs'} value={form.outputUri} onChange={e => set('outputUri', e.target.value)} placeholder="s3://my-bucket/transcripts/" />
                                    </Field>
                                )}
                            </div>

                            <CredentialsBox
                                title="Output AWS Credentials"
                                fromEnv={form.outputAwsFromEnv}
                                onFromEnvChange={v => set('outputAwsFromEnv', v)}
                                keyId={form.outputAwsKeyId} onKeyId={v => set('outputAwsKeyId', v)}
                                secret={form.outputAwsSecret} onSecret={v => set('outputAwsSecret', v)}
                                session={form.outputAwsSession} onSession={v => set('outputAwsSession', v)}
                            />
                        </div>
                    </CollapsibleCard>

                    {/* ASR Config */}
                    <CollapsibleCard title="Transcription Config" defaultOpen={false}>
                        <AsrConfigForm value={form.config} onChange={v => set('config', v)} />
                    </CollapsibleCard>

                    {/* Meta */}
                    <CollapsibleCard title="Metadata & Notifications" defaultOpen={false}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Reference ID" hint="Optional tracking ID attached to this job (max 256 chars)">
                                <input className={inputCls} value={form.referenceId} onChange={e => set('referenceId', e.target.value)} placeholder="import-2025-11" />
                            </Field>
                            <div />
                            <Field label="Webhook URL" hint="Receives POST on every state change">
                                <input className={inputCls} value={form.webhookUrl} onChange={e => set('webhookUrl', e.target.value)} placeholder="https://example.com/hooks/scribe" />
                            </Field>
                            <Field label="Webhook Secret" hint="HMAC secret for payload signature verification">
                                <input className={inputCls + ' font-mono'} type="password" value={form.webhookSecret} onChange={e => set('webhookSecret', e.target.value)} placeholder="hmac-secret" />
                            </Field>
                        </div>
                    </CollapsibleCard>

                </form>
            </div>

            {/* Right sidebar: response + jobs */}
            <div className="flex flex-col gap-5 lg:sticky lg:top-18 min-w-0">
                <button
                    form="batch-form"
                    type="submit"
                    disabled={busy}
                    className={[
                        'flex items-center gap-2 self-start px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150',
                        busy
                            ? 'bg-zoom-blue/50 text-white cursor-not-allowed'
                            : 'bg-zoom-blue hover:bg-zoom-blue-hover active:scale-95 text-white shadow-lg shadow-zoom-blue/25',
                    ].join(' ')}
                >
                    {busy && <Spinner />}
                    {busy ? 'Submitting…' : '▶ Submit Batch Job'}
                </button>

                <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full transition-colors ${detailLoading ? 'bg-yellow-500 animate-pulse' : detail === null ? 'bg-gray-300' : isErrorResponse(detail) ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            <span className="text-xs font-medium text-gray-500">Response</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!detailLoading && detail !== null && (
                                <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-gray-100 border border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowVisual(false)}
                                        className={`px-2 py-0.5 text-[11px] rounded-md transition-all ${!showVisual ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        JSON
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowVisual(true)}
                                        className={`px-2 py-0.5 text-[11px] rounded-md transition-all ${showVisual ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Visual
                                    </button>
                                </div>
                            )}
                            {!detailLoading && detail !== null && !showVisual && (
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(JSON.stringify(detail, null, 2))}
                                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>
                    {showVisual && !detailLoading && detail ? (
                        <div className="p-4 bg-zoom-surface flex-1 overflow-y-auto">
                            <BatchResultVisual data={detail} />
                        </div>
                    ) : (
                        <pre className="p-4 text-xs font-mono overflow-y-scroll flex-1 whitespace-pre-wrap wrap-break-word leading-relaxed bg-zoom-surface min-h-48">
                            {detailLoading
                                ? <span className="text-gray-400 animate-pulse">Waiting for response…</span>
                                : detail === null
                                    ? <span className="text-gray-300 select-none">Response will appear here…</span>
                                    : colorizeJson(JSON.stringify(detail, null, 2))
                            }
                        </pre>
                    )}
                </div>

                {/* Jobs list */}
                <Card className="max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-gray-700 tracking-wide">Jobs</h2>
                            {jobs.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{jobs.length}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                className="px-2 py-1.5 text-xs rounded-lg bg-white border border-gray-200 text-gray-500 focus:outline-none focus:border-zoom-blue/50 cursor-pointer"
                                value={form.stateFilter}
                                onChange={e => set('stateFilter', e.target.value)}
                            >
                                <option value="">All states</option>
                                {Object.keys(STATE_META).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button
                                type="button"
                                onClick={loadJobs}
                                disabled={loadingJobs}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                {loadingJobs ? <Spinner /> : '↺'}
                                {loadingJobs ? 'Loading' : 'Refresh'}
                            </button>
                        </div>
                    </div>

                    {jobs.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <p className="text-sm text-gray-500">No jobs yet. Submit one or click Refresh.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-1">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        {['Job ID', 'State', ''].map(h => (
                                            <th key={h} className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider py-2 px-3">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {jobs.map(job => (
                                        <tr key={job.job_id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="py-2 px-3 font-mono text-xs text-gray-500 max-w-28 truncate">{job.job_id}</td>
                                            <td className="py-2 px-3"><StateBadge state={job.state} /></td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    {([
                                                        ['status', 'Status'],
                                                        ['files', 'Files'],
                                                        ['cancel', 'Cancel'],
                                                    ] as const).map(([action, label]) => (
                                                        <button
                                                            key={action}
                                                            onClick={() => jobAction(action, job.job_id)}
                                                            className={[
                                                                'px-2 py-0.5 text-[11px] rounded-md border transition-all',
                                                                action === 'cancel'
                                                                    ? 'border-red-200 text-red-500 hover:bg-red-50'
                                                                    : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                                                            ].join(' ')}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    )
}
