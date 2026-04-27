/**
 * MT4 Trade Detail Report (HTML) parser
 *
 * MT4が出力するHTMLレポートを解析し、口座情報・取引履歴を返す。
 * EAの識別は "Comment" 列の値を使う。空の場合は "Manual" とみなす。
 */

function parseFloat2(str) {
  if (!str) return 0
  return parseFloat(str.replace(/\s/g, '').replace(',', '.')) || 0
}

function parseDate(str) {
  if (!str || str.trim() === '') return null
  // MT4 format: "2024.01.15 10:23:45"
  return str.trim()
}

export function parseMT4Report(htmlText, accountLabel = '') {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlText, 'text/html')

  // --- 口座情報 ---
  const accountInfo = {}
  const tables = doc.querySelectorAll('table')

  // 1枚目のテーブルに口座情報が含まれることが多い
  let headerTable = null
  let tradeTable = null

  for (const t of tables) {
    const text = t.innerText || t.textContent || ''
    if (text.includes('Deposit') || text.includes('Balance') || text.includes('入金') || text.includes('残高')) {
      if (!headerTable) headerTable = t
    }
    // トレードテーブルは "Open Time" か "Type" ヘッダがある
    const headers = [...t.querySelectorAll('th, td')].map(c => (c.textContent || '').trim().toLowerCase())
    if (headers.includes('type') || headers.includes('open time')) {
      tradeTable = t
    }
  }

  // タイトルからアカウント名を抽出
  const titleEl = doc.querySelector('title') || doc.querySelector('h2') || doc.querySelector('b')
  accountInfo.name = accountLabel || (titleEl ? titleEl.textContent.trim() : 'Account')

  // --- ヘッダテーブルから口座数値を取得 ---
  const summaryRows = {}
  if (headerTable) {
    const rows = headerTable.querySelectorAll('tr')
    rows.forEach(row => {
      const cells = row.querySelectorAll('td')
      for (let i = 0; i < cells.length - 1; i += 2) {
        const key = (cells[i].textContent || '').trim().replace(':', '')
        const val = (cells[i + 1]?.textContent || '').trim()
        if (key) summaryRows[key] = val
      }
    })
  }

  // --- サマリー行の解析（レポート末尾の集計行）---
  // トレードテーブルがない場合は全テーブルを候補にする
  const allTables = tradeTable ? [tradeTable] : [...tables]

  let trades = []
  let summaryStats = {}

  for (const tbl of allTables) {
    const rows = [...tbl.querySelectorAll('tr')]
    if (rows.length < 2) continue

    // ヘッダ行を探す
    let headerRowIndex = -1
    let colMap = {}
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const cells = [...rows[i].querySelectorAll('th, td')]
      const texts = cells.map(c => c.textContent.trim().toLowerCase())
      if (texts.includes('type') || texts.includes('open time') || texts.some(t => t.includes('open'))) {
        headerRowIndex = i
        texts.forEach((t, idx) => { colMap[t] = idx })
        break
      }
    }
    if (headerRowIndex < 0) continue

    // 列インデックスのマッピング
    const col = (name) => {
      for (const [k, v] of Object.entries(colMap)) {
        if (k === name || k.includes(name)) return v
      }
      return -1
    }

    const iTicket = col('#') >= 0 ? col('#') : col('ticket')
    const iOpenTime = col('open time') >= 0 ? col('open time') : col('open')
    const iType = col('type')
    const iSize = col('size') >= 0 ? col('size') : col('lots')
    const iItem = col('item') >= 0 ? col('item') : col('symbol')
    const iOpenPrice = col('open price') >= 0 ? col('open price') : col('price')
    const iSL = col('s/l')
    const iTP = col('t/p')
    const iCloseTime = col('close time') >= 0 ? col('close time') : col('close')
    const iClosePrice = col('close price') >= 0 ? col('close price') : col('price') !== iOpenPrice ? col('price') : -1
    const iCommission = col('commission')
    const iTaxes = col('taxes')
    const iSwap = col('swap')
    const iProfit = col('profit')
    const iComment = col('comment')

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('td')]
      if (cells.length < 3) continue

      const cell = (idx) => idx >= 0 && idx < cells.length ? (cells[idx].textContent || '').trim() : ''

      const type = cell(iType).toLowerCase()

      // サマリー行（Balance, Deposit, Credit, Profit等）
      if (['balance', 'credit', 'deposit', 'withdrawal'].includes(type)) {
        const label = type
        summaryStats[label] = (summaryStats[label] || 0) + parseFloat2(cell(iProfit))
        continue
      }

      // 空行・ヘッダ繰り返しをスキップ
      if (!type || type === 'type') continue

      // 決済済みトレード（buy/sell）のみ対象
      if (!['buy', 'sell', 'buy limit', 'sell limit', 'buy stop', 'sell stop',
            'buy stop limit', 'sell stop limit'].some(t => type.startsWith(t))) continue

      const profit = parseFloat2(cell(iProfit))
      const swap = parseFloat2(cell(iSwap))
      const commission = parseFloat2(cell(iCommission))
      const comment = cell(iComment)

      trades.push({
        ticket: cell(iTicket),
        openTime: parseDate(cell(iOpenTime)),
        closeTime: parseDate(cell(iCloseTime)),
        type: cell(iType),
        size: parseFloat2(cell(iSize)),
        symbol: cell(iItem) || cell(col('item')),
        openPrice: parseFloat2(cell(iOpenPrice)),
        closePrice: parseFloat2(cell(iClosePrice) || cell(iOpenPrice)),
        sl: parseFloat2(cell(iSL)),
        tp: parseFloat2(cell(iTP)),
        commission,
        taxes: parseFloat2(cell(iTaxes)),
        swap,
        profit,
        netProfit: profit + swap + commission,
        comment: comment || 'Manual',
        ea: comment || 'Manual',
      })
    }

    if (trades.length > 0) break
  }

  // --- 統計計算 ---
  const totalProfit = trades.reduce((s, t) => s + t.netProfit, 0)
  const wins = trades.filter(t => t.netProfit > 0)
  const losses = trades.filter(t => t.netProfit < 0)
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0

  const grossProfit = wins.reduce((s, t) => s + t.netProfit, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netProfit, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0

  // 最大ドローダウン（ピーク比較）
  let peak = 0
  let maxDD = 0
  let running = 0
  for (const t of trades) {
    running += t.netProfit
    if (running > peak) peak = running
    const dd = peak - running
    if (dd > maxDD) maxDD = dd
  }

  return {
    account: {
      name: accountInfo.name,
      label: accountLabel,
      ...summaryRows,
    },
    trades,
    stats: {
      totalTrades: trades.length,
      totalProfit,
      grossProfit,
      grossLoss,
      profitFactor,
      winRate,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      maxDrawdown: maxDD,
    },
  }
}

export function calcStatsFromTrades(trades) {
  const sorted = [...trades].sort((a, b) => (a.closeTime || '').localeCompare(b.closeTime || ''))
  const wins = trades.filter(t => t.netProfit > 0)
  const losses = trades.filter(t => t.netProfit < 0)
  const totalProfit = trades.reduce((s, t) => s + t.netProfit, 0)
  const grossProfit = wins.reduce((s, t) => s + t.netProfit, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netProfit, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0

  let peak = 0, maxDD = 0, running = 0
  for (const t of sorted) {
    running += t.netProfit
    if (running > peak) peak = running
    const dd = peak - running
    if (dd > maxDD) maxDD = dd
  }

  return {
    totalTrades: trades.length,
    totalProfit,
    grossProfit,
    grossLoss,
    profitFactor,
    winRate,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    maxDrawdown: maxDD,
  }
}

export function aggregateAccounts(accounts) {
  if (accounts.length === 0) return null
  const allTrades = accounts.flatMap(a => a.trades.map(t => ({ ...t, account: a.account.name })))
  return calcStatsFromTrades(allTrades)
}

export function groupByEA(accounts) {
  const allTrades = accounts.flatMap(a => a.trades.map(t => ({ ...t, account: a.account.name })))
  return groupByEAFromTrades(allTrades)
}

export function groupByEAFromTrades(trades) {
  const eaMap = {}
  for (const t of trades) {
    const ea = t.ea || 'Manual'
    if (!eaMap[ea]) eaMap[ea] = { ea, trades: [], accounts: new Set() }
    eaMap[ea].trades.push(t)
    eaMap[ea].accounts.add(t.account || '')
  }

  return Object.values(eaMap).map(group => ({
    ea: group.ea,
    accounts: [...group.accounts].filter(Boolean),
    trades: group.trades,
    ...calcStatsFromTrades(group.trades),
  })).sort((a, b) => b.totalProfit - a.totalProfit)
}

/**
 * MT4ReportExporter.mq4 が出力する JSON を解析する。
 * parseMT4Report と同じ形式のオブジェクトを返す。
 */
// MT4 日付 "2024.01.15 10:23:45" → "2024-01-15 10:23:45"
function normMT4Date(s) {
  if (!s) return ''
  return s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
}

export function parseMT4Json(jsonText, accountLabel = '') {
  const data = JSON.parse(jsonText)
  const raw = data.trades || []

  const trades = raw.map(t => {
    const profit     = Number(t.profit)     || 0
    const swap       = Number(t.swap)       || 0
    const commission = Number(t.commission) || 0
    const netProfit  = profit + swap + commission
    const ea         = (t.comment || '').trim() || 'Manual'
    return {
      ticket:     String(t.ticket || ''),
      openTime:   normMT4Date(t.openTime  || ''),
      closeTime:  normMT4Date(t.closeTime || ''),
      type:       t.type      || '',
      size:       Number(t.size  || t.lots || 0),
      symbol:     t.symbol    || '',
      openPrice:  Number(t.openPrice)  || 0,
      closePrice: Number(t.closePrice) || 0,
      sl:         Number(t.sl)  || 0,
      tp:         Number(t.tp)  || 0,
      commission,
      taxes:      0,
      swap,
      profit,
      netProfit,
      comment: ea,
      ea,
    }
  })

  const positions = (data.positions || []).map(p => ({
    ticket:       String(p.ticket || ''),
    openTime:     normMT4Date(p.openTime || ''),
    type:         p.type || '',
    size:         Number(p.size || p.lots || 0),
    symbol:       p.symbol || '',
    openPrice:    Number(p.openPrice)    || 0,
    currentPrice: Number(p.currentPrice) || 0,
    sl:           Number(p.sl) || 0,
    tp:           Number(p.tp) || 0,
    profit:       Number(p.profit) || 0,
    swap:         Number(p.swap)   || 0,
    comment:      (p.comment || '').trim() || 'Manual',
  }))

  const name = accountLabel || `Account ${data.account}`
  return {
    account: {
      name,
      label:      accountLabel,
      number:     data.account,
      server:     data.server     || '',
      currency:   data.currency   || '',
      balance:    data.balance    || 0,
      equity:     data.equity     || 0,
      credit:     data.credit     || 0,
      exportTime: data.exportTime || '',
    },
    trades,
    positions,
    stats: calcStatsFromTrades(trades),
  }
}

export function buildEquityCurve(trades) {
  if (!trades.length) return []
  const sorted = [...trades].sort((a, b) => (a.closeTime || '').localeCompare(b.closeTime || ''))
  let equity = 0
  return sorted.map(t => {
    equity += t.netProfit
    return { date: t.closeTime?.slice(0, 10) || '', equity: Math.round(equity * 100) / 100 }
  })
}

/**
 * MT5 Account Statement (HTML) parser
 *
 * Deals 形式（Direction 列あり）と Position History 形式の両方に対応。
 * Deals 形式は FIFO で in/out をペアリングしてトレードを再構成する。
 */
export function parseMT5Report(htmlText, accountLabel = '') {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlText, 'text/html')

  const tables = doc.querySelectorAll('table')
  let headerTable = null
  let dataTable   = null
  let tableType   = null // 'deals' | 'positions'

  for (const t of tables) {
    const text = t.textContent || ''
    if (!headerTable && (text.includes('Balance') || text.includes('残高') || text.includes('Deposit'))) {
      headerTable = t
    }
    const hdrs = [...t.querySelectorAll('th, td')].map(c => (c.textContent || '').trim().toLowerCase())
    if (!dataTable) {
      if (hdrs.includes('direction') || hdrs.some(h => h === 'deal' || h === '約定')) {
        dataTable = t; tableType = 'deals'
      } else if (
        (hdrs.some(h => h.includes('open time') || h === '始値時刻') && hdrs.some(h => h.includes('close time') || h === '終値時刻')) ||
        hdrs.some(h => h === 'position' || h === 'ポジション')
      ) {
        dataTable = t; tableType = 'positions'
      }
    }
  }

  const titleEl = doc.querySelector('title') || doc.querySelector('h2') || doc.querySelector('b')
  const name    = accountLabel || (titleEl ? titleEl.textContent.trim() : 'Account')

  const summaryRows = {}
  if (headerTable) {
    headerTable.querySelectorAll('tr').forEach(row => {
      const cells = row.querySelectorAll('td')
      for (let i = 0; i < cells.length - 1; i += 2) {
        const key = (cells[i].textContent || '').trim().replace(':', '')
        const val = (cells[i + 1]?.textContent || '').trim()
        if (key) summaryRows[key] = val
      }
    })
  }

  const trades = []

  if (!dataTable) {
    return { account: { name, label: accountLabel, ...summaryRows }, trades, stats: calcStatsFromTrades(trades) }
  }

  const rows = [...dataTable.querySelectorAll('tr')]
  let headerRowIndex = -1
  let colMap = {}

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = [...rows[i].querySelectorAll('th, td')]
    const texts = cells.map(c => (c.textContent || '').trim().toLowerCase())
    const isHdr = tableType === 'deals'
      ? texts.includes('direction') || texts.some(t => t === 'deal' || t === '約定')
      : texts.some(t => t.includes('open') || t === 'position' || t === 'ポジション')
    if (isHdr) {
      headerRowIndex = i
      texts.forEach((t, idx) => { colMap[t] = idx })
      break
    }
  }

  if (headerRowIndex < 0) {
    return { account: { name, label: accountLabel, ...summaryRows }, trades, stats: calcStatsFromTrades(trades) }
  }

  const col = (n) => {
    for (const [k, v] of Object.entries(colMap)) if (k === n || k.includes(n)) return v
    return -1
  }

  if (tableType === 'deals') {
    const iTime       = col('time')       >= 0 ? col('time')       : col('時刻')
    const iSymbol     = col('symbol')     >= 0 ? col('symbol')     : col('銘柄')
    const iType       = col('type')       >= 0 ? col('type')       : col('タイプ')
    const iDirection  = col('direction')  >= 0 ? col('direction')  : col('方向')
    const iVolume     = col('volume')     >= 0 ? col('volume')     : col('lots') >= 0 ? col('lots') : col('数量')
    const iPrice      = col('price')      >= 0 ? col('price')      : col('価格')
    const iCommission = col('commission') >= 0 ? col('commission') : col('手数料')
    const iFee        = col('fee')        >= 0 ? col('fee')        : col('費用')
    const iSwap       = col('swap')       >= 0 ? col('swap')       : col('スワップ')
    const iProfit     = col('profit')     >= 0 ? col('profit')     : col('損益')
    const iComment    = col('comment')    >= 0 ? col('comment')    : col('コメント')

    const rawDeals = []
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('td')]
      if (cells.length < 3) continue
      const cell = (idx) => idx >= 0 && idx < cells.length ? (cells[idx].textContent || '').trim() : ''
      const type      = cell(iType).toLowerCase()
      const direction = cell(iDirection).toLowerCase()
      if (!direction || ['balance', 'deposit', 'withdrawal', 'credit', 'correction'].includes(type)) continue
      rawDeals.push({
        time:       normMT4Date(cell(iTime)),
        symbol:     cell(iSymbol),
        type,
        direction,
        volume:     parseFloat2(cell(iVolume)),
        price:      parseFloat2(cell(iPrice)),
        commission: parseFloat2(cell(iCommission)) + parseFloat2(cell(iFee)),
        swap:       parseFloat2(cell(iSwap)),
        profit:     parseFloat2(cell(iProfit)),
        comment:    cell(iComment),
      })
    }

    // FIFO in/out ペアリング（symbol + type キー）
    const inQueues = {}
    for (const deal of rawDeals) {
      const key = `${deal.symbol}-${deal.type}`
      if (deal.direction === 'in/out') {
        const ea = deal.comment.trim() || 'Manual'
        const netProfit = deal.profit + deal.swap + deal.commission
        trades.push({
          ticket: '', openTime: deal.time, closeTime: deal.time,
          type: deal.type, size: deal.volume, symbol: deal.symbol,
          openPrice: deal.price, closePrice: deal.price, sl: 0, tp: 0,
          commission: deal.commission, taxes: 0, swap: deal.swap, profit: deal.profit,
          netProfit, comment: ea, ea,
        })
      } else if (deal.direction === 'in') {
        if (!inQueues[key]) inQueues[key] = []
        inQueues[key].push(deal)
      } else if (deal.direction === 'out') {
        const inDeal = inQueues[key]?.shift()
        if (!inDeal) continue
        const swap       = (inDeal.swap || 0) + deal.swap
        const commission = (inDeal.commission || 0) + deal.commission
        const profit     = deal.profit
        const netProfit  = profit + swap + commission
        const ea         = (deal.comment || inDeal.comment || '').trim() || 'Manual'
        trades.push({
          ticket: '', openTime: inDeal.time, closeTime: deal.time,
          type: inDeal.type, size: inDeal.volume, symbol: inDeal.symbol,
          openPrice: inDeal.price, closePrice: deal.price, sl: 0, tp: 0,
          commission, taxes: 0, swap, profit, netProfit, comment: ea, ea,
        })
      }
    }
  } else {
    // Position History 形式（MT4 と同構造）
    const iTicket     = col('position') >= 0 ? col('position') : col('ポジション')
    const iOpenTime   = col('open time') >= 0 ? col('open time') : col('始値時刻')
    const iType       = col('type')      >= 0 ? col('type')      : col('タイプ')
    const iVolume     = col('volume')    >= 0 ? col('volume')    : col('lots') >= 0 ? col('lots') : col('数量')
    const iSymbol     = col('symbol')    >= 0 ? col('symbol')    : col('銘柄')
    const iOpenPrice  = col('open price') >= 0 ? col('open price') : col('始値')
    const iSL         = col('s/l')
    const iTP         = col('t/p')
    const iCloseTime  = col('close time') >= 0 ? col('close time') : col('終値時刻')
    const iClosePrice = col('close price') >= 0 ? col('close price') : col('終値')
    const iCommission = col('commission') >= 0 ? col('commission') : col('手数料')
    const iSwap       = col('swap')       >= 0 ? col('swap')       : col('スワップ')
    const iProfit     = col('profit')     >= 0 ? col('profit')     : col('損益')
    const iComment    = col('comment')    >= 0 ? col('comment')    : col('コメント')

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('td')]
      if (cells.length < 3) continue
      const cell = (idx) => idx >= 0 && idx < cells.length ? (cells[idx].textContent || '').trim() : ''
      const type = cell(iType).toLowerCase()
      if (!type || ['balance', 'deposit', 'withdrawal', 'credit'].includes(type)) continue
      if (!['buy', 'sell'].some(t => type.startsWith(t))) continue
      const profit = parseFloat2(cell(iProfit))
      const swap   = parseFloat2(cell(iSwap))
      const commission = parseFloat2(cell(iCommission))
      const ea = cell(iComment) || 'Manual'
      trades.push({
        ticket:     cell(iTicket),
        openTime:   normMT4Date(cell(iOpenTime)),
        closeTime:  normMT4Date(cell(iCloseTime)),
        type:       cell(iType),
        size:       parseFloat2(cell(iVolume)),
        symbol:     cell(iSymbol),
        openPrice:  parseFloat2(cell(iOpenPrice)),
        closePrice: parseFloat2(cell(iClosePrice)),
        sl: parseFloat2(cell(iSL)), tp: parseFloat2(cell(iTP)),
        commission, taxes: 0, swap, profit,
        netProfit: profit + swap + commission,
        comment: ea, ea,
      })
    }
  }

  return {
    account: { name, label: accountLabel, ...summaryRows },
    trades,
    stats: calcStatsFromTrades(trades),
  }
}

/**
 * MT4 / MT5 HTML レポートを自動判別してパースする。
 * Direction 列または MetaTrader 5 の記述があれば MT5 として処理。
 */
export function parseHTMLReport(htmlText, accountLabel = '') {
  const lower = htmlText.toLowerCase()
  const isMT5 = lower.includes('direction') && (lower.includes('"deal"') || lower.includes('>deal<') || lower.includes('metatrader 5'))
    || lower.includes('metatrader 5')
  return isMT5 ? parseMT5Report(htmlText, accountLabel) : parseMT4Report(htmlText, accountLabel)
}
