import { useState } from 'react'

export function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={[
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none',
                checked ? 'bg-indigo-500' : 'bg-white/10',
            ].join(' ')}
        >
            <span className={[
                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
                checked ? 'translate-x-4.5' : 'translate-x-0.5',
            ].join(' ')} />
        </button>
    )
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div
            className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg bg-white/3 border border-white/6 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => onChange(!checked)}
        >
            <div>
                <div className="text-sm text-gray-200">{label}</div>
                {hint && <div className="text-xs text-gray-600 mt-0.5">{hint}</div>}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</label>
            <p className="text-xs text-gray-600 leading-relaxed min-h-4">{hint ?? ''}</p>
            {children}
        </div>
    )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-xl border border-white/8 bg-white/3 p-5 ${className}`}>
            {children}
        </div>
    )
}

export function CollapsibleCard({
    title, children, defaultOpen = true,
}: {
    title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-white/3 transition-colors"
            >
                <h2 className="text-sm font-semibold text-gray-300 tracking-wide">{title}</h2>
                <span className={`text-gray-600 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {open && <div className="px-5 pb-5">{children}</div>}
        </div>
    )
}

export function SectionHeading({ title }: { title: string }) {
    return (
        <h2 className="text-sm font-semibold text-gray-300 tracking-wide mb-4">{title}</h2>
    )
}
