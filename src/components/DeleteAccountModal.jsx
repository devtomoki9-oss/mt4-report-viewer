import { useState } from 'react'

export default function DeleteAccountModal({ onConfirm, onClose, loading, isPro = false }) {
  const [input, setInput] = useState('')
  const confirmed = input === '削除'

  return (
    <div
      className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111827] border border-[#1f2d40] rounded-2xl w-full max-w-sm p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠</span>
            <h2 className="text-sm font-semibold text-red-400">アカウントを削除</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            この操作は取り消せません。すべてのレポートデータおよび認証情報が完全に削除されます。
          </p>
          {isPro && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
              ⚠ Pro サブスクリプションが有効です。アカウント削除と同時に自動でキャンセルされます。
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-500">確認のため <span className="text-slate-300 font-mono">削除</span> と入力してください</label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-red-500/50"
            placeholder="削除"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-[#1a2235] border border-[#1f2d40] text-slate-400 hover:text-slate-200 disabled:opacity-50 text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {loading ? '削除中…' : 'アカウントを削除'}
          </button>
        </div>
      </div>
    </div>
  )
}
