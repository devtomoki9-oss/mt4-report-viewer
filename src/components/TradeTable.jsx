import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatSignedMoney } from '../i18n/format'

const COL_KEYS = [
  { key: 'ticket',     align: 'left' },
  { key: 'openTime',   align: 'left' },
  { key: 'closeTime',  align: 'left' },
  { key: 'type',       align: 'left' },
  { key: 'symbol',     align: 'left' },
  { key: 'size',       align: 'right' },
  { key: 'openPrice',  align: 'right' },
  { key: 'closePrice', align: 'right' },
  { key: 'swap',       align: 'right' },
  { key: 'commission', align: 'right' },
  { key: 'netProfit',  align: 'right' },
  { key: 'account',    align: 'left' },
]

const PAGE_SIZE = 50

const ALL = '__all__'

export default function TradeTable({ trades = [], showSearch = true, aliases = {} }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const COLS = COL_KEYS.map(c => ({ ...c, label: t(`trades.table.columns.${c.key}`) }))
  const [sort, setSort] = useState({ key: 'closeTime', dir: 'desc' })
  const [symbolFilter, setSymbolFilter] = useState(ALL)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [accountFilter, setAccountFilter] = useState(ALL)
  const [page, setPage] = useState(0)
  const tableTopRef = useRef(null)

  const { symbolOptions, typeOptions, accountOptions } = useMemo(() => {
    const symbols = new Set()
    const types = new Set()
    const accounts = new Set()
    for (const t of trades) {
      if (t.symbol) symbols.add(t.symbol)
      if (t.type) types.add(t.type)
      if (t.account) accounts.add(t.account)
    }
    return {
      symbolOptions: [...symbols].sort(),
      typeOptions: [...types].sort(),
      accountOptions: [...accounts].sort((a, b) =>
        (aliases[a] || a).localeCompare(aliases[b] || b)
      ),
    }
  }, [trades, aliases])

  const sorted = useMemo(() => {
    const filtered = trades.filter(t => {
      if (symbolFilter !== ALL && t.symbol !== symbolFilter) return false
      if (typeFilter !== ALL && t.type !== typeFilter) return false
      if (accountFilter !== ALL && t.account !== accountFilter) return false
      return true
    })

    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [trades, sort, symbolFilter, typeFilter, accountFilter])

  const pages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
    setPage(0)
  }

  const updateFilter = (setter) => (v) => { setter(v); setPage(0) }
  const hasActiveFilter = symbolFilter !== ALL || typeFilter !== ALL || accountFilter !== ALL
  const resetFilters = () => {
    setSymbolFilter(ALL)
    setTypeFilter(ALL)
    setAccountFilter(ALL)
    setPage(0)
  }

  const fmtPrice = (v) => {
    if (!v) return '—'
    return typeof v === 'number' ? v.toFixed(5) : v
  }

  const goToPage = (fn) => {
    setPage(fn)
    if (tableTopRef.current) {
      const y = tableTopRef.current.getBoundingClientRect().top + window.scrollY - 72
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <div ref={tableTopRef} className="space-y-3">
      {showSearch && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={symbolFilter}
            onChange={e => updateFilter(setSymbolFilter)(e.target.value)}
            className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
          >
            <option value={ALL}>{t('trades.table.filters.symbolAll')}</option>
            {symbolOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => updateFilter(setTypeFilter)(e.target.value)}
            className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
          >
            <option value={ALL}>{t('trades.table.filters.typeAll')}</option>
            {typeOptions.map(typeOpt => <option key={typeOpt} value={typeOpt}>{typeOpt}</option>)}
          </select>
          <select
            value={accountFilter}
            onChange={e => updateFilter(setAccountFilter)(e.target.value)}
            className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 max-w-[200px]"
          >
            <option value={ALL}>{t('trades.table.filters.accountAll')}</option>
            {accountOptions.map(a => <option key={a} value={a}>{aliases[a] || a}</option>)}
          </select>
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="px-2.5 py-2 text-xs rounded-lg bg-[#1a2235] text-slate-400 hover:bg-[#1f2d40] hover:text-slate-200 transition-colors"
            >
              {t('trades.table.filters.reset')}
            </button>
          )}
          <div className="text-xs text-slate-600 ml-auto">{t('units.items', { count: sorted.length })}</div>
        </div>
      )}

      {/* モバイルカードビュー */}
      <div className="sm:hidden space-y-2">
        {paged.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs">{t('common.empty')}</div>
        ) : paged.map((tr, i) => {
          const isProfit = tr.netProfit >= 0
          const isBuy = tr.type?.toLowerCase().startsWith('buy')
          return (
            <div key={tr.ticket + i} className="bg-[#111827] border border-[#1f2d40] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${isBuy ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                      {tr.type}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{tr.symbol || '—'}</span>
                    <span className="text-xs text-slate-500 font-mono">{t('trades.table.lotsMobile', { lots: formatNumber(tr.size, { lang }) })}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{tr.closeTime?.slice(0, 10) || '—'}</div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">{fmtPrice(tr.openPrice)} → {fmtPrice(tr.closePrice)}</div>
                </div>
                <div className={`font-mono text-sm font-bold flex-shrink-0 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatSignedMoney(tr.netProfit, { lang })}
                </div>
              </div>
              {(tr.account || tr.swap || tr.commission) && (
                <div className="flex items-center gap-3 mt-1.5 text-xs">
                  {tr.account && <span className="text-slate-600 truncate">{aliases[tr.account] || tr.account}</span>}
                  {!!tr.swap && <span className={tr.swap < 0 ? 'text-red-400/70' : 'text-emerald-400/70'}>{t('trades.table.swapMobile', { value: formatNumber(tr.swap, { lang }) })}</span>}
                  {!!tr.commission && <span className="text-slate-600">{t('trades.table.commissionMobile', { value: formatNumber(tr.commission, { lang }) })}</span>}
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
                <td colSpan={COLS.length} className="text-center py-8 text-slate-600">{t('common.empty')}</td>
              </tr>
            ) : paged.map((tr, i) => {
              const isProfit = tr.netProfit >= 0
              const isBuy = tr.type?.toLowerCase().startsWith('buy')
              return (
                <tr key={tr.ticket + i} className="border-b border-[#1f2d40]/40 hover:bg-[#1a2235]/60 transition-colors">
                  <td className="px-3 py-2 text-slate-500 font-mono">{tr.ticket || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{tr.openTime?.slice(0, 16) || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{tr.closeTime?.slice(0, 16) || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isBuy ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                      {tr.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300 font-medium">{tr.symbol || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{tr.size != null ? formatNumber(tr.size, { lang }) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtPrice(tr.openPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtPrice(tr.closePrice)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${tr.swap < 0 ? 'text-red-400/70' : tr.swap > 0 ? 'text-emerald-400/70' : 'text-slate-600'}`}>
                    {tr.swap ? formatSignedMoney(tr.swap, { lang }) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${tr.commission < 0 ? 'text-red-400/70' : 'text-slate-600'}`}>
                    {tr.commission ? formatNumber(tr.commission, { lang }) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatSignedMoney(tr.netProfit, { lang })}
                  </td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]" title={tr.account}>{aliases[tr.account] || tr.account || '—'}</td>
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
            {t('common.prev')}
          </button>
          <span className="text-xs text-slate-500">{page + 1} / {pages}</span>
          <button
            disabled={page >= pages - 1}
            onClick={() => goToPage(p => p + 1)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#1a2235] text-slate-400 disabled:opacity-30 hover:bg-[#1f2d40] transition-colors"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  )
}
