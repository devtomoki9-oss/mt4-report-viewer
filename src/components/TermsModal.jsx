export default function TermsModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">利用規約</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs text-slate-400 leading-relaxed">

          <p className="text-slate-500">最終更新日：2025年5月1日</p>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第1条（適用）</h2>
            <p>本利用規約（以下「本規約」）は、本サービス「MT Report Viewer」（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意した上で本サービスを利用するものとします。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第2条（サービスの内容）</h2>
            <p>本サービスは、MT4 / MT5 の取引レポートをクラウドに保存・集約し、ブラウザ上で成績を可視化するウェブアプリケーションです。本サービスは投資助言・売買推奨を行うものではありません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第3条（アカウント）</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>ユーザーは正確な情報を用いてアカウントを登録するものとします。</li>
              <li>アカウントおよびパスワードの管理はユーザー自身の責任とします。</li>
              <li>第三者へのアカウントの譲渡・貸与は禁止します。</li>
              <li>不正利用が発覚した場合、予告なくアカウントを停止することがあります。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第4条（禁止事項）</h2>
            <p>ユーザーは以下の行為を行ってはなりません。</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>法令または公序良俗に違反する行為</li>
              <li>本サービスの運営を妨害する行為</li>
              <li>不正アクセスやリバースエンジニアリング</li>
              <li>他のユーザーのデータへの不正アクセスの試み</li>
              <li>本サービスを商業目的で無断利用する行為</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第5条（免責事項）</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>本サービスは現状有姿で提供されます。データの正確性・完全性・継続性を保証しません。</li>
              <li>本サービスの利用により生じた損害（取引上の損失を含む）について、運営者は一切の責任を負いません。</li>
              <li>サーバー障害・メンテナンス等によりサービスが停止する場合があります。</li>
              <li>本サービスは投資判断の根拠として利用することを想定していません。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第6条（サービスの変更・終了）</h2>
            <p>運営者は予告なく本サービスの内容を変更、または提供を終了することがあります。終了の際はアプリ内または登録メールアドレス宛に可能な範囲でお知らせします。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第7条（知的財産権）</h2>
            <p>本サービスに関する著作権・商標権その他の知的財産権は運営者に帰属します。ユーザーが本サービスにアップロードしたデータの権利はユーザー自身に帰属します。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第8条（規約の変更）</h2>
            <p>本規約は予告なく変更される場合があります。変更後も本サービスを継続して利用した場合、変更後の規約に同意したものとみなします。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">第9条（準拠法・管轄裁判所）</h2>
            <p>本規約は日本法に準拠します。本サービスに関する紛争は、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
          </section>

        </div>
      </div>
    </div>
  )
}
