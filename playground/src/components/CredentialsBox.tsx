import { Toggle, Field } from './ui'
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
        <div className="rounded-lg border border-white/[0.07] overflow-hidden">
            <div
                className="flex items-center justify-between px-4 py-3 bg-white/4 cursor-pointer hover:bg-white/6 transition-colors"
                onClick={() => onFromEnvChange(!fromEnv)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{fromEnv ? 'from env' : 'custom'}</span>
                    <Toggle checked={fromEnv} onChange={onFromEnvChange} />
                </div>
            </div>
            {fromEnv ? (
                envNote ? (
                    <div className="px-4 py-3">
                        <p className="text-xs text-gray-600">{envNote}</p>
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <p className="text-xs text-gray-600">Using AWS Access Key, ID &amp; Session Token from server environment.</p>
                    </div>
                )
            ) : (
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Access Key ID">
                        <input className={inputCls + ' font-mono text-xs'} value={keyId} onChange={e => onKeyId(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" />
                    </Field>
                    <Field label="Secret Access Key">
                        <input className={inputCls + ' font-mono text-xs'} type="password" value={secret} onChange={e => onSecret(e.target.value)} placeholder="••••••••••••••••" />
                    </Field>
                    <Field label="Session Token">
                        <input className={inputCls + ' font-mono text-xs'} type="password" value={session} onChange={e => onSession(e.target.value)} placeholder="FwoGZX… (optional)" />
                    </Field>
                </div>
            )}
        </div>
    )
}
