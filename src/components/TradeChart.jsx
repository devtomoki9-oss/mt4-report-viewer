import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'

// "2024.05.03 09:15:00" / "2024-05-03 09:15:00" → "05/03 09:15"
const fmtTime = (str) => {
  if (!str) return ''
  const m = str.match(/\d{4}[.\-](\d{2})[.\-](\d{2})\s+(\d{2}):(\d{2})/)
  return m ? `${m[1]}/${m[2]} ${m[3]}:${m[4]}` : ''
}

// ---- Hover tooltip ---------------------------------------------------------
function MarkerTooltip({ tooltip, containerRef }) {
  if (!tooltip) return null
  const cw = containerRef.current?.clientWidth ?? 600
  const isRight = tooltip.x > cw * 0.62
  const { data } = tooltip

  const rows = []
  if (data.buyEntries?.length > 0)
    rows.push({
      label: '▲ 買エントリー',
      items: data.buyEntries.map(e => ({ value: String(e.size), time: fmtTime(e.time) })),
      cls: 'text-emerald-400',
    })
  if (data.sellEntries?.length > 0)
    rows.push({
      label: '▼ 売エントリー',
      items: data.sellEntries.map(e => ({ value: String(e.size), time: fmtTime(e.time) })),
      cls: 'text-red-400',
    })
  if (data.exits?.length > 0) {
    const total = data.exits.reduce((s, e) => s + e.pnl, 0)
    rows.push({
      label: '● 決済',
      items: data.exits.map(e => ({
        value: `${e.pnl >= 0 ? '+' : ''}${e.pnl.toFixed(0)}`,
        time:  fmtTime(e.time),
      })),
      cls: total >= 0 ? 'text-emerald-400' : 'text-red-400',
    })
  }
  if (rows.length === 0) return null

  return (
    <div
      className="absolute z-20 bg-[#1a2235] border border-[#1f2d40] rounded-lg p-2.5 text-xs pointer-events-none shadow-xl"
      style={{
        left:      isRight ? tooltip.x - 8 : tooltip.x + 12,
        top:       Math.max(4, tooltip.y - 20),
        transform: isRight ? 'translateX(-100%)' : undefined,
        minWidth:  '160px',
        maxWidth:  '240px',
      }}
    >
      {rows.map((row, i) => (
        <div key={i} className={i > 0 ? 'mt-1.5 pt-1.5 border-t border-[#1f2d40]' : ''}>
          <div className={`font-semibold ${row.cls} mb-1`}>{row.label} {row.items.length}件</div>
          <div className="space-y-0.5 pl-2">
            {row.items.map((item, j) => (
              <div key={j} className="flex items-center justify-between gap-3">
                <span className="text-slate-300">{item.value}</span>
                <span className="text-slate-500 tabular-nums">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Main component --------------------------------------------------------
const TradeChart = forwardRef(function TradeChart(
  { chartData, trades = [], positions = [], symbol, tf },
  ref
) {
  const containerRef    = useRef(null)
  const wrapperRef      = useRef(null)
  const chartRef        = useRef(null)
  const detailMapRef    = useRef(new Map())
  const savedRangeRef   = useRef(null)
  const savedCtxRef     = useRef(null)
  const totalCandlesRef = useRef(0)
  const hideTimerRef    = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const toUnixSec = (str) =>
    Math.floor(new Date(str.replace(' ', 'T').replace(/\./g, '-')).getTime() / 1000)

  const handleZoom = useCallback((factor) => {
    const chart = chartRef.current
    if (!chart) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const total  = totalCandlesRef.current
    const center = (range.from + range.to) / 2
    const half   = (range.to - range.from) / 2 * factor
    if (factor > 1 && total > 0 && half * 2 >= total) {
      chart.timeScale().fitContent()
      return
    }
    chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half })
  }, [])

  const handleFit = useCallback(() => {
    chartRef.current?.timeScale().fitContent()
  }, [])

  useImperativeHandle(ref, () => ({
    zoomIn:     () => handleZoom(0.6),
    zoomOut:    () => handleZoom(1.7),
    fitContent: handleFit,
  }), [handleZoom, handleFit])

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current || !chartData) return

    const chartHeight = Math.max(wrapperRef.current.clientHeight, 200)

    const chart = createChart(containerRef.current, {
      layout:          { background: { color: '#0d1117' }, textColor: '#94a3b8' },
      grid:            { vertLines: { color: '#1f2d40' }, horzLines: { color: '#1f2d40' } },
      crosshair:       { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2d40' },
      timeScale:       { borderColor: '#1f2d40', timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: chartHeight,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceLineVisible: false,
    })

    const candles = (chartData.candles || []).map(c => ({
      time:  toUnixSec(c.t),
      open:  c.o, high: c.h, low: c.l, close: c.c,
    })).filter(c => c.time > 0)

    candleSeries.setData(candles)
    totalCandlesRef.current = candles.length

    // 最終価格ライン（グレー点線・建値ラインと色を区別）
    if (candles.length > 0) {
      const lastClose = candles[candles.length - 1].close
      const lastPriceSeries = chart.addSeries(LineSeries, {
        color: '#94a3b8', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: true,
        crosshairMarkerVisible: false,
      })
      lastPriceSeries.setData([
        { time: candles[0].time,                  value: lastClose },
        { time: candles[candles.length - 1].time, value: lastClose },
      ])
    }

    const firstTs = candles[0]?.time ?? 0
    const lastTs  = candles[candles.length - 1]?.time ?? 0

    // 各取引のタイムスタンプを最寄りのローソク足時刻にスナップ
    const snapToBar = (ts) => {
      if (candles.length === 0) return ts
      let lo = 0, hi = candles.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (candles[mid].time <= ts) lo = mid
        else hi = mid - 1
      }
      return candles[lo].time
    }

    // バー時刻ごとにエントリー/決済をグループ化
    const detailMap = new Map()
    const getDetail = (barTime) => {
      if (!detailMap.has(barTime)) detailMap.set(barTime, { buyEntries: [], sellEntries: [], exits: [] })
      return detailMap.get(barTime)
    }

    for (const t of trades.filter(tr => tr.symbol === symbol)) {
      if (t.openTime) {
        const ts = toUnixSec(t.openTime)
        if (ts >= firstTs && ts <= lastTs) {
          const d = getDetail(snapToBar(ts))
          if (t.type === 'buy') d.buyEntries.push({ size: t.size, time: t.openTime })
          else                  d.sellEntries.push({ size: t.size, time: t.openTime })
        }
      }
      if (t.closeTime) {
        const ts  = toUnixSec(t.closeTime)
        const pnl = t.netProfit ?? t.profit ?? 0
        if (ts >= firstTs && ts <= lastTs)
          getDetail(snapToBar(ts)).exits.push({ size: t.size, pnl, time: t.closeTime })
      }
    }

    // バーごとに最大3マーカー（買エントリー・売エントリー・決済）
    const markerList = []
    for (const [barTime, d] of detailMap.entries()) {
      if (d.buyEntries.length > 0) {
        const n = d.buyEntries.length
        markerList.push({ time: barTime, position: 'belowBar', color: '#10b981', shape: 'arrowUp',
          text: n === 1 ? String(d.buyEntries[0].size) : `×${n}` })
      }
      if (d.sellEntries.length > 0) {
        const n = d.sellEntries.length
        markerList.push({ time: barTime, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown',
          text: n === 1 ? String(d.sellEntries[0].size) : `×${n}` })
      }
      if (d.exits.length > 0) {
        const total = d.exits.reduce((s, e) => s + e.pnl, 0)
        const n     = d.exits.length
        markerList.push({ time: barTime, position: 'aboveBar',
          color: total >= 0 ? '#10b981' : '#ef4444', shape: 'circle',
          text: n === 1
            ? `${total >= 0 ? '+' : ''}${total.toFixed(0)}`
            : `×${n} (${total >= 0 ? '+' : ''}${total.toFixed(0)})` })
      }
    }
    markerList.sort((a, b) => a.time - b.time)
    createSeriesMarkers(candleSeries, markerList)
    detailMapRef.current = detailMap

    // スクロールズーム上限：全データ幅を超えたら fitContent に戻す
    // ズームレンジをリアルタイムで保存（クリーンアップ時の null 問題を回避）
    let lockFit = false
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (lockFit || !range) return
      const total = totalCandlesRef.current
      if (total > 0 && (range.to - range.from) > total * 1.1) {
        lockFit = true
        chart.timeScale().fitContent()
        setTimeout(() => {
          lockFit = false
          const r = chart.timeScale().getVisibleLogicalRange()
          if (r) { savedRangeRef.current = r; savedCtxRef.current = { symbol, tf } }
        }, 50)
        return
      }
      savedRangeRef.current = range
      savedCtxRef.current   = { symbol, tf }
    })

    // クロスヘアでホバー時にツールチップ表示
    // 非表示はデバウンスしてチラつきを防ぐ
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || !detailMapRef.current.has(param.time)) {
        if (!hideTimerRef.current) {
          hideTimerRef.current = setTimeout(() => {
            setTooltip(null)
            hideTimerRef.current = null
          }, 80)
        }
        return
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setTooltip({ x: param.point.x, y: param.point.y, data: detailMapRef.current.get(param.time) })
    })

    // 保有ポジションの建値ライン
    for (const p of positions.filter(p => p.symbol === symbol)) {
      const line = chart.addSeries(LineSeries, {
        color: p.type === 'buy' ? '#34d399' : '#f87171', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      })
      if (candles.length > 0) line.setData([
        { time: candles[0].time,                  value: p.openPrice },
        { time: candles[candles.length - 1].time, value: p.openPrice },
      ])
    }

    // 同symbol×同TFならズーム状態を復元（範囲を有効値にクランプ）
    const ctx = savedCtxRef.current
    if (savedRangeRef.current && ctx?.symbol === symbol && ctx?.tf === tf) {
      const total = candles.length
      const from  = Math.max(0, savedRangeRef.current.from)
      const to    = Math.min(total - 1, savedRangeRef.current.to)
      if (to > from) {
        chart.timeScale().setVisibleLogicalRange({ from, to })
      } else {
        chart.timeScale().fitContent()
      }
    } else {
      chart.timeScale().fitContent()
    }

    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current && wrapperRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: Math.max(wrapperRef.current.clientHeight, 200),
        })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setTooltip(null)
      // 最終フォールバック（subscriber で既に保存済みだが念のため）
      const r = chart.timeScale().getVisibleLogicalRange()
      if (r) { savedRangeRef.current = r; savedCtxRef.current = { symbol, tf } }
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [chartData, trades, positions, symbol, tf])

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-600 text-sm text-center leading-relaxed">
        チャートデータがありません。<br />EA を再コンパイルして再アタッチしてください。
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative h-full min-h-[200px]">
      <div ref={containerRef} className="w-full" />
      <MarkerTooltip tooltip={tooltip} containerRef={containerRef} />
    </div>
  )
})

export default TradeChart
