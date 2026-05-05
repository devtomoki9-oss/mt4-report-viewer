import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const TOPIC_IDS = ['sync', 'ea', 'auth', 'plan']

const html = (s) => ({ __html: s })

export default function HelpModal({ onClose }) {
  const { t } = useTranslation()
  const [active, setActive] = useState('sync')

  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">{t('help.title')}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        {/* トピック選択タブ */}
        <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0 overflow-x-auto">
          {TOPIC_IDS.map(id => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap font-medium transition-colors flex-shrink-0
                ${active === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-300 bg-[#0d1117] border border-[#1f2d40]'}`}>
              {t(`help.topics.${id}`)}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3 text-xs text-slate-400 leading-relaxed">
          <Section topicId={active} t={t} />
        </div>
      </div>
    </div>
  )
}

function Section({ topicId, t }) {
  const intro = t(`help.${topicId}.intro`, { defaultValue: '' })
  const items = t(`help.${topicId}.items`, { returnObjects: true }) || []

  return (
    <div className="space-y-3">
      {intro && <p className="text-slate-500">{intro}</p>}
      {items.map((item, i) => (
        <CheckItem key={i} n={item.n} title={item.title}>
          {item.body && <p dangerouslySetInnerHTML={html(item.body)} />}
          {item.options && (
            <div className="mt-2">
              <div className="bg-[#111827] border border-[#1f2d40] rounded px-3 py-2 space-y-1">
                {item.options.map(([v, desc]) => (
                  <div key={v} className="flex gap-3">
                    <span className="text-slate-300 font-mono w-12 flex-shrink-0">{v}</span>
                    <span className="text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.body2 && <p className="mt-1" dangerouslySetInnerHTML={html(item.body2)} />}
          {topicId === 'sync' && item.n === '3' && <Code copyTitle={t('common.copy')}>{`%USERPROFILE%\\MTExport\\`}</Code>}
          {topicId === 'sync' && item.n === '4' && <Code copyTitle={t('common.copy')}>{'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'}</Code>}
          {topicId === 'sync' && item.n === '6' && (
            <>
              <Code copyTitle={t('common.copy')}>{'Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-supabase.ps1"'}</Code>
              <Code copyTitle={t('common.copy')}>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</Code>
            </>
          )}
          {item.items && (
            <ul className="list-disc list-inside space-y-1 mt-1 ml-1">
              {item.items.map((it, j) => <li key={j} dangerouslySetInnerHTML={html(it)} />)}
            </ul>
          )}
          {topicId === 'sync' && item.n === 'Q' && item.title && item.title.startsWith && (item.body3 || item.body4) && null}
          {item.body3 && (
            <p className="mt-1.5" dangerouslySetInnerHTML={html(item.body3)} />
          )}
          {topicId === 'sync' && item.body4 && item.n === 'Q' && (
            <>
              <Code copyTitle={t('common.copy')}>{`%USERPROFILE%\\MTExport\\`}</Code>
              <p className="mt-1.5" dangerouslySetInnerHTML={html(item.body4)} />
            </>
          )}
        </CheckItem>
      ))}
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
