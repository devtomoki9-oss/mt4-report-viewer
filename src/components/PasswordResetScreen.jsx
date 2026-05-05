import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updatePassword } from '../lib/supabaseClient'

export default function PasswordResetScreen({ onDone }) {
  const { t } = useTranslation()
  const [password, setPassword]   = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [done,     setDone]       = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('auth.errors.passwordsMismatch'))
      return
    }
    setLoading(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-2">
            <div className="text-4xl">✅</div>
            <h2 className="text-slate-200 font-semibold">{t('passwordReset.successTitle')}</h2>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 space-y-1">
            <div className="text-amber-400 text-xs font-semibold">{t('passwordReset.resyncTitle')}</div>
            <div className="text-amber-300/70 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: t('passwordReset.resyncBody') }} />
          </div>
          <div className="text-center">
            <button
              onClick={onDone}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {t('passwordReset.back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold text-slate-100 tracking-tight">{t('app.productName')}</div>
          <div className="text-xs text-slate-500">{t('passwordReset.title')}</div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            placeholder={t('passwordReset.newPassword')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder={t('passwordReset.newPasswordConfirm')}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={8}
            className={`w-full bg-surface border rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors
              ${confirm && password !== confirm
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-border focus:border-blue-500'}`}
          />

          {error && (
            <div className="text-red-400 text-xs px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? t('common.processing') : t('passwordReset.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
