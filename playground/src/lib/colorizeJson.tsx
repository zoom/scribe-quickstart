export function colorizeJson(json: string): React.ReactNode {
    const parts = json.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)
    return parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i} className="text-gray-500">{part}</span>
        if (part.endsWith(':')) return <span key={i} className="text-blue-300/90">{part}</span>
        if (part === 'true') return <span key={i} className="text-emerald-400">{part}</span>
        if (part === 'false') return <span key={i} className="text-rose-400">{part}</span>
        if (part === 'null') return <span key={i} className="text-gray-500">{part}</span>
        if (/^-?\d/.test(part)) return <span key={i} className="text-amber-300">{part}</span>
        return <span key={i} className="text-emerald-300/80">{part}</span>
    })
}
