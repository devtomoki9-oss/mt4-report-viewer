import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'

export default function TradeChart({ chartData, trades = [], positions = [], symbol }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !chartData) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor:  '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1f2d40' },
        horzLines: { color: '#1f2d40' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2d40' },
      timeScale: {
        borderColor:    '#1f2d40',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: 420,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#10b981',
      downColor:       '#ef4444',
      borderUpColor:   '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor:     '#10b981',
      wickDownColor:   '#ef4444',
    })

    const candles = (chartData.candles || []).map(c => ({
      time:  Math.floor(new Date(c.t.replace(' ', 'T')).getTime() / 1000),
      open:  c.o,
      high:  c.h,
      low:   c.l,
      close: c.c,
    })).filter(c => c.time > 0)

    candleSeries.setData(candles)

    const symTrades = trades.filter(t => t.symbol === symbol).slice(-30)
    const markers = []
    for (const t of symTrades) {
      if (t.openTime) {
        const ts = Math.floor(new Date(t.openTime.replace(' ', 'T')).getTime() / 1000)
        markers.push({
          time:     ts,
          position: t.type === 'buy' ? 'belowBar' : 'aboveBar',
          color:    t.type === 'buy' ? '#10b981'  : '#ef4444',
          shape:    t.type === 'buy' ? 'arrowUp'  : 'arrowDown',
          text:     `${t.type === 'buy' ? '買' : '売'} ${t.size}`,
        })
      }
      if (t.closeTime) {
        const ts = Math.floor(new Date(t.closeTime.replace(' ', 'T')).getTime() / 1000)
        const isProfit = (t.netProfit ?? t.profit ?? 0) >= 0
        markers.push({
          time:     ts,
          position: t.type === 'buy' ? 'aboveBar' : 'belowBar',
          color:    isProfit ? '#10b981' : '#ef4444',
          shape:    'circle',
          text:     `決済 ${isProfit ? '+' : ''}${(t.netProfit ?? t.profit ?? 0).toFixed(0)}`,
        })
      }
    }
    markers.sort((a, b) => a.time - b.time)
    createSeriesMarkers(candleSeries, markers)

    for (const p of positions.filter(p => p.symbol === symbol)) {
      const line = chart.addSeries(LineSeries, {
        color:            p.type === 'buy' ? '#34d399' : '#f87171',
        lineWidth:        1,
        lineStyle:        2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      if (candles.length > 0) {
        const first = candles[0].time
        const last  = candles[candles.length - 1].time
        line.setData([
          { time: first, value: p.openPrice },
          { time: last,  value: p.openPrice },
        ])
      }
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [chartData, trades, positions, symbol])

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[420px] text-slate-600 text-sm">
        チャートデータがありません。<br />EA を再コンパイルして再アタッチしてください。
      </div>
    )
  }

  return <div ref={containerRef} className="w-full" />
}
