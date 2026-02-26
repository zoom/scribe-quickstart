import { colorizeJson } from '../lib/colorizeJson'

export function JsonResult({ data, loading }: { data: unknown; loading?: boolean }) {
    const isEmpty = data === null && !loading
    const json = isEmpty ? '' : JSON.stringify(data, null, 2)
    const isError = data && typeof data === 'object' && 'error' in (data as object)

    return (
        <div className={`rounded-xl border overflow-hidden transition-all duration-300 h-full flex flex-col ${isError ? 'border-red-300' : 'border-gray-200'}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${isError ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors ${loading ? 'bg-yellow-500 animate-pulse' : isEmpty ? 'bg-gray-300' : isError ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className="text-xs font-medium text-gray-500">Response</span>
                </div>
                {!loading && !isEmpty && (
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(json)}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Copy
                    </button>
                )}
            </div>
            <pre className="p-4 text-xs font-mono overflow-y-scroll flex-1 whitespace-pre-wrap wrap-break-word leading-relaxed bg-zoom-surface min-h-48 max-h-[calc(100vh-12rem)]">
                {loading
                    ? <span className="text-gray-400 animate-pulse">Waiting for response…</span>
                    : isEmpty
                        ? <span className="text-gray-300 select-none">Response will appear here…</span>
                        : colorizeJson(json)
                }
            </pre>
        </div>
    )
}
