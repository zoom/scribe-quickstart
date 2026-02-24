import type { AsrConfig } from '../lib/constants'
import { inputCls } from '../lib/constants'
import { Field, ToggleRow } from './ui'

export function AsrConfigForm({ value, onChange }: { value: AsrConfig; onChange: (v: AsrConfig) => void }) {
    const set = <K extends keyof AsrConfig>(k: K, v: AsrConfig[K]) => onChange({ ...value, [k]: v })
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Language" hint="BCP-47 code — en-US, es-ES, fr-FR, ja-JP…">
                    <input className={inputCls} value={value.language} onChange={e => set('language', e.target.value)} placeholder="en-US" />
                </Field>
                <Field label="Output Format" hint="json (default) — srt/vtt reserved for future">
                    <input className={inputCls} value={value.output_format} onChange={e => set('output_format', e.target.value)} placeholder="json" />
                </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {/* <ToggleRow label="Timestamps" hint="Include segment-level start/end times" checked={value.timestamps} onChange={v => set('timestamps', v)} /> */}
                <ToggleRow label="Word offsets" hint="Include per-word timing data" checked={value.word_time_offsets} onChange={v => set('word_time_offsets', v)} />
                {/* <ToggleRow label="Diarization" hint="Identify and label individual speakers" checked={value.diarization} onChange={v => set('diarization', v)} /> */}
                <ToggleRow label="Channel separation" hint="Transcribe stereo channels independently" checked={value.channel_separation} onChange={v => set('channel_separation', v)} />
                {/* <ToggleRow label="Profanity filter" hint="Censor profanity in output text" checked={value.profanity_filter} onChange={v => set('profanity_filter', v)} /> */}
            </div>
        </div>
    )
}
