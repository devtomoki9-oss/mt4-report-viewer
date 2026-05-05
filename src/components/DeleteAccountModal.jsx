import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function DeleteAccountModal({ onConfirm, onClose, loading, isPro = false }) {
  const { t } = useTranslation()
  const confirmKeyword = t('deleteAccount.confirmKeyword')
  const [input, setInput] = useState('')
  const confirmed = input === confirmKeyword

  return (
    <div
      className="fixed inset-0 bg-bg/90 backdrop-blur flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠</span>
            <h2 className="text-sm font-semibold text-red-400">{t('deleteAccount.title')}</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('deleteAccount.warning')}
          </p>
          {isPro && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
              {t('deleteAccount.proWarning')}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-500">{t('deleteAccount.confirmInstructionPart1')} <span className="text-slate-300 font-mono">{confirmKeyword}</span> {t('deleteAccount.confirmInstructionPart2')}</label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-red-500/50"
            placeholder={confirmKeyword}
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-surface2 border border-border text-slate-400 hover:text-slate-200 disabled:opacity-50 text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {loading ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
