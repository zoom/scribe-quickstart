import { useState } from 'react'
import { FastTab } from './tabs/FastTab'
import { BatchTab } from './tabs/BatchTab'

type Tab = 'fast' | 'batch'

export default function App() {
    const [tab, setTab] = useState<Tab>('fast')

    return (
        <div className="min-h-screen bg-zoom-base text-gray-900 antialiased">
            <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="Zoom" className="h-5" />
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 leading-none">Scribe API</h1>
                        </div>
                    </div>
                    <div className="flex gap-1 p-1 bg-gray-100 border border-gray-200 rounded-xl">
                        {([
                            ['fast', 'Fast (Sync)', 'Upload & transcribe instantly'],
                            ['batch', 'Batch', 'Process thousands of files'],
                        ] as [Tab, string, string][]).map(([id, label, hint]) => (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                title={hint}
                                className={[
                                    'px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                                    tab === id
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700',
                                ].join(' ')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-5 py-6">
                {tab === 'fast' ? <FastTab /> : <BatchTab />}
            </main>
        </div>
    )
}
