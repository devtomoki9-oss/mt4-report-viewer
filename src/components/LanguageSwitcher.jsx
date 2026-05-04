import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../i18n'

export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = (i18n.resolvedLanguage || i18n.language || 'ja').split('-')[0]
  const currentLabel = LANGUAGE_LABELS[current] ?? current.toUpperCase()

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const change = (lng) => {
    i18n.changeLanguage(lng)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('language.switcher.label')}
        title={t('language.switcher.label')}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#111827] border border-[#1f2d40] hover:border-slate-600 text-xs text-slate-400 transition-colors">
        <span aria-hidden="true">🌐</span>
        <span className={compact ? 'hidden sm:inline' : ''}>{currentLabel}</span>
        <span className="text-slate-600 text-[10px]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('language.switcher.label')}
          className="absolute right-0 top-full mt-1 w-36 bg-[#111827] border border-[#1f2d40] rounded-xl shadow-2xl py-1 z-50">
          {SUPPORTED_LANGUAGES.map(lng => {
            const selected = lng === current
            return (
              <button
                key={lng}
                role="option"
                aria-selected={selected}
                onClick={() => change(lng)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  selected
                    ? 'text-blue-400 bg-[#1a2235]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2235]'
                }`}>
                {LANGUAGE_LABELS[lng] ?? lng.toUpperCase()}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
