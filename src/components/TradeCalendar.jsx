import { useState, useMemo } from 'react'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function fmt2(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const s = abs >= 1000
    ? abs.toLocaleString('en', { maximumFractionDigits: 2 })
    : abs.toFixed(2)
  return (n >= 0 ? '+' : '-') + s
}

function toLocalDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TradeCalendar({ trades = [], aliases = {} }) {
  const today = new Date()
  const todayKey = toLocalDateKey(today)
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [tradePage, setTradePage] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState(null) // null = 全口座

  const PAGE_SIZE = 20

  // 口座名一覧
  const accountNames = useMemo(() => {
    const names = new Set()
    for (const t of trades) if (t.account) names.add(t.account)
    return [...names].sort()
  }, [trades])

  // 口座フィルタ済みトレード
  const activeTrades = useMemo(() => {
    if (!selectedAccount) return trades
    return trades.filter(t => t.account === selectedAccount)
  }, [trades, selectedAccount])

  const selectAccount = (name) => {
    setSelectedAccount(prev => prev === name ? null : name)
    setSelectedDay(null)
    setTradePage(0)
  }

  // 日別集計
  const dailyMap = useMemo(() => {
    const map = new Map()
    for (const t of activeTrades) {
      const day = t.closeTime?.slice(0, 10)
      if (!day) continue
      if (!map.has(day)) map.set(day, { trades: [], profit: 0 })
      const d = map.get(day)
      d.trades.push(t)
      d.profit = Math.round((d.profit + (t.netProfit ?? t.profit ?? 0)) * 100) / 100
    }
    return map
  }, [activeTrades])

  // 月集計
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    let profit = 0, tradeCount = 0, tradingDays = 0, wins = 0, losses = 0
    for (const [day, d] of dailyMap) {
      if (!day.startsWith(prefix)) continue
      profit = Math.round((profit + d.profit) * 100) / 100
      tradeCount += d.trades.length
      tradingDays++
      if (d.profit > 0) wins++
      else if (d.profit < 0) losses++
    }
    return { profit, tradeCount, tradingDays, wins, losses }
  }, [dailyMap, year, month])

  // カレンダーグリッド生成
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [year, month])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
    setTradePage(0)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
    setTradePage(0)
  }

  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const selectedData = selectedKey ? dailyMap.get(selectedKey) : null

  return (
    <div className="space-y-4">
      {/* 口座フィルタ */}
      {accountNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">口座：</span>
          <button
            onClick={() => { setSelectedAccount(null); setSelectedDay(null) }}
            className={`px-3 py-1 text-xs rounded-full border transition-colors
              ${!selectedAccount
                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                : 'border-[#1f2d40] text-slate-500 hover:text-slate-300'}`}>
            全口座
          </button>
          {accountNames.map(name => {
            const active = selectedAccount === name
            const display = aliases[name] || name
            return (
              <button
                key={name}
                onClick={() => selectAccount(name)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors
                  ${active
                    ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                    : 'border-[#1f2d40] text-slate-500 hover:text-slate-300'}`}>
                {display}
              </button>
            )
          })}
        </div>
      )}

      {/* ヘッダ：月ナビ＋月集計 */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#1a2235] transition-colors text-lg">
            ‹
          </button>
          <div className="text-base font-semibold text-slate-100">
            {year}年 {month + 1}月
          </div>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#1a2235] transition-colors text-lg">
            ›
          </button>
        </div>

        {/* 月集計バー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs border-t border-[#1f2d40] pt-3">
          <div>
            <div className="text-slate-500 mb-0.5">月間損益</div>
            <div className={`font-semibold text-sm ${monthStats.profit > 0 ? 'text-emerald-400' : monthStats.profit < 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {monthStats.profit === 0 ? '—' : fmt2(monthStats.profit)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">取引数</div>
            <div className="font-semibold text-sm text-slate-300">{monthStats.tradeCount}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">稼働日</div>
            <div className="font-semibold text-sm text-slate-300">{monthStats.tradingDays}日</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">勝日/負日</div>
            <div className="font-semibold text-sm">
              <span className="text-emerald-400">{monthStats.wins}</span>
              <span className="text-slate-600"> / </span>
              <span className="text-red-400">{monthStats.losses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[#1f2d40]">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-2 text-center text-xs font-medium
              ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} className="border-b border-r border-[#1a2235] h-16 sm:h-20" />
            }
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const data = dailyMap.get(key)
            const isToday = key === todayKey
            const isSelected = day === selectedDay
            const dow = idx % 7
            const isSun = dow === 0
            const isSat = dow === 6

            return (
              <button
                key={key}
                onClick={() => { setSelectedDay(isSelected ? null : day); setTradePage(0) }}
                className={`border-b border-r border-[#1a2235] h-16 sm:h-20 p-1.5 text-left flex flex-col transition-colors
                  ${isSelected ? 'bg-blue-600/20 border-blue-500/30' : 'hover:bg-[#1a2235]'}
                  ${(idx + 1) % 7 === 0 ? 'border-r-0' : ''}`}>
                <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full
                  ${isToday ? 'bg-blue-500 text-white' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                  {day}
                </span>

                {data && (
                  <div className="mt-auto w-full">
                    <div className={`text-[10px] sm:text-xs font-semibold leading-tight truncate
                      ${data.profit > 0 ? 'text-emerald-400' : data.profit < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {fmt2(data.profit)}
                    </div>
                    <div className="text-[9px] text-slate-600 leading-tight">
                      {data.trades.length}件
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 選択日の取引詳細 */}
      {selectedData && (() => {
        const sorted = selectedData.trades.slice().sort((a, b) => (a.closeTime > b.closeTime ? 1 : -1))
        const pages  = Math.ceil(sorted.length / PAGE_SIZE)
        const paged  = sorted.slice(tradePage * PAGE_SIZE, (tradePage + 1) * PAGE_SIZE)
        return (
          <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1f2d40] flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-300">
                {year}年{month + 1}月{selectedDay}日
                <span className="ml-2 text-xs font-normal text-slate-500">{sorted.length}件</span>
              </div>
              <div className={`text-sm font-bold ${selectedData.profit > 0 ? 'text-emerald-400' : selectedData.profit < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {fmt2(selectedData.profit)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-[#1f2d40]">
                    <th className="px-3 py-2 text-left font-medium">時刻 (ブローカー)</th>
                    <th className="px-3 py-2 text-left font-medium">通貨</th>
                    <th className="px-3 py-2 text-left font-medium">タイプ</th>
                    <th className="px-3 py-2 text-right font-medium">ロット</th>
                    <th className="px-3 py-2 text-right font-medium">損益</th>
                    <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">口座</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((t, i) => {
                    const p = t.netProfit ?? t.profit ?? 0
                    return (
                      <tr key={t.ticket ?? i} className="border-b border-[#1a2235] hover:bg-[#1a2235] transition-colors">
                        <td className="px-3 py-2 text-slate-400 tabular-nums whitespace-nowrap">
                          {t.closeTime?.slice(11, 16)}
                        </td>
                        <td className="px-3 py-2 text-slate-300 font-medium">{t.symbol}</td>
                        <td className={`px-3 py-2 font-medium ${t.type?.toLowerCase().includes('buy') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.type}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{t.size}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${p > 0 ? 'text-emerald-400' : p < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {fmt2(p)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 hidden sm:table-cell truncate max-w-[120px]">
                          {aliases[t.account] || t.account}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-[#1f2d40]">
                <button
                  disabled={tradePage === 0}
                  onClick={() => setTradePage(p => p - 1)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[#1a2235] text-slate-400 disabled:opacity-30 hover:bg-[#1f2d40] transition-colors">
                  ← 前
                </button>
                <span className="text-xs text-slate-500 tabular-nums">
                  {tradePage + 1} / {pages}
                </span>
                <button
                  disabled={tradePage >= pages - 1}
                  onClick={() => setTradePage(p => p + 1)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[#1a2235] text-slate-400 disabled:opacity-30 hover:bg-[#1f2d40] transition-colors">
                  次 →
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
