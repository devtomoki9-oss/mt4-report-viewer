const SESSIONS = [
  { name: 'アジア',       start: 0,  end: 9  },
  { name: 'ロンドン',     start: 9,  end: 17 },
  { name: 'ニューヨーク', start: 14, end: 23 },
]

function profit(t) { return t.netProfit ?? t.profit ?? 0 }

function parseHour(str) {
  if (!str) return null
  return new Date(str.replace(' ', 'T')).getHours()
}

function holdingMinutes(t) {
  if (!t.openTime || !t.closeTime) return 0
  return Math.max(0,
    (new Date(t.closeTime.replace(' ', 'T')) - new Date(t.openTime.replace(' ', 'T'))) / 60000
  )
}

// セッション別集計
export function analyzeBySession(trades) {
  const map = Object.fromEntries(SESSIONS.map(s => [s.name, { wins: 0, total: 0 }]))
  for (const t of trades) {
    const h = parseHour(t.closeTime)
    if (h === null) continue
    for (const s of SESSIONS) {
      if (h >= s.start && h < s.end) {
        map[s.name].total++
        if (profit(t) > 0) map[s.name].wins++
        break
      }
    }
  }
  return SESSIONS.map(s => ({
    name: s.name,
    winRate: map[s.name].total > 0 ? map[s.name].wins / map[s.name].total : 0,
    total: map[s.name].total,
  }))
}

// 通貨ペア別集計
export function analyzeBySymbol(trades) {
  const map = {}
  for (const t of trades) {
    const s = t.symbol || 'Unknown'
    if (!map[s]) map[s] = { wins: 0, total: 0, profit: 0 }
    const p = profit(t)
    map[s].total++
    map[s].profit = Math.round((map[s].profit + p) * 100) / 100
    if (p > 0) map[s].wins++
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name, winRate: v.total > 0 ? v.wins / v.total : 0, total: v.total, profit: v.profit }))
    .sort((a, b) => b.total - a.total)
}

// 現在の連続負け数
function currentLossStreak(trades) {
  const sorted = [...trades].sort((a, b) => (a.closeTime ?? '') > (b.closeTime ?? '') ? 1 : -1)
  let n = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (profit(sorted[i]) < 0) n++
    else break
  }
  return n
}

// 最大連続負け数
function maxLossStreak(trades) {
  const sorted = [...trades].sort((a, b) => (a.closeTime ?? '') > (b.closeTime ?? '') ? 1 : -1)
  let max = 0, cur = 0
  for (const t of sorted) {
    if (profit(t) < 0) { cur++; if (cur > max) max = cur }
    else cur = 0
  }
  return max
}

// AI診断インサイト生成
export function generateInsights(trades, stats) {
  if (!trades || trades.length < 5) return []
  const insights = []
  const sessions = analyzeBySession(trades)
  const symbols  = analyzeBySymbol(trades)
  const { avgWin = 0, avgLoss = 0, profitFactor, winRate = 0, maxDrawdown = 0 } = stats ?? {}

  for (const s of sessions) {
    if (s.total >= 5 && s.winRate < 0.4)
      insights.push({ type: 'warning', message: `${s.name}セッションの勝率が${(s.winRate * 100).toFixed(0)}%と低いです（${s.total}件）` })
  }

  if (avgWin > 0 && avgLoss > avgWin * 1.5)
    insights.push({ type: 'warning', message: `平均損失 ${avgLoss.toFixed(1)} が平均利益 ${avgWin.toFixed(1)} を大きく上回っています` })

  const maxStreak = maxLossStreak(trades)
  if (maxStreak >= 5)
    insights.push({ type: 'warning', message: `最大${maxStreak}連敗を記録しています。ポジションサイズを見直してください` })

  const worst = symbols.find(s => s.total >= 5 && s.winRate < 0.35 && s.profit < 0)
  if (worst)
    insights.push({ type: 'warning', message: `${worst.name}のパフォーマンスが低調です（勝率${(worst.winRate * 100).toFixed(0)}%、損益${worst.profit.toFixed(0)}）` })

  if (maxDrawdown > 1000)
    insights.push({ type: 'warning', message: `最大ドローダウンが${maxDrawdown.toFixed(0)}に達しています` })

  if (winRate >= 60)
    insights.push({ type: 'success', message: `勝率 ${winRate.toFixed(1)}% は優秀です` })

  if (isFinite(profitFactor) && profitFactor >= 1.5)
    insights.push({ type: 'success', message: `プロフィットファクター ${profitFactor.toFixed(2)} は良好です` })

  return insights.slice(0, 5)
}

// アラート生成
export function generateAlerts(trades, stats) {
  if (!trades?.length) return []
  const alerts = []
  const streak = currentLossStreak(trades)
  const { maxDrawdown = 0, profitFactor, totalTrades = 0 } = stats ?? {}

  if (streak >= 3)
    alerts.push({ level: 'danger', message: `現在 ${streak} 連敗中です。トレードを一時停止することを検討してください` })

  if (maxDrawdown > 1000)
    alerts.push({ level: 'danger', message: `ドローダウンが ${maxDrawdown.toFixed(0)} に達しています` })

  if (isFinite(profitFactor) && profitFactor < 1.2 && totalTrades >= 10)
    alerts.push({ level: 'warn', message: `プロフィットファクターが ${profitFactor.toFixed(2)} に低下しています` })

  return alerts
}

// 勝ちパターン分析
export function analyzeWinPatterns(trades) {
  const hourMap = {}
  for (const t of trades) {
    const h = parseHour(t.closeTime)
    if (h === null) continue
    if (!hourMap[h]) hourMap[h] = { wins: 0, total: 0 }
    hourMap[h].total++
    if (profit(t) > 0) hourMap[h].wins++
  }

  const topHours = Object.entries(hourMap)
    .filter(([, v]) => v.total >= 3)
    .map(([h, v]) => ({ label: `${String(h).padStart(2, '0')}:00`, winRate: v.wins / v.total, total: v.total }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 3)

  const topSymbols = analyzeBySymbol(trades)
    .filter(s => s.total >= 3)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 3)

  const wins = trades.filter(t => profit(t) > 0)
  const avgWinHold = wins.length
    ? wins.reduce((s, t) => s + holdingMinutes(t), 0) / wins.length
    : 0

  return { topHours, topSymbols, avgWinHold }
}
