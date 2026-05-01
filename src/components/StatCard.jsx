const TOP_ACCENT = {
  profit: 'bg-emerald-500/50',
  loss:   'bg-red-500/50',
  accent: 'bg-blue-500/50',
  warn:   'bg-amber-500/50',
}

const VALUE_COLORS = {
  white:  'text-white',
  profit: 'text-emerald-400',
  loss:   'text-red-400',
  accent: 'text-blue-400',
  warn:   'text-amber-400',
  muted:  'text-slate-400',
}

const VALUE_SIZES = {
  sm: 'text-sm font-semibold',
  md: 'text-lg sm:text-xl font-bold',
  lg: 'text-xl sm:text-2xl font-bold',
}

export default function StatCard({ label, value, sub, color = 'white', size = 'md' }) {
  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl overflow-hidden flex flex-col">
      {TOP_ACCENT[color] && (
        <div className={`h-0.5 w-full ${TOP_ACCENT[color]}`} />
      )}
      <div className="p-3 sm:p-4 flex flex-col gap-1 flex-1">
        <div className="text-[11px] sm:text-xs text-slate-500 font-medium tracking-wide uppercase">{label}</div>
        <div className={`font-mono ${VALUE_SIZES[size]} ${VALUE_COLORS[color]}`}>{value}</div>
        {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}
