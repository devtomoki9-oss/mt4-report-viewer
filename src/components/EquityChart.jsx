import { useState, useEffect, useRef, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Brush
} from 'recharts'

function calcNiceTicks(min, max, targetCount = 5) {
  const range = max - min || 1
  const rawStep = range / targetCount
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)))
  const norm = rawStep / mag
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
  const nMin = Math.floor(min / step) * step
  const nMax = Math.ceil(max / step) * step
  const ticks = []
  for (let t = nMin; t <= nMax + step * 0.001; t += step)
    ticks.push(Math.round(t * 10000) / 10000)
  return ticks
}

function fmtTick(v) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (abs >= 10_000)    return (v / 1_000).toFixed(0) + 'K'
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + 'K'
  return v.toLocaleString()
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className={`font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {val >= 0 ? '+' : ''}{val.toFixed(2)}
      </div>
    </div>
  )
}

export default function EquityChart({ data, title = 'エクイティカーブ' }) {
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 })
  const [brushKey, setBrushKey] = useState(0)
  const rangeRef = useRef(range)
  const dataRef  = useRef(data)
  const containerRef = useRef(null)

  dataRef.current = data

  // データが変わったらズームをリセット
  useEffect(() => {
    if (!data.length) return
    const r = { startIndex: 0, endIndex: data.length - 1 }
    rangeRef.current = r
    setRange(r)
    setBrushKey(k => k + 1)
  }, [data])

  // スクロールで拡大縮小（passive: false が必要なため useEffect で登録）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const total = dataRef.current.length
      const { startIndex, endIndex } = rangeRef.current
      const visible = endIndex - startIndex
      const zoomIn  = e.deltaY < 0
      const step    = Math.max(3, Math.round(visible * 0.15))
      let s  = startIndex + (zoomIn ? step : -step)
      let en = endIndex   - (zoomIn ? step : -step)
      if (en - s < 5) return
      s  = Math.max(0, s)
      en = Math.min(total - 1, en)
      if (s >= en) return
      const next = { startIndex: s, endIndex: en }
      rangeRef.current = next
      setRange(next)
      setBrushKey(k => k + 1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4 flex items-center justify-center h-48 text-slate-600 text-sm">
        データなし
      </div>
    )
  }

  const safeStart   = Math.max(0, Math.min(range.startIndex, data.length - 1))
  const safeEnd     = Math.max(safeStart, Math.min(range.endIndex, data.length - 1))
  const visibleData = data.slice(safeStart, safeEnd + 1)
  const minVal      = Math.min(0, ...visibleData.map(d => d.equity))
  const maxVal      = Math.max(0, ...visibleData.map(d => d.equity))
  const ticks       = calcNiceTicks(minVal, maxVal)
  const domain      = [ticks[0], ticks[ticks.length - 1]]

  // 等間隔 X 軸ティック（最大 7 本、視覚的に均等配置）
  const xTicks = useMemo(() => {
    const MAX = 7
    const total = safeEnd - safeStart
    if (total === 0) return [safeStart]
    const count = Math.min(MAX, total + 1)
    return Array.from({ length: count }, (_, i) =>
      Math.round(safeStart + (i / (count - 1)) * total)
    )
  }, [safeStart, safeEnd])

  const indexedData = useMemo(() => data.map((d, i) => ({ ...d, _i: i })), [data])

  const final    = data[data.length - 1]?.equity || 0
  const isProfit = final >= 0
  const isZoomed = safeStart > 0 || safeEnd < data.length - 1

  const resetZoom = () => {
    const r = { startIndex: 0, endIndex: data.length - 1 }
    rangeRef.current = r
    setRange(r)
    setBrushKey(k => k + 1)
  }

  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4" ref={containerRef}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-300">{title}</div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-slate-600">スクロールで拡大縮小</span>
          {isZoomed && (
            <button onClick={resetZoom}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              全体表示
            </button>
          )}
          <div className={`font-mono text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{final.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="h-[200px] sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={indexedData} margin={{ top: 4, right: 36, bottom: 5, left: 8 }}>
          <defs>
            <linearGradient id={`grad-${isProfit}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isProfit ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isProfit ? '#10b981' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2d40" vertical={false} />
          <XAxis
            type="number"
            scale="linear"
            dataKey="_i"
            domain={[safeStart, safeEnd]}
            ticks={xTicks}
            interval={0}
            tickFormatter={i => data[i]?.date?.slice(5) ?? ''}
            tick={{ fill: '#475569', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            allowDataOverflow={false}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fill: '#475569', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={fmtTick}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#2a3f5a" strokeDasharray="4 2" />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={isProfit ? '#10b981' : '#ef4444'}
            strokeWidth={2}
            fill={`url(#grad-${isProfit})`}
            dot={false}
            activeDot={{ r: 4, fill: isProfit ? '#10b981' : '#ef4444' }}
          />
          <Brush
            key={brushKey}
            dataKey="date"
            startIndex={safeStart}
            endIndex={safeEnd}
            height={30}
            stroke="#1f2d40"
            fill="#0a0e17"
            travellerWidth={8}
            onChange={({ startIndex: s, endIndex: e }) => {
              const next = { startIndex: s, endIndex: e }
              rangeRef.current = next
              setRange(next)
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
