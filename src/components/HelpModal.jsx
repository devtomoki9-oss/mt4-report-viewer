import { useState } from 'react'

const TOPICS = [
  { id: 'report', label: 'レポートが更新されない' },
  { id: 'sync',   label: '自動同期が動かない' },
  { id: 'auth',   label: 'ログイン・パスワード' },
  { id: 'plan',   label: 'プラン・支払い' },
]

export default function HelpModal({ onClose }) {
  const [active, setActive] = useState('report')

  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">ヘルプ / トラブルシューティング</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        {/* トピック選択タブ */}
        <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0 overflow-x-auto">
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap font-medium transition-colors flex-shrink-0
                ${active === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-300 bg-[#0d1117] border border-[#1f2d40]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3 text-xs text-slate-400 leading-relaxed">
          {active === 'report' && <ReportSection />}
          {active === 'sync'   && <SyncSection />}
          {active === 'auth'   && <AuthSection />}
          {active === 'plan'   && <PlanSection />}
        </div>
      </div>
    </div>
  )
}

function ReportSection() {
  return (
    <div className="space-y-3">
      <p className="text-slate-500">ダッシュボードのデータが古い・更新されない場合、以下の順に確認してください。</p>

      <CheckItem n="1" title="↻ 更新ボタンを押す">
        <p>画面右上の <strong className="text-slate-300">↻ 更新</strong> ボタンを押すと、Supabase から最新データを即時取得します。まずこれを試してください。</p>
      </CheckItem>

      <CheckItem n="2" title="MT4/MT5 を MT_Exporter.bat から起動しているか">
        <p>MT4/MT5 は通常のショートカットではなく、デスクトップの <strong className="text-slate-300">MT_Exporter.bat</strong> から起動する必要があります。</p>
        <p className="mt-1">通常のショートカットから起動すると EA がロードされず、JSON ファイルが書き出されません。</p>
      </CheckItem>

      <CheckItem n="3" title="JSON ファイルが生成されているか確認">
        <p>エクスプローラーで以下のフォルダを開き、JSON ファイルが存在するか確認してください。</p>
        <Code>%USERPROFILE%\MTExport\</Code>
        <p className="mt-1">ファイルがない場合、EA が正しく動作していません。MT4/MT5 の「エキスパート」タブでエラーログを確認してください。</p>
      </CheckItem>

      <CheckItem n="4" title="タスクスケジューラーが動作しているか確認">
        <p>スタートメニューで「タスク スケジューラー」を検索して開き、<strong className="text-slate-300">MTExportSync</strong> タスクを探してください。</p>
        <ul className="list-disc list-inside space-y-1 mt-1 ml-1">
          <li>「状態」が <strong className="text-slate-300">準備完了</strong> になっているか</li>
          <li>「前回の実行結果」が <strong className="text-slate-300">操作が正常に完了しました。(0x0)</strong> になっているか</li>
        </ul>
        <p className="mt-1">タスクが存在しない場合は、セットアップ画面からコマンドを再実行してください。</p>
      </CheckItem>

      <CheckItem n="5" title="パスワードを最近変更したか">
        <p><strong className="text-slate-300">run-sync.vbs</strong> にはログインパスワードが埋め込まれています。パスワードを変更した場合、古いパスワードで認証が失敗し同期が止まります。</p>
        <p className="mt-1">ダッシュボードのセットアップ画面から <strong className="text-slate-300">run-sync.vbs を再ダウンロード</strong> し、タスクスケジューラーで登録しているファイルを差し替えてください。</p>
      </CheckItem>

      <CheckItem n="6" title="PS1 ファイルのブロックが解除されているか">
        <p>Windows のセキュリティ設定により、ダウンロードした PowerShell スクリプトが実行をブロックされる場合があります。PowerShell で以下を実行してください。</p>
        <Code>{'Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-supabase.ps1"'}</Code>
      </CheckItem>

      <CheckItem n="Q" title="データの更新間隔を変更したい">
        <p>EA のパラメーター <strong className="text-slate-300">RealtimeSec</strong> で、ティック発生時の最小エクスポート間隔（秒）を変更できます。</p>
        <div className="mt-2 space-y-1">
          <div className="bg-[#111827] border border-[#1f2d40] rounded px-3 py-2 space-y-1">
            {[
              ['5秒', '最短（下限）'],
              ['10秒', 'デフォルト・推奨'],
              ['30秒', '負荷を抑えたい場合'],
              ['60秒', '最低限の更新頻度'],
            ].map(([v, desc]) => (
              <div key={v} className="flex gap-3">
                <span className="text-slate-300 font-mono w-12 flex-shrink-0">{v}</span>
                <span className="text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2"><strong className="text-slate-300">変更手順：</strong>MT4/MT5 でEAのプロパティを開き（チャート上のEAをダブルクリック）、「入力パラメーター」タブの <strong className="text-slate-300">RealtimeSec</strong> を変更して OK を押してください。5秒未満を設定しても内部的に5秒として動作します。</p>
      </CheckItem>
    </div>
  )
}

function SyncSection() {
  return (
    <div className="space-y-3">
      <p className="text-slate-500">タスクスケジューラーへの登録や同期スクリプトに関するトラブルです。</p>

      <CheckItem n="1" title="タスクを手動で再登録する">
        <p>タスクが見つからない・エラーになる場合は、以下のコマンドで再登録できます。スクリプトはファイル変更を検知してリアルタイムで同期します。</p>
        <Code>{'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'}</Code>
        <p className="mt-1">run-sync.vbs のパスは実際に保存した場所に合わせて変更してください。</p>
      </CheckItem>

      <CheckItem n="2" title="タスクを手動で実行してみる">
        <p>タスク スケジューラーで <strong className="text-slate-300">MTExportSync</strong> を右クリック → 「実行」で手動実行できます。「前回の実行結果」にエラーコードが表示される場合は内容をお問い合わせください。</p>
      </CheckItem>

      <CheckItem n="3" title="PowerShell の実行ポリシーを確認">
        <p>PowerShell でスクリプトの実行が禁止されている場合があります。管理者権限の PowerShell で以下を実行してください。</p>
        <Code>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</Code>
      </CheckItem>

      <CheckItem n="4" title="MTExport フォルダのパスを確認">
        <p>sync-to-supabase.ps1 は <code className="font-mono bg-[#1a2235] px-1 rounded">%USERPROFILE%\MTExport\</code> フォルダを監視しています。このフォルダに JSON ファイルが存在するか確認してください。</p>
        <p className="mt-1">MT4/MT5 の「Files」フォルダ内に JSON が書き出されている場合は、EA の設定で出力先が異なる可能性があります。</p>
      </CheckItem>
    </div>
  )
}

function AuthSection() {
  return (
    <div className="space-y-3">
      <CheckItem n="Q" title="パスワードを忘れた">
        <p>ログイン画面の <strong className="text-slate-300">「パスワードをお忘れですか？」</strong> からメールアドレスを入力するとリセットメールが届きます。</p>
        <p className="mt-1">メールが届かない場合は迷惑メールフォルダを確認してください。</p>
      </CheckItem>

<CheckItem n="Q" title="パスワードを変更したら自動同期が止まった">
        <p>run-sync.vbs にはパスワードが埋め込まれているため、変更後は再ダウンロードが必要です。ダッシュボードのセットアップ画面から <strong className="text-slate-300">run-sync.vbs を再ダウンロード</strong> してタスクスケジューラーのファイルを差し替えてください。</p>
      </CheckItem>

      <CheckItem n="Q" title="確認メールが届かない">
        <p>新規登録時の確認メールが届かない場合、迷惑メールフォルダを確認してください。それでも届かない場合はしばらく待ってから再度登録を試みてください。</p>
      </CheckItem>
    </div>
  )
}

function PlanSection() {
  return (
    <div className="space-y-3">
      <CheckItem n="Q" title="支払い後も Free のままになっている">
        <p>Stripe の Webhook 処理に数秒かかる場合があります。画面右上の <strong className="text-slate-300">↻ 更新</strong> ボタンを押してプランが反映されるか確認してください。</p>
        <p className="mt-1">数分経っても変わらない場合はお問い合わせください。</p>
      </CheckItem>

      <CheckItem n="Q" title="サブスクリプションを解約したい">
        <p>画面右上のアカウントメニュー（メールアドレス） → <strong className="text-slate-300">サブスクリプション管理</strong> からキャンセル手続きができます。</p>
        <p className="mt-1">現在の期間終了時に解約となり、それまでは Pro 機能をご利用いただけます。</p>
      </CheckItem>

      <CheckItem n="Q" title="アカウントを削除したらサブスクも解約されるか">
        <p>はい。Pro プランのアカウント削除時は Stripe のサブスクリプションも自動的にキャンセルされます。</p>
      </CheckItem>

      <CheckItem n="Q" title="領収書・請求書を確認したい">
        <p>アカウントメニュー → <strong className="text-slate-300">サブスクリプション管理</strong> から Stripe のカスタマーポータルにアクセスすると、過去の請求履歴や領収書を確認・ダウンロードできます。</p>
      </CheckItem>
    </div>
  )
}

function CheckItem({ n, title, children }) {
  return (
    <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold text-[11px]">{n}</span>
        <span className="text-slate-300 font-medium">{title}</span>
      </div>
      <div className="ml-7 space-y-1 text-slate-500">{children}</div>
    </div>
  )
}

function Code({ children }) {
  return (
    <div className="mt-1.5 bg-[#111827] border border-[#1f2d40] rounded px-2.5 py-1.5 overflow-x-auto flex items-center gap-2">
      <code className="text-green-400 font-mono text-[11px] whitespace-nowrap flex-1 select-all">{children}</code>
      <button
        onClick={() => navigator.clipboard.writeText(children)}
        className="text-slate-600 hover:text-slate-300 flex-shrink-0 transition-colors"
        title="コピー">⎘</button>
    </div>
  )
}
