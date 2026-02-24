import { colorizeJson } from '../lib/colorizeJson'

export function JsonResult({ data, loading }: { data: unknown; loading?: boolean }) {
    const isEmpty = data === null && !loading
    const json = isEmpty ? '' : JSON.stringify(data, null, 2)
    const isError = data && typeof data === 'object' && 'error' in (data as object)

    return (
        <div className={`rounded-xl border overflow-hidden transition-all duration-300 h-full flex flex-col ${isError ? 'border-red-500/30' : 'border-white/8'}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${isError ? 'bg-red-950/40 border-red-500/20' : 'bg-white/4 border-white/6'}`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors ${loading ? 'bg-yellow-400 animate-pulse' : isEmpty ? 'bg-white/10' : isError ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    <span className="text-xs font-medium text-gray-400">Response</span>
                </div>
                {!loading && !isEmpty && (
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(json)}
                        className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                    >
                        Copy
                    </button>
                )}
            </div>
            <pre className="p-4 text-xs font-mono overflow-y-scroll flex-1 whitespace-pre-wrap wrap-break-word leading-relaxed bg-[#070b12] min-h-48 max-h-[calc(100vh-12rem)]">
                {loading
                    ? <span className="text-gray-500 animate-pulse">Waiting for response…</span>
                    : isEmpty
                        ? <span className="text-white/10 select-none">Response will appear here…</span>
                        : colorizeJson(json)
                }
            </pre>
        </div>
    )
}
