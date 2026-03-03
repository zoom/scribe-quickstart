export const API = '/api'

export const inputCls = [
    'w-full px-3 py-2 rounded-lg text-sm text-gray-900',
    'bg-white border border-gray-200',
    'focus:outline-none focus:border-zoom-blue/60 focus:ring-1 focus:ring-zoom-blue/30',
    'placeholder:text-gray-400 transition-all duration-150',
].join(' ')

export const selectCls = inputCls + ' cursor-pointer'

export type AsrConfig = {
    language: string
    channel_separation: boolean
}

export const defaultAsrConfig: AsrConfig = {
    language: 'en-US',
    channel_separation: false,
}
