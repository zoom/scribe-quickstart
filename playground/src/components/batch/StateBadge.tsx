import { STATE_META } from './types'

export function StateBadge({ state }: { state: string }) {
    const meta = STATE_META[state] ?? { color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${meta.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {state}
        </span>
    )
}
