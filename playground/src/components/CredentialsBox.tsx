import { Toggle } from './ui'
import { inputCls } from '../lib/constants'

export function CredentialsBox({
    title,
    fromEnv,
    onFromEnvChange,
    keyId, onKeyId,
    secret, onSecret,
    session, onSession,
    envNote,
}: {
    title: string
    fromEnv: boolean
    onFromEnvChange: (v: boolean) => void
    keyId: string; onKeyId: (v: string) => void
    secret: string; onSecret: (v: string) => void
    session: string; onSession: (v: string) => void
    envNote?: string
}) {
    return (
        <div className="pt-3 border-t border-dashed border-gray-200">
            <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => onFromEnvChange(!fromEnv)}
            >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</span>
                <div className="flex items-center gap-2.5">
                    <span className={[
                        'text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-200',
                        fromEnv
                            ? 'bg-zoom-blue/8 text-zoom-blue'
                            : 'bg-amber-50 text-amber-600',
                    ].join(' ')}>
                        {fromEnv ? 'Environment' : 'Manual'}
                    </span>
                    <Toggle checked={fromEnv} onChange={onFromEnvChange} />
                </div>
            </div>

            {fromEnv ? (
                <p className="text-xs text-gray-500 leading-relaxed mt-2">
                    {envNote ?? 'Using AWS Access Key, ID & Session Token from the server environment.'}
                </p>
            ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Access Key ID</label>
                        <input className={inputCls + ' font-mono text-xs'} value={keyId} onChange={e => onKeyId(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Secret Access Key</label>
                        <input className={inputCls + ' font-mono text-xs'} type="password" value={secret} onChange={e => onSecret(e.target.value)} placeholder="••••••••••••••••" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Session Token</label>
                        <input className={inputCls + ' font-mono text-xs'} type="password" value={session} onChange={e => onSession(e.target.value)} placeholder="FwoGZX…" />
                    </div>
                </div>
            )}
        </div>
    )
}
