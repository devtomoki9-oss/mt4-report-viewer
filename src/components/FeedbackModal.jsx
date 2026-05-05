import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const CONTACT_EMAIL = 'devtomoki9@gmail.com'

export default function FeedbackModal({ onClose }) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')

  const send = () => {
    const subject = encodeURIComponent(t('feedback.subject'))
    const body    = encodeURIComponent(message)
    window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-bg/90 backdrop-blur flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">{t('feedback.title')}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg px-1" aria-label={t('common.close')}>✕</button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          {t('feedback.body')}
        </p>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          placeholder={t('feedback.placeholder')}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 resize-none"
          autoFocus
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-surface2 border border-border text-slate-400 hover:text-slate-200 text-xs px-4 py-2.5 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={send}
            disabled={!message.trim()}
            className="flex-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-4 py-2.5 rounded-lg transition-colors"
          >
            {t('feedback.send')}
          </button>
        </div>

        <p className="text-xs text-slate-700 text-center">{t('feedback.to', { email: CONTACT_EMAIL })}</p>
      </div>
    </div>
  )
}
