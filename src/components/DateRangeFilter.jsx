import { useState, useEffect } from 'react'

const PRESETS = [
  { label: '1日',   days: 1 },
  { label: '1週間', days: 7 },
  { label: '1ヶ月', days: 30 },
  { label: '3ヶ月', days: 90 },
  { label: '6ヶ月', days: 180 },
  { label: '1年',   days: 365 },
  { label: '全期間', days: null },
]

function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - days + 1)
  return d.toISOString().slice(0, 10)
}

export default function DateRangeFilter({ from, to, onChange, dataMin, dataMax, totalCount, filteredCount }) {
  // どのプリセットが選択中かを明示的に管理する
  const [activeKey, setActiveKey] = useState(null) // null=全期間, number=days, 'custom'=手動入力

  // 外部から from/to が '' にリセットされたとき（clearAll 等）を検知
  useEffect(() => {
    if (!from && !to) setActiveKey(null)
  }, [from, to])

  const applyPreset = (days) => {
    setActiveKey(days)
    if (days === null) {
      onChange({ from: '', to: '' })
      return
    }
    const end = dataMax || new Date().toISOString().slice(0, 10)
    const start = subtractDays(end, days)
    onChange({ from: start, to: end })
  }

  const handleFromChange = (e) => {
    setActiveKey('custom')
    onChange({ from: e.target.value, to })
  }

  const handleToChange = (e) => {
    setActiveKey('custom')
    onChange({ from, to: e.target.value })
  }

  const handleClear = () => {
    setActiveKey(null)
    onChange({ from: '', to: '' })
  }

  const isFiltered = from || to

  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      {/* プリセットボタン */}
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.days ?? 'all'}
            onClick={() => applyPreset(p.days)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all
              ${activeKey === p.days
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#1a2235]'
              }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-[#1f2d40]" />

      {/* カスタム日付入力 */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="date"
          value={from}
          min={dataMin}
          max={to || dataMax}
          onChange={handleFromChange}
          className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 [color-scheme:dark]"
        />
        <span className="text-slate-600">〜</span>
        <input
          type="date"
          value={to}
          min={from || dataMin}
          max={dataMax}
          onChange={handleToChange}
          className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 [color-scheme:dark]"
        />
        {isFiltered && (
          <button
            onClick={handleClear}
            className="text-slate-600 hover:text-slate-400 transition-colors ml-1"
            title="絞り込みをクリア"
          >
            ✕
          </button>
        )}
      </div>

      {/* 件数バッジ */}
      {totalCount > 0 && (
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {isFiltered && filteredCount !== totalCount ? (
            <>
              <span className="font-mono text-blue-400 font-semibold">{filteredCount.toLocaleString()}</span>
              <span className="text-slate-600">/ {totalCount.toLocaleString()} 件</span>
              <span className="bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-medium">絞り込み中</span>
            </>
          ) : (
            <span className="text-slate-500 font-mono">{totalCount.toLocaleString()} 件</span>
          )}
        </div>
      )}
    </div>
  )
}
