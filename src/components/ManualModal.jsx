export default function ManualModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">操作マニュアル</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6 text-xs text-slate-400 leading-relaxed">

          {/* 概要 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">MT Report Viewer とは</h2>
            <p>MT4 / MT5 の取引レポートをクラウドに自動アップロードし、複数口座の成績をブラウザで一元管理するアプリです。PC 上の PowerShell スクリプトが 1 分ごとにデータを送信し、どこからでも最新の取引状況を確認できます。</p>
          </section>

          {/* アカウント登録 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">1. アカウント登録・ログイン</h2>
            <div className="space-y-2">
              <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5">
                <div className="text-slate-300 font-medium">新規登録</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>ログイン画面の「新規登録」をクリック</li>
                  <li>メールアドレスとパスワード（8文字以上）を入力して「登録」</li>
                  <li>確認メールが届いたらリンクをクリックして登録完了</li>
                  <li>「ログイン画面へ戻る」からログイン</li>
                </ol>
              </div>
              <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5">
                <div className="text-slate-300 font-medium">ログイン</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>メールアドレスとパスワードを入力して「ログイン」</li>
                </ol>
              </div>
            </div>
          </section>

          {/* 初回セットアップ */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">2. 初回セットアップ（PC側）</h2>
            <p className="text-slate-500">ログイン後のセットアップ画面に表示されるダウンロードボタンから各ファイルを入手できます。</p>

            <div className="space-y-2">
              <Step n="①" title="EA のインストール">
                <p><code className="font-mono bg-[#1a2235] px-1 rounded">install.bat</code>・<code className="font-mono bg-[#1a2235] px-1 rounded">MT4ReportExporter.mq4</code>・<code className="font-mono bg-[#1a2235] px-1 rounded">MT5ReportExporter.mq5</code> を同じフォルダにダウンロードし、PowerShell で実行します。</p>
                <Code>Unblock-File "$env:USERPROFILE\Downloads\install.bat"; & "$env:USERPROFILE\Downloads\install.bat"</Code>
              </Step>

              <Step n="②" title="MT4/MT5 の初期設定">
                <p>install.bat が MT4/MT5 を自動起動します。開いた各ウィンドウで以下を行います。</p>

                <div className="mt-2 space-y-3">
                  <div>
                    <div className="text-slate-300 font-medium mb-1">MT4 の場合</div>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>ファイル → 新規チャート → 任意のチャートを選択</li>
                      <li>ナビゲーター → Experts から <strong className="text-slate-300">MT4ReportExporter</strong> をチャートにドラッグ → OK</li>
                      <li>ファイル → チャートの組表示 → 名前を付けて保存 → <strong className="text-slate-300">MTExporter</strong> → OK</li>
                      <li>ファイル → 終了</li>
                    </ol>
                  </div>
                  <div>
                    <div className="text-slate-300 font-medium mb-1">MT5 の場合</div>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>ファイル → 新規チャート → 任意のチャートを選択</li>
                      <li>ナビゲーター → Experts から <strong className="text-slate-300">MT5ReportExporter</strong> をチャートにドラッグ → OK</li>
                      <li>ファイル → チャートのプロファイル → 保存 → <strong className="text-slate-300">MTExporter</strong> → OK</li>
                      <li>ファイル → 終了</li>
                    </ol>
                  </div>
                </div>

                <p className="mt-2 text-slate-500">※ MT4 と MT5 の両方をお使いの場合は、それぞれのウィンドウで実施してください。</p>
              </Step>

              <Step n="③" title="同期スクリプトの設定">
                <p><code className="font-mono bg-[#1a2235] px-1 rounded">sync-to-supabase.ps1</code> と <code className="font-mono bg-[#1a2235] px-1 rounded">run-sync.vbs</code> を同じフォルダにダウンロードします。</p>
                <p className="mt-1">run-sync.vbs ダウンロード時はパスワード入力ダイアログが表示されます。ログインパスワードを入力してください（接続情報がファイルに埋め込まれます）。</p>
                <p className="mt-1">次に PS1 ファイルのブロックを解除します。</p>
                <Code>Unblock-File "$env:USERPROFILE\Downloads\sync-to-supabase.ps1"</Code>
              </Step>

              <Step n="④" title="タスクスケジューラへの登録">
                <p>ファイル変更を検知してリアルタイムでアップロードするよう登録します。PowerShell で実行してください。</p>
                <Code>{'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'}</Code>
              </Step>
            </div>
          </section>

          {/* 通常の使い方 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">3. 通常の使い方</h2>
            <div className="space-y-2">
              <Step n="①" title="MT4/MT5 の起動">
                <p>セットアップ後はデスクトップの <strong className="text-slate-300">MT_Exporter.bat</strong> から MT4/MT5 を起動してください。EA が自動でロードされ、<code className="font-mono bg-[#1a2235] px-1 rounded">%USERPROFILE%\MTExport\</code> フォルダへ JSON を書き出します。</p>
              </Step>
              <Step n="②" title="レポートの確認">
                <p>ブラウザでアプリにアクセスし、ログインするとデータが自動で読み込まれます。データが表示されない場合は画面上部の <strong className="text-slate-300">↻ 更新</strong> ボタンを押してください。</p>
              </Step>
              <Step n="③" title="自動更新">
                <p>データがある状態では 1 分ごとに自動で最新データへ更新されます。手動で即時更新したい場合は <strong className="text-slate-300">↻ 更新</strong> ボタンを使用してください。</p>
              </Step>
            </div>
          </section>

          {/* 画面説明 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">4. 各画面の説明</h2>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {[
                  ['サマリー', '全口座合算の損益・勝率・PF・エクイティカーブ・保有ポジション一覧'],
                  ['口座別成績', '口座ごとの詳細な統計・エクイティカーブ・取引履歴'],
                  ['全取引', '全口座の取引履歴を一覧・検索・フィルタ'],
                ].map(([tab, desc]) => (
                  <tr key={tab} className="border-b border-[#1f2d40]">
                    <td className="py-2 pr-3 text-slate-300 font-medium whitespace-nowrap">{tab}</td>
                    <td className="py-2 text-slate-500">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-slate-500 mt-1">画面上部の期間フィルターで集計対象期間を絞り込めます。</p>
          </section>

          {/* アカウント管理 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">5. アカウント管理</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li><strong className="text-slate-300">ログアウト</strong>：画面右上の「ログアウト」をクリック</li>
              <li><strong className="text-slate-300">アカウント削除</strong>：画面右上の「アカウント削除」→「削除」と入力して確定。すべてのデータが完全に削除されます（取り消し不可）</li>
            </ul>
          </section>

          {/* お問い合わせ */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">6. お問い合わせ</h2>
            <p>ご不明な点や不具合は画面下部の「お問い合わせ」からご連絡ください。</p>
          </section>

        </div>
      </div>
    </div>
  )
}

function Step({ n, title, children }) {
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
