import { useTranslation } from 'react-i18next'

export function CodeCopyBlock({ code, label }) {
  const { t } = useTranslation()
  const tip = label || t('common.copy')
  return (
    <div className="flex items-center gap-2 bg-[#0d1117] border border-border rounded px-2.5 py-1.5 overflow-x-auto">
      <code className="text-green-400 font-mono text-[11px] whitespace-nowrap flex-1 select-all">{code}</code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(code)}
        className="text-slate-600 hover:text-slate-300 flex-shrink-0 transition-colors"
        aria-label={tip}
        title={tip}
      >
        ⎘
      </button>
    </div>
  )
}

export default function SetupStep({ number, title, description, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold text-xs"
        >
          {number}
        </span>
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          {description && <p className="text-xs text-slate-500">{description}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
