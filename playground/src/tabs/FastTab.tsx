import { useState, useRef, useCallback } from 'react'
import { AsrConfigForm } from '../components/AsrConfig'
import { JsonResult } from '../components/JsonResult'
import { Card, SectionHeading, Spinner } from '../components/ui'
import { API, defaultAsrConfig, type AsrConfig } from '../lib/constants'

export function FastTab() {
    const [config, setConfig] = useState<AsrConfig>(defaultAsrConfig)
    const [result, setResult] = useState<unknown>(null)
    const [busy, setBusy] = useState(false)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [displayText, setDisplayText] = useState<string | false>(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const handleFile = (file: File | undefined) => {
        if (!file) return
        setFileName(file.name)
        setAudioUrl(URL.createObjectURL(file))
    }

    const submit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        const file = fileRef.current?.files?.[0]
        if (!file) return
        setBusy(true)
        setResult('loading')
        try {
            const body = new FormData()
            body.append('file', file)
            body.append('config', JSON.stringify(config))
            const res = await fetch(`${API}/transcribe`, { method: 'POST', body })
            const resJson = await res.json()
            setResult(resJson)
            setDisplayText(resJson?.result?.text_display ?? '')
        } catch (err) {
            setResult({ error: String(err) })
        } finally {
            setBusy(false)
        }
    }, [config])

    return (
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start gap-5">
            <form onSubmit={submit} className="flex flex-col gap-5">
                <Card>
                    <SectionHeading title="Audio File" />
                    <div
                        className={[
                            'relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer',
                            dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/12 hover:border-white/25 bg-white/2',
                        ].join(' ')}
                        onDragOver={e => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => {
                            e.preventDefault()
                            setDragging(false)
                            const file = e.dataTransfer.files[0]
                            if (file && fileRef.current) {
                                const dt = new DataTransfer()
                                dt.items.add(file)
                                fileRef.current.files = dt.files
                                handleFile(file)
                            }
                        }}
                        onClick={() => fileRef.current?.click()}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept="audio/*,video/*"
                            required
                            className="sr-only"
                            onChange={e => handleFile(e.target.files?.[0])}
                        />
                        <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                            {fileName ? (
                                <>
                                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">♪</div>
                                    <span className="text-sm font-medium text-gray-200">{fileName}</span>
                                    <span className="text-xs text-gray-500">Click to change file</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-500">↑</div>
                                    <span className="text-sm text-gray-400">Drop audio file here or <span className="text-indigo-400">browse</span></span>
                                    <span className="text-xs text-gray-600">wav · mp3 · m4a · flac · ogg · webm · mp4 · mov — max 100 MB</span>
                                </>
                            )}
                        </div>
                    </div>

                    {audioUrl && (
                        <audio src={audioUrl} controls className="mt-3 w-full rounded-lg h-10" />
                    )}
                </Card>

                <Card>
                    <SectionHeading title="Transcription Config" />
                    <AsrConfigForm value={config} onChange={setConfig} />
                </Card>

                <button
                    type="submit"
                    disabled={busy}
                    className={[
                        'flex items-center gap-2 self-start px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150',
                        busy
                            ? 'bg-indigo-600/50 text-indigo-300 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-lg shadow-indigo-900/40',
                    ].join(' ')}
                >
                    {busy && <Spinner />}
                    {busy ? 'Transcribing…' : '▶ Transcribe'}
                </button>
            </form>
            <div className="lg:sticky lg:top-20">
                <div className="mb-4 rounded-xl border border-white/8 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6 bg-white/4">
                        <div className={`w-2 h-2 rounded-full transition-colors ${result === 'loading' ? 'bg-yellow-400 animate-pulse' : displayText ? 'bg-emerald-400' : 'bg-white/10'}`} />
                        <span className="text-xs font-medium text-gray-400">Transcript</span>
                    </div>
                    <p className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap wrap-break-word bg-[#070b12] min-h-32">
                        {result === 'loading'
                            ? <span className="text-gray-500 animate-pulse">Waiting for response…</span>
                            : displayText
                                ? <span className="text-slate-200">{displayText}</span>
                                : <span className="text-white/10 select-none">Transcript will appear here…</span>
                        }
                    </p>
                </div>
                <JsonResult data={result === 'loading' ? null : result} loading={result === 'loading'} />
            </div>
        </div>
    )
}
