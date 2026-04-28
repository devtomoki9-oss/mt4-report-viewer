import { useState } from 'react'
import { signIn, signUp } from '../lib/supabaseClient'
import PrivacyPolicy from './PrivacyPolicy'
import TermsModal from './TermsModal'

function translateAuthError(msg) {
  if (!msg) return '不明なエラーが発生しました'
  const m = msg.toLowerCase()
  if (m.includes('email rate limit') || m.includes('rate limit'))
    return 'メール送信の上限に達しました。しばらく時間をおいてから再度お試しください（Supabase 無料プランの制限）'
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'メールアドレスまたはパスワードが正しくありません'
  if (m.includes('email not confirmed'))
    return '確認メールのリンクをクリックしてから再度ログインしてください'
  if (m.includes('user already registered'))
    return 'このメールアドレスはすでに登録されています'
  if (m.includes('password should be at least'))
    return 'パスワードは8文字以上で入力してください'
  if (m.includes('unable to validate email'))
    return 'メールアドレスの形式が正しくありません'
  return msg
}

export default function LoginScreen({ onLogin }) {
  const [mode,          setMode]          = useState('login')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [done,          setDone]          = useState(false)
  const [showPrivacy,   setShowPrivacy]   = useState(false)
  const [showTerms,     setShowTerms]     = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const user = await signIn(email, password)
        onLogin(user)
      } else {
        await signUp(email, password)
        setDone(true)
      }
    } catch (err) {
      setError(translateAuthError(err.message))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✉️</div>
          <h2 className="text-slate-200 font-semibold">確認メールを送信しました</h2>
          <p className="text-slate-500 text-sm">
            {email} に届いたリンクをクリックして登録を完了してください。
          </p>
          <button
            onClick={() => { setMode('login'); setDone(false) }}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ログイン画面へ戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold text-slate-100 tracking-tight">MT Report Viewer</div>
          <div className="text-xs text-slate-500">
            {mode === 'login' ? 'アカウントにログイン' : '新規アカウント登録'}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-[#111827] border border-[#1f2d40] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="パスワード（8文字以上）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full bg-[#111827] border border-[#1f2d40] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />

          {error && (
            <div className="text-red-400 text-xs px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? '処理中…' : mode === 'login' ? 'ログイン' : '登録'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-600">
          {mode === 'login' ? (
            <>アカウントをお持ちでない方は{' '}
              <button onClick={() => { setMode('signup'); setError('') }} className="text-blue-400 hover:text-blue-300">
                新規登録
              </button>
            </>
          ) : (
            <>すでにアカウントをお持ちの方は{' '}
              <button onClick={() => { setMode('login'); setError('') }} className="text-blue-400 hover:text-blue-300">
                ログイン
              </button>
            </>
          )}
        </div>

        <div className="text-center text-xs text-slate-700">
          登録することで{' '}
          <button onClick={() => setShowPrivacy(true)} className="text-slate-500 hover:text-slate-300 underline">
            プライバシーポリシー
          </button>
          {' '}および{' '}
          <button onClick={() => setShowTerms(true)} className="text-slate-500 hover:text-slate-300 underline">
            利用規約
          </button>
          {' '}に同意したものとみなします
        </div>
      </div>

      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      {showTerms   && <TermsModal   onClose={() => setShowTerms(false)} />}
    </div>
  )
}
