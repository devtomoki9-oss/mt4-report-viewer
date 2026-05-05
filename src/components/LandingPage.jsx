import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import heroImg from '../assets/hero.png'

export default function LandingPage({ onStart, onLogin }) {
  const { t } = useTranslation()
  const FEATURES   = t('landing.features.items',   { returnObjects: true }) || []
  const USE_CASES  = t('landing.useCases.items',   { returnObjects: true }) || []
  const STEPS      = t('landing.steps.items',      { returnObjects: true }) || []
  const STATS      = t('landing.stats.items',      { returnObjects: true }) || []
  const DISCLAIMER = t('landing.disclaimer.body')
  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 overflow-x-hidden">

      {/* ── ナビ ── */}
      <nav className="border-b border-[#1f2d40] bg-[#0a0e17]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
              📈
            </div>
            <span className="font-semibold text-slate-100 text-sm tracking-tight">{t('app.productNamePro')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <button
              onClick={onLogin}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 transition-colors"
            >
              {t('landing.nav.login')}
            </button>

            <button
              onClick={onStart}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {t('landing.nav.start')}
            </button>
          </div>
        </div>
      </nav>

      {/* ── ヒーロー ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <div className="inline-block text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full mb-6">
          {t('landing.hero.badge')}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-100 mb-4 leading-tight tracking-tight">
          {t('landing.hero.titleLine1')}<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            {t('landing.hero.titleLine2')}
          </span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-3 leading-relaxed">
          {t('landing.hero.subtitle')}
        </p>
        <p className="text-slate-600 text-xs max-w-lg mx-auto mb-10">
          {t('landing.hero.disclaimer')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <button
            onClick={onStart}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors shadow-lg shadow-blue-500/20"
          >
            {t('landing.hero.ctaPrimary')}
          </button>
          <button
            onClick={onLogin}
            className="bg-[#111827] border border-[#1f2d40] text-slate-300 hover:text-slate-100 hover:border-[#2a3d55] font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            {t('landing.hero.ctaSecondary')}
          </button>
        </div>

        {/* スクリーンショット */}
        <div className="relative mx-auto max-w-4xl">
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0e17] to-transparent z-10 pointer-events-none rounded-b-2xl" />
          <div className="border border-[#1f2d40] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            <img
              src={heroImg}
              alt={t('landing.hero.screenshotAlt')}
              className="w-full block"
            />
          </div>
        </div>
      </section>

      {/* ── 統計バー ── */}
      <section className="border-y border-[#1f2d40] bg-[#0d1117] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            {STATS.map(item => (
              <div key={item.label}>
                <div className="text-xl sm:text-2xl font-bold text-blue-400">{item.value}</div>
                <div className="text-xs text-slate-500 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── サービス説明 ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-4">{t('landing.about.title')}</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          {t('landing.about.body')}
        </p>
        <p className="text-slate-600 text-xs mt-4">
          {t('landing.about.footer')}
        </p>
      </section>

      {/* ── 機能一覧 ── */}
      <section className="bg-[#0d1117] border-y border-[#1f2d40] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">{t('landing.features.title')}</h2>
            <p className="text-slate-500 text-sm">{t('landing.features.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="bg-[#111827] border border-[#1f2d40] rounded-xl p-5 hover:border-blue-500/30 transition-colors"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <div className="font-semibold text-slate-200 mb-1.5 text-sm">{f.title}</div>
                <div className="text-slate-500 text-xs leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ユースケース ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">{t('landing.useCases.title')}</h2>
          <p className="text-slate-500 text-sm">{t('landing.useCases.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {USE_CASES.map(u => (
            <div
              key={u.label}
              className="bg-[#111827] border border-[#1f2d40] rounded-xl px-5 py-4 flex items-start gap-4"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              <div>
                <div className="text-sm font-semibold text-slate-200 mb-1">{u.label}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{u.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 使い方 ── */}
      <section className="bg-[#0d1117] border-y border-[#1f2d40] py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-3">{t('landing.steps.title')}</h2>
            <p className="text-slate-500 text-sm">{t('landing.steps.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.step} className="flex flex-col items-center text-center relative">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-base mb-4 flex-shrink-0">
                  {s.step}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-px bg-[#1f2d40]" />
                )}
                <div className="font-semibold text-slate-300 text-sm mb-1">{s.title}</div>
                <div className="text-slate-500 text-xs leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-4">
          {t('landing.cta.title')}
        </h2>
        <p className="text-slate-500 text-sm mb-8">{t('landing.cta.subtitle')}</p>
        <button
          onClick={onStart}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-blue-500/20"
        >
          {t('landing.cta.button')}
        </button>
      </section>

      {/* ── フッター ── */}
      <footer className="border-t border-[#1f2d40] py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="text-center text-xs font-semibold text-slate-500 mb-2">{t('landing.disclaimer.heading')}</div>
          <p className="text-xs text-slate-700 leading-relaxed text-center">
            {DISCLAIMER}
          </p>
          <div className="text-center text-xs text-slate-800 pt-2">
            {t('app.productNamePro')}
          </div>
        </div>
      </footer>

    </div>
  )
}
