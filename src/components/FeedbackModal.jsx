import { useState } from 'react'

const CONTACT_EMAIL = 'devtomoki9@gmail.com'

export default function FeedbackModal({ onClose }) {
  const [message, setMessage] = useState('')

  const send = () => {
    const subject = encodeURIComponent('MT Report Viewer お問い合わせ')
    const body    = encodeURIComponent(message)
    window.open(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111827] border border-[#1f2d40] rounded-2xl w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">お問い合わせ</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg px-1">✕</button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          お問い合わせ内容を入力してください。送信ボタンを押すとメールアプリが開きます。
        </p>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          placeholder="お問い合わせ内容を入力してください"
          className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50 resize-none"
          autoFocus
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#1a2235] border border-[#1f2d40] text-slate-400 hover:text-slate-200 text-xs px-4 py-2.5 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={send}
            disabled={!message.trim()}
            className="flex-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-4 py-2.5 rounded-lg transition-colors"
          >
            メールで送信
          </button>
        </div>

        <p className="text-xs text-slate-700 text-center">送信先：{CONTACT_EMAIL}</p>
      </div>
    </div>
  )
}
