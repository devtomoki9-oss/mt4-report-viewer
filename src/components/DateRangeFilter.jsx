import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const PRESET_KEYS = [
  { key: '1d', days: 1 },
  { key: '1w', days: 7 },
  { key: '1m', days: 30 },
  { key: '3m', days: 90 },
  { key: '6m', days: 180 },
  { key: '1y', days: 365 },
  { key: 'all', days: null },
]

function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - days + 1)
  return d.toISOString().slice(0, 10)
}

export default function DateRangeFilter({ from, to, onChange, dataMin, dataMax, totalCount, filteredCount }) {
  const { t } = useTranslation()
  const [activeKey, setActiveKey] = useState(null)

  useEffect(() => {
    if (!from && !to) setActiveKey(null)
  }, [from, to])

  const applyPreset = (days) => {
    setActiveKey(days)
    if (days === null) { onChange({ from: '', to: '' }); return }
    const end = dataMax || new Date().toISOString().slice(0, 10)
    onChange({ from: subtractDays(end, days), to: end })
  }

  const handleFromChange = (e) => { setActiveKey('custom'); onChange({ from: e.target.value, to }) }
  const handleToChange   = (e) => { setActiveKey('custom'); onChange({ from, to: e.target.value }) }
  const handleClear      = () => { setActiveKey(null); onChange({ from: '', to: '' }) }

  const isFiltered = from || to

  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
      {/* プリセットボタン */}
      <div className="flex items-center gap-1 flex-wrap">
        {PRESET_KEYS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.days)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all
              ${activeKey === p.days
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#1a2235]'
              }`}
          >
            {t(`dateRange.presets.${p.key}`)}
          </button>
        ))}
      </div>

      {/* 日付入力 + 件数バッジ（モバイルは横並び 1行、デスクトップはインライン） */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="hidden sm:block w-px h-4 bg-[#1f2d40]" />
        <input
          type="date" value={from} min={dataMin} max={to || dataMax}
          onChange={handleFromChange}
          className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 [color-scheme:dark]"
        />
        <span className="text-slate-600 text-xs">〜</span>
        <input
          type="date" value={to} min={from || dataMin} max={dataMax}
          onChange={handleToChange}
          className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 [color-scheme:dark]"
        />
        {isFiltered && (
          <button onClick={handleClear} className="text-slate-600 hover:text-slate-400 transition-colors" title={t('dateRange.clearTitle')}>
            ✕
          </button>
        )}
        {totalCount > 0 && (
          <div className="ml-auto sm:ml-0 flex items-center gap-1.5 text-xs">
            {isFiltered && filteredCount !== totalCount ? (
              <>
                <span className="font-mono text-blue-400 font-semibold">{filteredCount.toLocaleString()}</span>
                <span className="text-slate-600">/ {t('units.items', { count: totalCount })}</span>
                <span className="hidden sm:inline bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-medium">{t('dateRange.filteredBadge')}</span>
              </>
            ) : (
              <span className="text-slate-500 font-mono">{t('units.items', { count: totalCount })}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
