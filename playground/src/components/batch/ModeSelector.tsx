import type { InputMode } from './types'
import { MODE_DESCRIPTIONS } from './types'

export function ModeSelector({ value, onChange }: { value: InputMode; onChange: (v: InputMode) => void }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {(Object.entries(MODE_DESCRIPTIONS) as [InputMode, typeof MODE_DESCRIPTIONS[InputMode]][]).map(([mode, meta]) => (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    className={[
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-center transition-all duration-150',
                        value === mode
                            ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300'
                            : 'border-white/8 bg-white/2 text-gray-500 hover:border-white/20 hover:text-gray-300',
                    ].join(' ')}
                >
                    <span className="text-xs font-semibold">{meta.title}</span>
                    <span className="text-[10px] leading-tight opacity-70">{meta.hint}</span>
                </button>
            ))}
        </div>
    )
}
