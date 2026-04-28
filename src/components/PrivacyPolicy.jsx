export default function PrivacyPolicy({ onClose }) {
  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">プライバシーポリシー</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs text-slate-400 leading-relaxed">

          <p className="text-slate-500">最終更新日：2025年5月1日</p>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">1. はじめに</h2>
            <p>本サービス「MT Report Viewer」（以下「本サービス」）は、MT4/MT5 の取引レポートを集約・可視化するウェブアプリケーションです。本ポリシーは、本サービスがユーザーの情報をどのように収集・利用・管理するかを説明します。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">2. 収集する情報</h2>
            <p>本サービスは以下の情報を収集・保存します：</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>メールアドレス・パスワード（認証情報）</li>
              <li>MT4/MT5 の取引履歴（取引日時・通貨ペア・損益など）</li>
              <li>口座情報（残高・有効証拠金・クレジット）</li>
              <li>保有ポジション情報</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">3. 情報の利用目的</h2>
            <p>収集した情報は以下の目的のみに使用します：</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>取引成績の集計・表示</li>
              <li>ユーザー認証・ログイン管理</li>
              <li>サービスの改善・不具合対応</li>
            </ul>
            <p>第三者への提供・販売は一切行いません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">4. データの保管</h2>
            <p>データは <span className="text-slate-300">Supabase</span>（PostgreSQL）に保存されます。各ユーザーは自分のデータのみ閲覧・操作できます（Row Level Security により制御）。ただし、サービス運営者はサービス運営・障害対応の目的でデータにアクセスできます。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">5. データの保持・削除</h2>
            <p>アカウント削除を希望する場合は、アプリ内の設定またはサービス運営者へのご連絡によりデータを削除します。削除されたデータは復元できません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">6. セキュリティ</h2>
            <p>データは暗号化された通信（HTTPS）で送受信されます。パスワードは暗号化して保存されます。ただし、インターネット上での完全なセキュリティを保証するものではありません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">7. Cookie・ローカルストレージ</h2>
            <p>本サービスはセッション管理のためにブラウザのローカルストレージを使用します。広告目的のトラッキングは行いません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">8. 本ポリシーの変更</h2>
            <p>本ポリシーは予告なく変更される場合があります。重要な変更がある場合はアプリ内でお知らせします。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">9. お問い合わせ</h2>
            <p>プライバシーに関するお問い合わせは、アプリ内のフィードバック機能またはサービス運営者までご連絡ください。</p>
          </section>

        </div>
      </div>
    </div>
  )
}
