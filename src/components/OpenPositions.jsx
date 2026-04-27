export default function OpenPositions({ positions, aliases = {} }) {
  if (!positions || positions.length === 0) return null

  const displayName = (name) => aliases[name] || name

  const totalProfit = positions.reduce((s, p) => s + p.profit + p.swap, 0)
  const isProfit = totalProfit >= 0

  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2d40] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-semibold text-slate-300">保有ポジション</span>
          <span className="text-xs text-slate-500">{positions.length} 件</span>
        </div>
        <div className={`font-mono text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfit ? '+' : ''}{totalProfit.toFixed(2)}
        </div>
      </div>

      {/* モバイルカードビュー */}
      <div className="sm:hidden divide-y divide-[#1f2d40]">
        {positions.map((p, i) => {
          const net = p.profit + p.swap
          const isLong = p.type === 'buy'
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {isLong ? '買' : '売'}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">{p.symbol}</span>
                  <span className="text-xs text-slate-500">{p.size}lot</span>
                </div>
                <span className={`font-mono text-sm font-bold flex-shrink-0 ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {net >= 0 ? '+' : ''}{net.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>建値 <span className="text-slate-400 font-mono">{p.openPrice}</span></span>
                <span>現在値 <span className="text-slate-400 font-mono">{p.currentPrice}</span></span>
                {p.comment && p.comment !== 'Manual' && (
                  <span className="text-blue-400 truncate">{displayName(p.comment)}</span>
                )}
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
              <th className="px-4 py-2.5 text-left font-medium">通貨ペア</th>
              <th className="px-3 py-2.5 text-left font-medium">種別</th>
              <th className="px-3 py-2.5 text-right font-medium">ロット</th>
              <th className="px-3 py-2.5 text-right font-medium">建値</th>
              <th className="px-3 py-2.5 text-right font-medium">現在値</th>
              <th className="px-3 py-2.5 text-right font-medium">損益</th>
              <th className="px-3 py-2.5 text-right font-medium">スワップ</th>
              <th className="px-3 py-2.5 text-right font-medium">SL</th>
              <th className="px-3 py-2.5 text-right font-medium">TP</th>
              <th className="px-3 py-2.5 text-left font-medium">EA / コメント</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const net = p.profit + p.swap
              const isLong = p.type === 'buy'
              return (
                <tr key={i} className="border-b border-[#1f2d40]/50 hover:bg-[#1a2235]/40 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-slate-200">{p.symbol}</td>
                  <td className="px-3 py-2.5">
                    <span className={`font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {isLong ? '買' : '売'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.size}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{p.openPrice}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.currentPrice}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${p.swap >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    {p.swap.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.sl || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.tp || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400 max-w-[120px] truncate">{p.comment}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
