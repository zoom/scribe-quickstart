export function colorizeJson(json: string): React.ReactNode {
    const parts = json.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)
    return parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i} className="text-gray-500">{part}</span>
        if (part.endsWith(':')) return <span key={i} className="text-zoom-blue">{part}</span>
        if (part === 'true') return <span key={i} className="text-emerald-600">{part}</span>
        if (part === 'false') return <span key={i} className="text-rose-600">{part}</span>
        if (part === 'null') return <span key={i} className="text-gray-500">{part}</span>
        if (/^-?\d/.test(part)) return <span key={i} className="text-amber-600">{part}</span>
        return <span key={i} className="text-emerald-700">{part}</span>
    })
}
