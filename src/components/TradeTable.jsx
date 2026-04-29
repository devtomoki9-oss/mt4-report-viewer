import { useState, useMemo, useRef } from 'react'

const COLS = [
  { key: 'ticket', label: 'チケット', align: 'left' },
  { key: 'openTime', label: 'オープン (ブローカー)', align: 'left' },
  { key: 'closeTime', label: 'クローズ (ブローカー)', align: 'left' },
  { key: 'type', label: '種別', align: 'left' },
  { key: 'symbol', label: '通貨ペア', align: 'left' },
  { key: 'size', label: 'ロット', align: 'right' },
  { key: 'openPrice', label: 'オープン価格', align: 'right' },
  { key: 'closePrice', label: 'クローズ価格', align: 'right' },
  { key: 'swap', label: 'スワップ', align: 'right' },
  { key: 'commission', label: '手数料', align: 'right' },
  { key: 'netProfit', label: '純益', align: 'right' },
  { key: 'account', label: '口座', align: 'left' },
]

const PAGE_SIZE = 50

export default function TradeTable({ trades = [], showSearch = true, aliases = {} }) {
  const [sort, setSort] = useState({ key: 'closeTime', dir: 'desc' })
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const tableTopRef = useRef(null)

  const sorted = useMemo(() => {
    const f = filter.toLowerCase()
    let filtered = f
      ? trades.filter(t =>
          (t.symbol || '').toLowerCase().includes(f) ||
          (t.type || '').toLowerCase().includes(f) ||
          (aliases[t.account] || t.account || '').toLowerCase().includes(f) ||
          (t.ticket || '').toLowerCase().includes(f)
        )
      : trades

    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [trades, sort, filter])

  const pages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
    setPage(0)
  }

  const handleFilter = (v) => { setFilter(v); setPage(0) }

  const fmtPrice = (v) => {
    if (!v) return '—'
    return typeof v === 'number' ? v.toFixed(5) : v
  }

  const goToPage = (fn) => {
    setPage(fn)
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={tableTopRef} className="space-y-3">
      {showSearch && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="通貨ペア / 口座で絞り込み…"
              value={filter}
              onChange={e => handleFilter(e.target.value)}
              className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            />
            {filter && (
              <button onClick={() => handleFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">✕</button>
            )}
          </div>
          <div className="text-xs text-slate-600">{sorted.length} 件</div>
        </div>
      )}

      {/* モバイルカードビュー */}
      <div className="sm:hidden space-y-2">
        {paged.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs">データがありません</div>
        ) : paged.map((t, i) => {
          const isProfit = t.netProfit >= 0
          const isBuy = t.type?.toLowerCase().startsWith('buy')
          return (
            <div key={t.ticket + i} className="bg-[#111827] border border-[#1f2d40] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${isBuy ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                      {t.type}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{t.symbol || '—'}</span>
                    <span className="text-xs text-slate-500 font-mono">{t.size?.toFixed(2)} lot</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{t.closeTime?.slice(0, 10) || '—'}</div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">{fmtPrice(t.openPrice)} → {fmtPrice(t.closePrice)}</div>
                </div>
                <div className={`font-mono text-sm font-bold flex-shrink-0 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isProfit ? '+' : ''}{t.netProfit.toFixed(2)}
                </div>
              </div>
              {(t.account || t.swap || t.commission) && (
                <div className="flex items-center gap-3 mt-1.5 text-xs">
                  {t.account && <span className="text-slate-600 truncate">{aliases[t.account] || t.account}</span>}
                  {!!t.swap && <span className={t.swap < 0 ? 'text-red-400/70' : 'text-emerald-400/70'}>SW {t.swap.toFixed(2)}</span>}
                  {!!t.commission && <span className="text-slate-600">手数料 {t.commission.toFixed(2)}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* デスクトップテーブルビュー */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-[#1f2d40]">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-[#0a0e17] border-b border-[#1f2d40]">
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-2.5 font-medium text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none
                    ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                  {sort.key === col.key && (
                    <span className="ml-1 text-blue-400">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="text-center py-8 text-slate-600">データがありません</td>
              </tr>
            ) : paged.map((t, i) => {
              const isProfit = t.netProfit >= 0
              const isBuy = t.type?.toLowerCase().startsWith('buy')
              return (
                <tr key={t.ticket + i} className="border-b border-[#1f2d40]/40 hover:bg-[#1a2235]/60 transition-colors">
                  <td className="px-3 py-2 text-slate-500 font-mono">{t.ticket || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{t.openTime?.slice(0, 16) || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{t.closeTime?.slice(0, 16) || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isBuy ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300 font-medium">{t.symbol || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{t.size?.toFixed(2) || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtPrice(t.openPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtPrice(t.closePrice)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${t.swap < 0 ? 'text-red-400/70' : t.swap > 0 ? 'text-emerald-400/70' : 'text-slate-600'}`}>
                    {t.swap ? (t.swap >= 0 ? '+' : '') + t.swap.toFixed(2) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${t.commission < 0 ? 'text-red-400/70' : 'text-slate-600'}`}>
                    {t.commission ? t.commission.toFixed(2) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isProfit ? '+' : ''}{t.netProfit.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]" title={t.account}>{aliases[t.account] || t.account || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => goToPage(p => p - 1)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#1a2235] text-slate-400 disabled:opacity-30 hover:bg-[#1f2d40] transition-colors"
          >
            ← 前
          </button>
          <span className="text-xs text-slate-500">{page + 1} / {pages}</span>
          <button
            disabled={page >= pages - 1}
            onClick={() => goToPage(p => p + 1)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#1a2235] text-slate-400 disabled:opacity-30 hover:bg-[#1f2d40] transition-colors"
          >
            次 →
          </button>
        </div>
      )}
    </div>
  )
}
