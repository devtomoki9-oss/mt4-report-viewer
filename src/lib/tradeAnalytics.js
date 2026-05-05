const SESSIONS = [
  { id: 'asia',    start: 0,  end: 9  },
  { id: 'london',  start: 9,  end: 17 },
  { id: 'newyork', start: 14, end: 23 },
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

function currentLossStreak(trades) {
  const sorted = [...trades].sort((a, b) => (a.closeTime ?? '') > (b.closeTime ?? '') ? 1 : -1)
  let n = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (profit(sorted[i]) < 0) n++
    else break
  }
  return n
}

function maxLossStreak(trades) {
  const sorted = [...trades].sort((a, b) => (a.closeTime ?? '') > (b.closeTime ?? '') ? 1 : -1)
  let max = 0, cur = 0
  for (const t of sorted) {
    if (profit(t) < 0) { cur++; if (cur > max) max = cur }
    else cur = 0
  }
  return max
}

// winRate は 0-100（パーセント）、avgLoss は正の値
function calcExpectancy(winRate, avgWin, avgLoss) {
  const wr = (winRate ?? 0) / 100
  return (wr * (avgWin ?? 0)) - ((1 - wr) * (avgLoss ?? 0))
}

export function calcSharpe(trades) {
  if (trades.length < 2) return 0
  const returns  = trades.map(t => profit(t))
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const std      = Math.sqrt(variance)
  return std === 0 ? 0 : parseFloat((mean / std).toFixed(2))
}

// ────────────────────────────────────────────────
// スコアリング層
// ────────────────────────────────────────────────

// トレード品質スコア（0〜100）
// raw = wr*30 + pf*25 + exp*20 - dd*25、自然な範囲は -25〜75 → +25 でシフトして 0〜100
export function calcTradeScore(stats, trades) {
  const { winRate = 0, profitFactor = 0, avgWin = 0, avgLoss = 0,
    maxDrawdown = 0, totalProfit = 0, totalTrades = 0 } = stats ?? {}
  if (!totalTrades || totalTrades < 5) return null

  const wr01   = winRate / 100
  const pf01   = Math.min((isFinite(profitFactor) ? profitFactor : 3) / 3, 1)
  const exp    = calcExpectancy(winRate, avgWin, avgLoss)
  const exp01  = exp > 0 ? Math.min(exp / 50, 1) : 0
  const ddBase = totalProfit > 0 ? maxDrawdown / totalProfit : (maxDrawdown > 0 ? 1 : 0)
  const dd01   = Math.min(ddBase, 1)

  const raw = wr01 * 30 + pf01 * 25 + exp01 * 20 - dd01 * 25
  return Math.round(Math.max(0, Math.min(100, raw + 25)))
}

// リスクスコア（0〜100、高いほどリスク大）
export function calcRiskScore(stats, trades) {
  const { maxDrawdown = 0, totalProfit = 0, totalTrades = 0 } = stats ?? {}
  if (!trades?.length || totalTrades < 5) return null

  const streak      = currentLossStreak(trades)
  const ddBase      = totalProfit > 0 ? maxDrawdown / totalProfit : (maxDrawdown > 0 ? 1 : 0)
  const ddScore     = Math.min(ddBase, 1) * 40
  const streakScore = Math.min(streak / 10, 1) * 30

  const profits  = trades.map(t => profit(t))
  const mean     = profits.reduce((a, b) => a + b, 0) / profits.length
  const variance = profits.reduce((a, b) => a + (b - mean) ** 2, 0) / profits.length
  const std      = Math.sqrt(variance)
  const cv       = mean !== 0 ? std / Math.abs(mean) : (std > 0 ? 10 : 0)
  const volScore = Math.min(cv / 10, 1) * 30

  return Math.round(Math.max(0, Math.min(100, ddScore + streakScore + volScore)))
}

// ────────────────────────────────────────────────
// 分析層
// ────────────────────────────────────────────────

export function analyzeBySession(trades) {
  const map = Object.fromEntries(SESSIONS.map(s => [s.id, { wins: 0, total: 0 }]))
  for (const t of trades) {
    const h = parseHour(t.closeTime)
    if (h === null) continue
    for (const s of SESSIONS) {
      if (h >= s.start && h < s.end) {
        map[s.id].total++
        if (profit(t) > 0) map[s.id].wins++
        break
      }
    }
  }
  return SESSIONS.map(s => ({
    id:      s.id,
    winRate: map[s.id].total > 0 ? map[s.id].wins / map[s.id].total : 0,
    total:   map[s.id].total,
  }))
}

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
    .map(([name, v]) => ({
      name, total: v.total, profit: v.profit,
      winRate: v.total > 0 ? v.wins / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

function analyzeHoldingTime(trades) {
  const wins   = trades.filter(t => profit(t) > 0)
  const losses = trades.filter(t => profit(t) < 0)
  if (wins.length < 5 || losses.length < 5) return null
  const avgWinHold  = wins.reduce((s, t)   => s + holdingMinutes(t), 0) / wins.length
  const avgLossHold = losses.reduce((s, t) => s + holdingMinutes(t), 0) / losses.length
  if (avgLossHold > avgWinHold * 1.5)
    return { type: 'warning', priority: 'high', i18nKey: 'insight.rules.holdingMismatch' }
  return null
}

// ────────────────────────────────────────────────
// AI診断インサイト生成
// ────────────────────────────────────────────────

export function generateInsights(trades, stats) {
  if (!trades || trades.length < 5) return []
  const insights = []

  const { winRate = 0, profitFactor, avgWin = 0, avgLoss = 0,
    maxDrawdown = 0, totalProfit = 0 } = stats ?? {}
  const expectancy = calcExpectancy(winRate, avgWin, avgLoss)
  const sessions   = analyzeBySession(trades)
  const symbols    = analyzeBySymbol(trades)
  const streak     = maxLossStreak(trades)
  const allWR      = winRate / 100

  if (expectancy < 0)
    insights.push({ type: 'warning', priority: 'high',
      i18nKey: 'insight.rules.negativeExpectancy' })

  if (winRate < 40)
    insights.push({ type: 'warning', priority: 'high',
      i18nKey: 'insight.rules.lowWinRate' })

  if (avgWin > 0 && avgLoss > avgWin * 1.5)
    insights.push({ type: 'warning', priority: 'high',
      i18nKey: 'insight.rules.highLossRatio',
      i18nParams: { avgLoss: avgLoss.toFixed(1), avgWin: avgWin.toFixed(1) } })

  for (const s of sessions) {
    if (s.total < 30) continue
    const diff = s.winRate - allWR
    if (diff < -0.15)
      insights.push({ type: 'warning', priority: 'medium',
        i18nKey: 'insight.rules.sessionUnderperform',
        i18nParams: { sessionId: s.id, sessionRate: (s.winRate * 100).toFixed(0), overallRate: winRate.toFixed(0) } })
    else if (diff > 0.15)
      insights.push({ type: 'success', priority: 'low',
        i18nKey: 'insight.rules.sessionOverperform',
        i18nParams: { sessionId: s.id, sessionRate: (s.winRate * 100).toFixed(0) } })
  }

  if (streak >= 5)
    insights.push({ type: 'warning', priority: 'medium',
      i18nKey: 'insight.rules.lossStreak',
      i18nParams: { streak } })

  const worst = symbols.find(s => s.total >= 5 && s.winRate < 0.35 && s.profit < 0)
  if (worst)
    insights.push({ type: 'warning', priority: 'medium',
      i18nKey: 'insight.rules.symbolUnderperform',
      i18nParams: { symbol: worst.name, rate: (worst.winRate * 100).toFixed(0), profit: worst.profit.toFixed(0) } })

  const holdingInsight = analyzeHoldingTime(trades)
  if (holdingInsight) insights.push(holdingInsight)

  if (maxDrawdown > 1000)
    insights.push({ type: 'warning', priority: 'medium',
      i18nKey: 'insight.rules.drawdownLarge',
      i18nParams: { value: maxDrawdown.toFixed(0) } })

  if (winRate >= 60)
    insights.push({ type: 'success', priority: 'low',
      i18nKey: 'insight.rules.excellentWinRate',
      i18nParams: { rate: winRate.toFixed(1) } })

  if (isFinite(profitFactor) && profitFactor >= 1.5)
    insights.push({ type: 'success', priority: 'low',
      i18nKey: 'insight.rules.pfGood',
      i18nParams: { pf: profitFactor.toFixed(2) } })

  if (isFinite(profitFactor) && profitFactor >= 1.5 && totalProfit > 0 && maxDrawdown / totalProfit < 0.2)
    insights.push({ type: 'success', priority: 'low',
      i18nKey: 'insight.rules.stableTrades' })

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  insights.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))

  return insights.slice(0, 7)
}

// ────────────────────────────────────────────────
// 改善提案（行動ベース）
// ────────────────────────────────────────────────

export function generateSuggestions(trades, stats) {
  if (!trades || trades.length < 5) return []
  const suggestions = []

  const { winRate = 0, avgWin = 0, avgLoss = 0, maxDrawdown = 0, totalProfit = 0 } = stats ?? {}
  const sessions   = analyzeBySession(trades)
  const symbols    = analyzeBySymbol(trades)
  const curStreak  = currentLossStreak(trades)
  const allWR      = winRate / 100
  const expectancy = calcExpectancy(winRate, avgWin, avgLoss)

  if (curStreak >= 3)
    suggestions.push({ priority: 'high',
      i18nKey: 'insight.suggestionRules.pauseAndRecheck' })

  if (expectancy < 0)
    suggestions.push({ priority: 'high',
      i18nKey: 'insight.suggestionRules.reviewStrategy' })

  if (avgWin > 0 && avgLoss > avgWin * 1.5)
    suggestions.push({ priority: 'high',
      i18nKey: 'insight.suggestionRules.improveStopLoss' })

  const wins   = trades.filter(t => profit(t) > 0)
  const losses = trades.filter(t => profit(t) < 0)
  if (wins.length >= 5 && losses.length >= 5) {
    const avgWinHold  = wins.reduce((s, t)   => s + holdingMinutes(t), 0) / wins.length
    const avgLossHold = losses.reduce((s, t) => s + holdingMinutes(t), 0) / losses.length
    if (avgLossHold > avgWinHold * 1.5)
      suggestions.push({ priority: 'high',
        i18nKey: 'insight.suggestionRules.tightenLossExit' })
  }

  for (const s of sessions) {
    if (s.total >= 30 && (s.winRate - allWR) < -0.15)
      suggestions.push({ priority: 'medium',
        i18nKey: 'insight.suggestionRules.reduceSession',
        i18nParams: { sessionId: s.id } })
  }

  for (const s of symbols) {
    if (s.total >= 5 && s.winRate < 0.35 && s.profit < 0)
      suggestions.push({ priority: 'medium',
        i18nKey: 'insight.suggestionRules.skipSymbol',
        i18nParams: { symbol: s.name } })
  }

  const ddRatio = totalProfit > 0 ? maxDrawdown / totalProfit : 0
  if (ddRatio > 0.3)
    suggestions.push({ priority: 'medium',
      i18nKey: 'insight.suggestionRules.reduceLot' })

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  suggestions.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))

  return suggestions.slice(0, 5)
}

// ────────────────────────────────────────────────
// アラート生成
// ────────────────────────────────────────────────

export function generateAlerts(trades, stats) {
  if (!trades?.length) return []
  const alerts = []
  const streak = currentLossStreak(trades)
  const { maxDrawdown = 0, profitFactor, totalTrades = 0 } = stats ?? {}

  if (streak >= 3)
    alerts.push({ level: 'danger',
      i18nKey: 'insight.alertRules.ongoingStreak',
      i18nParams: { streak } })

  if (maxDrawdown > 1000)
    alerts.push({ level: 'danger',
      i18nKey: 'insight.alertRules.drawdownDanger',
      i18nParams: { value: maxDrawdown.toFixed(0) } })

  if (isFinite(profitFactor) && profitFactor < 1.2 && totalTrades >= 10)
    alerts.push({ level: 'warn',
      i18nKey: 'insight.alertRules.pfWarn',
      i18nParams: { pf: profitFactor.toFixed(2) } })

  return alerts
}

// ────────────────────────────────────────────────
// 勝ちパターン分析（Pro）
// ────────────────────────────────────────────────

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
