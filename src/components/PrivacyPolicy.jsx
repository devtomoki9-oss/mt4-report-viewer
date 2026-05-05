import { useTranslation } from 'react-i18next'

export default function PrivacyPolicy({ onClose }) {
  const { t } = useTranslation()
  const sections = t('privacy.sections', { returnObjects: true }) || []
  return (
    <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2d40] flex-shrink-0">
          <div className="text-sm font-semibold text-slate-100">{t('privacy.title')}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs text-slate-400 leading-relaxed">

          <p className="text-slate-500">{t('privacy.lastUpdated')}</p>

          {sections.map((s, idx) => (
            <section key={idx} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-200">{s.title}</h2>
              {s.body && <p>{s.body}</p>}
              {s.items && (
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {s.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              {s.note && <p>{s.note}</p>}
            </section>
          ))}

        </div>
      </div>
    </div>
  )
}
