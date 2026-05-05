import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn, signUp, resetPasswordForEmail } from '../lib/supabaseClient'
import PrivacyPolicy from './PrivacyPolicy'
import TermsModal from './TermsModal'

function translateAuthError(msg, t) {
  if (!msg) return t('auth.errors.unknown')
  const m = msg.toLowerCase()
  if (m.includes('email rate limit') || m.includes('rate limit'))
    return t('auth.errors.rateLimit')
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return t('auth.errors.invalidCredentials')
  if (m.includes('email not confirmed'))
    return t('auth.errors.emailNotConfirmed')
  if (m.includes('user already registered'))
    return t('auth.errors.userAlreadyRegistered')
  if (m.includes('password should be at least'))
    return t('auth.errors.passwordTooShort')
  if (m.includes('unable to validate email'))
    return t('auth.errors.invalidEmail')
  return msg
}

export default function LoginScreen({ onLogin, initialMode = 'login' }) {
  const { t } = useTranslation()
  const [mode,          setMode]          = useState(initialMode)
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [confirm,       setConfirm]       = useState('')
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [done,          setDone]          = useState(false)
  const [showPrivacy,   setShowPrivacy]   = useState(false)
  const [showTerms,     setShowTerms]     = useState(false)

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setConfirm('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && password !== confirm) {
      setError(t('auth.errors.passwordsMismatch'))
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        const user = await signIn(email, password)
        onLogin(user)
      } else if (mode === 'signup') {
        await signUp(email, password)
        setDone(true)
      } else if (mode === 'forgot') {
        await resetPasswordForEmail(email)
        setDone(true)
      }
    } catch (err) {
      setError(translateAuthError(err.message, t))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    const isForgot = mode === 'forgot'
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✉️</div>
          <h2 className="text-slate-200 font-semibold">
            {isForgot ? t('auth.done.forgotTitle') : t('auth.done.signupTitle')}
          </h2>
          <p className="text-slate-500 text-sm">
            {isForgot
              ? t('auth.done.forgotBody', { email })
              : t('auth.done.signupBody', { email })}
          </p>
          <button
            onClick={() => { switchMode('login'); setDone(false) }}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            {t('auth.done.backToLogin')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold text-slate-100 tracking-tight">{t('app.productName')}</div>
          <div className="text-xs text-slate-500">
            {mode === 'login' ? t('auth.login.title')
              : mode === 'signup' ? t('auth.signup.title')
              : t('auth.forgot.title')}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            placeholder={t('auth.fields.email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-[#111827] border border-[#1f2d40] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder={t('auth.fields.password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[#111827] border border-[#1f2d40] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          )}
          {mode === 'signup' && (
            <input
              type="password"
              placeholder={t('auth.fields.passwordConfirm')}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              className={`w-full bg-[#111827] border rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors
                ${confirm && password !== confirm
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-[#1f2d40] focus:border-blue-500'}`}
            />
          )}

          {error && (
            <div className="text-red-400 text-xs px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? t('common.processing')
              : mode === 'login' ? t('auth.login.submit')
              : mode === 'signup' ? t('auth.signup.submit')
              : t('auth.forgot.submit')}
          </button>
        </form>

        <div className="text-center text-xs text-slate-600 space-y-2">
          {mode === 'login' && (
            <>
              <div>
                {t('auth.login.noAccountPrompt')}{' '}
                <button onClick={() => switchMode('signup')} className="text-blue-400 hover:text-blue-300">
                  {t('auth.login.signupLink')}
                </button>
              </div>
              <div>
                <button onClick={() => switchMode('forgot')} className="text-slate-500 hover:text-slate-300">
                  {t('auth.login.forgotLink')}
                </button>
              </div>
            </>
          )}
          {mode === 'signup' && (
            <div>
              {t('auth.signup.hasAccountPrompt')}{' '}
              <button onClick={() => switchMode('login')} className="text-blue-400 hover:text-blue-300">
                {t('auth.signup.loginLink')}
              </button>
            </div>
          )}
          {mode === 'forgot' && (
            <div>
              <button onClick={() => switchMode('login')} className="text-slate-500 hover:text-slate-300">
                {t('auth.forgot.backToLogin')}
              </button>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-slate-700">
          {(() => {
            const tmpl = t('auth.agree', {
              privacyLink: '__PRIVACY__',
              termsLink: '__TERMS__',
            })
            const parts = tmpl.split(/(__PRIVACY__|__TERMS__)/g)
            return parts.map((part, i) => {
              if (part === '__PRIVACY__') {
                return <button key={i} onClick={() => setShowPrivacy(true)} className="text-slate-500 hover:text-slate-300 underline">{t('auth.agreePrivacy')}</button>
              }
              if (part === '__TERMS__') {
                return <button key={i} onClick={() => setShowTerms(true)} className="text-slate-500 hover:text-slate-300 underline">{t('auth.agreeTerms')}</button>
              }
              return part
            })
          })()}
        </div>
      </div>

      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      {showTerms   && <TermsModal   onClose={() => setShowTerms(false)} />}
    </div>
  )
}
