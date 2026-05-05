import { useTranslation } from 'react-i18next'
import { INSTALL_BAT } from '../lib/downloadFiles'

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

const html = (s) => ({ __html: s })

export default function ManualModal({ onClose, onDownloadVbs }) {
  const { t } = useTranslation()
  const screens = t('manual.section4.screens', { returnObjects: true }) || []
  const cardOps = t('manual.section4.cardOps', { returnObjects: true }) || []
  const section5Items = t('manual.section5.items', { returnObjects: true }) || []
  const section6Rows  = t('manual.section6.rows',  { returnObjects: true }) || []
  const section6Notes = t('manual.section6.notes', { returnObjects: true }) || []
  const signupSteps = t('manual.section1.signup.steps', { returnObjects: true }) || []
  const loginSteps  = t('manual.section1.login.steps',  { returnObjects: true }) || []
  const mt4Steps    = t('manual.section2.step2.mt4Steps', { returnObjects: true }) || []
  const mt5Steps    = t('manual.section2.step2.mt5Steps', { returnObjects: true }) || []

  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">{t('manual.title')}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6 text-xs text-slate-400 leading-relaxed">

          {/* Intro */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.intro.heading')}</h2>
            <p>{t('manual.intro.body')}</p>
            <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg px-3 py-2 text-slate-500 space-y-0.5">
              <div className="text-slate-400 font-medium text-[11px] mb-1">{t('manual.intro.prerequisitesTitle')}</div>
              <p dangerouslySetInnerHTML={html(t('manual.intro.prerequisitesBody'))} />
            </div>
          </section>

          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section1.heading')}</h2>
            <div className="space-y-2">
              <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5">
                <div className="text-slate-300 font-medium">{t('manual.section1.signup.title')}</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  {signupSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5">
                <div className="text-slate-300 font-medium">{t('manual.section1.login.title')}</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  {loginSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section2.heading')}</h2>
            <p className="text-slate-500">{t('manual.section2.intro')}</p>

            <div className="space-y-2">
              <Step n="①" title={t('manual.section2.step1.title')}>
                <p dangerouslySetInnerHTML={html(t('manual.section2.step1.body'))} />
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => downloadText(INSTALL_BAT, 'install.bat')}
                    className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ install.bat
                  </button>
                  <a href="/MT4ReportExporter.mq4" download="MT4ReportExporter.mq4"
                    className="text-xs text-slate-400 hover:text-slate-200 bg-[#1a2235] border border-[#1f2d40] px-3 py-1.5 rounded-lg transition-colors">
                    ↓ MT4ReportExporter.mq4
                  </a>
                  <a href="/MT5ReportExporter.mq5" download="MT5ReportExporter.mq5"
                    className="text-xs text-slate-400 hover:text-slate-200 bg-[#1a2235] border border-[#1f2d40] px-3 py-1.5 rounded-lg transition-colors">
                    ↓ MT5ReportExporter.mq5
                  </a>
                </div>
                <Code copyTitle={t('common.copy')}>Unblock-File "$env:USERPROFILE\Downloads\install.bat"; & "$env:USERPROFILE\Downloads\install.bat"</Code>
              </Step>

              <Step n="②" title={t('manual.section2.step2.title')}>
                <p>{t('manual.section2.step2.body')}</p>

                <div className="mt-2 space-y-3">
                  <div>
                    <div className="text-slate-300 font-medium mb-1">{t('manual.section2.step2.mt4Title')}</div>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      {mt4Steps.map((s, i) => <li key={i} dangerouslySetInnerHTML={html(s)} />)}
                    </ol>
                  </div>
                  <div>
                    <div className="text-slate-300 font-medium mb-1">{t('manual.section2.step2.mt5Title')}</div>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      {mt5Steps.map((s, i) => <li key={i} dangerouslySetInnerHTML={html(s)} />)}
                    </ol>
                  </div>
                </div>

                <p className="mt-2 text-slate-500">{t('manual.section2.step2.footnote')}</p>
              </Step>

              <Step n="③" title={t('manual.section2.step3.title')}>
                <p dangerouslySetInnerHTML={html(t('manual.section2.step3.body1'))} />
                <p className="mt-1">{t('manual.section2.step3.body2')}</p>
                <p className="mt-1 text-slate-500">{t('manual.section2.step3.body3')}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <a href="/sync-to-supabase.ps1" download="sync-to-supabase.ps1"
                    className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ sync-to-supabase.ps1
                  </a>
                  {onDownloadVbs && (
                    <button onClick={onDownloadVbs}
                      className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                      ↓ run-sync.vbs
                    </button>
                  )}
                </div>
                <p className="mt-1">{t('manual.section2.step3.body4')}</p>
                <Code copyTitle={t('common.copy')}>Unblock-File "$env:USERPROFILE\Downloads\sync-to-supabase.ps1"</Code>
              </Step>

              <Step n="④" title={t('manual.section2.step4.title')}>
                <p>{t('manual.section2.step4.body')}</p>
                <Code copyTitle={t('common.copy')}>{'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'}</Code>
              </Step>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section3.heading')}</h2>
            <div className="space-y-2">
              <Step n="①" title={t('manual.section3.step1.title')}>
                <p dangerouslySetInnerHTML={html(t('manual.section3.step1.body'))} />
              </Step>
              <Step n="②" title={t('manual.section3.step2.title')}>
                <p dangerouslySetInnerHTML={html(t('manual.section3.step2.body'))} />
              </Step>
              <Step n="③" title={t('manual.section3.step3.title')}>
                <p dangerouslySetInnerHTML={html(t('manual.section3.step3.body'))} />
              </Step>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section4.heading')}</h2>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {screens.map(([name, desc]) => (
                  <tr key={name} className="border-b border-[#1f2d40]">
                    <td className="py-2 pr-3 text-slate-300 font-medium whitespace-nowrap">{name}</td>
                    <td className="py-2 text-slate-500">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-slate-500 mt-1">{t('manual.section4.filterNote')}</p>
            <div className="bg-[#0d1117] border border-[#1f2d40] rounded-lg p-3 space-y-1.5 mt-2">
              <div className="text-slate-400 font-medium text-[11px] mb-1">{t('manual.section4.cardOpsTitle')}</div>
              <ul className="list-disc list-inside space-y-1.5 ml-1 text-slate-500">
                {cardOps.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section5.heading')}</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              {section5Items.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section6.heading')}</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1f2d40]">
                  <td className="py-1.5 pr-3 text-slate-500">{t('manual.section6.headers.feature')}</td>
                  <td className="py-1.5 pr-3 text-slate-500 text-center">{t('manual.section6.headers.free')}</td>
                  <td className="py-1.5 text-blue-400 text-center font-medium">{t('manual.section6.headers.pro')}</td>
                </tr>
              </thead>
              <tbody>
                {section6Rows.map(([feat, free, pro]) => (
                  <tr key={feat} className="border-b border-[#1f2d40]">
                    <td className="py-2 pr-3 text-slate-400">{feat}</td>
                    <td className="py-2 pr-3 text-slate-500 text-center">{free}</td>
                    <td className={`py-2 text-center font-medium ${pro === '—' ? 'text-slate-600' : 'text-blue-400'}`}>{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
              {section6Notes.map((note, i) => <li key={i} dangerouslySetInnerHTML={html(note)} />)}
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">{t('manual.section7.heading')}</h2>
            <p>{t('manual.section7.body')}</p>
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

function Code({ children, copyTitle }) {
  return (
    <div className="mt-1.5 bg-[#111827] border border-[#1f2d40] rounded px-2.5 py-1.5 overflow-x-auto flex items-center gap-2">
      <code className="text-green-400 font-mono text-[11px] whitespace-nowrap flex-1 select-all">{children}</code>
      <button
        onClick={() => navigator.clipboard.writeText(children)}
        className="text-slate-600 hover:text-slate-300 flex-shrink-0 transition-colors"
        title={copyTitle}>⎘</button>
    </div>
  )
}
