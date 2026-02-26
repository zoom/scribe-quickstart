export function KV({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
            <span className={`text-xs text-gray-700 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    )
}
