export default function StatCard({ label, value, sub, color = 'white', size = 'md' }) {
  const colors = {
    white: 'text-white',
    profit: 'text-emerald-400',
    loss: 'text-red-400',
    accent: 'text-blue-400',
    warn: 'text-amber-400',
    muted: 'text-slate-400',
  }
  const sizes = {
    sm: 'text-base font-semibold',
    md: 'text-xl font-bold',
    lg: 'text-2xl font-bold',
  }
  return (
    <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-4 flex flex-col gap-1">
      <div className="text-xs text-slate-500 font-medium tracking-wide uppercase">{label}</div>
      <div className={`font-mono ${sizes[size]} ${colors[color]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}
