import { useState } from 'react'
import { updatePassword } from '../lib/supabaseClient'

export default function PasswordResetScreen({ onDone }) {
  const [password, setPassword]   = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [done,     setDone]       = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('パスワードが一致しません')
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
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-slate-200 font-semibold">パスワードを変更しました</h2>
          <button
            onClick={onDone}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ダッシュボードへ戻る
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
          <div className="text-xs text-slate-500">新しいパスワードを設定</div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            placeholder="新しいパスワード（8文字以上）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            className="w-full bg-[#111827] border border-[#1f2d40] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="新しいパスワード（確認）"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={8}
            className={`w-full bg-[#111827] border rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors
              ${confirm && password !== confirm
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-[#1f2d40] focus:border-blue-500'}`}
          />

          {error && (
            <div className="text-red-400 text-xs px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? '処理中…' : 'パスワードを変更'}
          </button>
        </form>
      </div>
    </div>
  )
}
