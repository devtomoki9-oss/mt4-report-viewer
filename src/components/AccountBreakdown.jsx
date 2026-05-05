import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildEquityCurve } from '../lib/mt4Parser'
import EquityChart from './EquityChart'
import TradeTable from './TradeTable'
import { formatNumber, formatPercent, formatSignedMoney } from '../i18n/format'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function PFBar({ pf, lang }) {
  const capped = Math.min(isFinite(pf) ? pf : 5, 5)
  const color = pf >= 2 ? '#10b981' : pf >= 1 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-[#0a0e17] rounded-full h-1.5 overflow-hidden">
        <div style={{ width: `${(capped / 5) * 100}%`, background: color }} className="h-full rounded-full" />
      </div>
      <span className="font-mono text-xs w-10 text-right" style={{ color }}>
        {isFinite(pf) ? formatNumber(pf, { lang }) : '∞'}
      </span>
    </div>
  )
}

function WinRatePie({ winRate, lang }) {
  const color = winRate >= 55 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0"
        style={{ background: `conic-gradient(${color} ${winRate * 3.6}deg, #1f2d40 0deg)` }}
      />
      <span className="font-mono text-xs" style={{ color }}>{formatPercent(winRate, { lang })}</span>
    </div>
  )
}

function SortTh({ label, col, sortKey, sortDir, onSort, className = '' }) {
  const active = sortKey === col
  return (
    <th
      className={`py-2.5 font-medium cursor-pointer select-none hover:text-slate-300 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[10px] leading-none">
          {active ? (sortDir === 'desc' ? '▼' : '▲') : <span className="opacity-20">▼</span>}
        </span>
      </span>
    </th>
  )
}

export default function AccountBreakdown({ accounts, filteredTrades, aliases = {}, sortKey, sortDir, onSort }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('equity')

  const selectedAcc = selected != null ? accounts.find(a => a.account.name === selected) ?? null : null
  const selectedTrades = useMemo(
    () => selectedAcc ? filteredTrades.filter(t => t.account === selectedAcc.account.name) : [],
    [selectedAcc, filteredTrades]
  )
  const equityCurve = useMemo(() => buildEquityCurve(selectedTrades), [selectedTrades])

  const displayName = (name) => aliases[name] || name
  const shortName = (name) => {
    const n = displayName(name)
    return n.length > 12 ? n.slice(0, 12) + '…' : n
  }

  const barData = accounts.map(a => ({
    name: shortName(a.account.name),
    profit: Math.round((a.stats.totalProfit ?? 0) * 100) / 100,
  }))

  const thBase  = 'px-3 py-2.5'
  const thRight = `${thBase} text-right`
  const thLeft  = `${thBase} text-left`

  return (
    <div className="space-y-4">
      {accounts.length > 1 && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">{t('account.breakdown.barChartTitle')}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2d40', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={v => [v >= 0 ? '+' + v : v, t('account.breakdown.profitTooltip')]}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2d40]">
          <div className="text-sm font-semibold text-slate-300">{t('account.breakdown.title')}</div>
        </div>

        {/* モバイルカードビュー */}
        <div className="sm:hidden divide-y divide-[#1f2d40]">
          {accounts.map((a) => {
            const s = a.stats
            const isProfit = (s.totalProfit ?? 0) >= 0
            const isSelected = selected === a.account.name
            return (
              <div
                key={a.account.name}
                onClick={() => setSelected(isSelected ? null : a.account.name)}
                className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#1a2235]' : 'active:bg-[#1a2235]/60'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-sm font-medium text-slate-200 truncate">{displayName(a.account.name)}</span>
                    {isSelected && <span className="text-blue-400 text-xs flex-shrink-0">▶</span>}
                  </div>
                  <span className={`font-mono text-sm font-bold flex-shrink-0 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatSignedMoney(s.totalProfit ?? 0, { lang })}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-500">
                    <span className="text-emerald-500">{s.wins ?? 0}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-red-500">{s.losses ?? 0}</span>
                  </span>
                  <div className="flex-1"><PFBar pf={s.profitFactor ?? 0} lang={lang} /></div>
                  <WinRatePie winRate={s.winRate ?? 0} lang={lang} />
                  <span className="text-xs font-mono text-amber-400">DD {formatNumber(s.maxDrawdown ?? 0, { lang })}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* デスクトップテーブルビュー */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1f2d40] text-slate-500">
                <SortTh label={t('account.breakdown.headers.name')}        col="name"        sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-left px-4 py-2.5" />
                <SortTh label={t('account.breakdown.headers.trades')}      col="trades"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label={t('account.breakdown.headers.profit')}      col="profit"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label={t('account.breakdown.headers.pf')}          col="pf"          sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={`${thLeft} w-40`} />
                <SortTh label={t('account.breakdown.headers.winRate')}     col="winRate"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thLeft} />
                <SortTh label={t('account.breakdown.headers.maxDrawdown')} col="maxDrawdown" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label={t('account.breakdown.headers.avgWin')}      col="avgWin"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
                <SortTh label={t('account.breakdown.headers.avgLoss')}     col="avgLoss"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={thRight} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const s = a.stats
                const isProfit = (s.totalProfit ?? 0) >= 0
                const isSelected = selected === a.account.name
                return (
                  <tr
                    key={a.account.name}
                    onClick={() => setSelected(isSelected ? null : a.account.name)}
                    className={`border-b border-[#1f2d40]/50 cursor-pointer transition-colors
                      ${isSelected ? 'bg-[#1a2235]' : 'hover:bg-[#1a2235]/60'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-slate-200 font-medium truncate max-w-[200px]" title={a.account.name}>
                          {displayName(a.account.name)}
                        </span>
                        {isSelected && <span className="text-blue-400 text-xs">▶</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                      <span className="text-emerald-500">{s.wins ?? 0}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-red-500">{s.losses ?? 0}</span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatSignedMoney(s.totalProfit ?? 0, { lang })}
                    </td>
                    <td className="px-3 py-2.5 w-44"><PFBar pf={s.profitFactor ?? 0} lang={lang} /></td>
                    <td className="px-3 py-2.5"><WinRatePie winRate={s.winRate ?? 0} lang={lang} /></td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-400">{formatNumber(s.maxDrawdown ?? 0, { lang })}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400">+{formatNumber(s.avgWin ?? 0, { lang })}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-400">-{formatNumber(s.avgLoss ?? 0, { lang })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAcc && (
        <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1f2d40]">
            <div className="text-sm font-semibold text-slate-200 flex-1">
              {displayName(selectedAcc.account.name)}
              <span className="ml-2 text-xs text-slate-500 font-normal">{t('account.card.tradesCount', { count: selectedTrades.length })}</span>
            </div>
            <div className="flex gap-1">
              {['equity', 'trades'].map(tabKey => (
                <button key={tabKey} onClick={() => setTab(tabKey)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${tab === tabKey ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t(`account.breakdown.tabs.${tabKey}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className={tab === 'equity' ? '' : 'hidden'}>
              <EquityChart data={equityCurve} title={`${displayName(selectedAcc.account.name)}${t('account.breakdown.chartTitleSuffix')}`} />
            </div>
            <div className={tab !== 'equity' ? '' : 'hidden'}>
              <TradeTable trades={selectedTrades} aliases={aliases} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
