import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatMoneyWithCurrency, formatSignedMoney, formatPercent, formatCount, normalizeCurrency } from '../i18n/format'
import EaParamsPanel from './EaParamsPanel'

const SORT_VALUE = {
  profit:      (s, t, lang) => ({ label: t('app.accountList.sort.profit'),      value: formatSignedMoney(s.totalProfit, { lang }),                              color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
  trades:      (s, t, lang) => ({ label: t('app.accountList.sort.trades'),      value: formatCount(s.totalTrades, { lang }),                                    color: 'text-slate-300' }),
  pf:          (s, t, lang) => ({ label: t('app.accountList.sort.pf'),          value: isFinite(s.profitFactor) ? formatNumber(s.profitFactor, { lang }) : '∞', color: 'text-blue-400'  }),
  winRate:     (s, t, lang) => ({ label: t('app.accountList.sort.winRate'),     value: formatPercent(s.winRate, { lang }),                                       color: 'text-slate-300' }),
  maxDrawdown: (s, t, lang) => ({ label: t('app.accountList.sort.maxDrawdown'), value: formatNumber(s.maxDrawdown, { lang }),                                    color: 'text-amber-400' }),
  name:        (s, t, lang) => ({ label: t('app.accountList.sort.profit'),      value: formatSignedMoney(s.totalProfit, { lang }),                              color: s.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }),
}

export default function AccountCard({ account, onRemove, aliases = {}, setAlias, sortKey = 'profit', tradingEnabled = true, onTradingToggle, isPro = false, onUpgrade, alertThreshold = null, onAlertThresholdChange, notificationPermission = 'unsupported', onRequestNotification }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [thresholdInput, setThresholdInput] = useState(alertThreshold != null ? String(alertThreshold) : '')
  const [thresholdSaving, setThresholdSaving] = useState(false)

  useEffect(() => {
    setThresholdInput(alertThreshold != null ? String(alertThreshold) : '')
  }, [alertThreshold])
  const { account: info, stats } = account
  const isProfit = stats.totalProfit >= 0
  const displayName = aliases[info.name] || info.name
  const sortVal = (SORT_VALUE[sortKey] || SORT_VALUE.profit)(stats, t, lang)

  const startEdit = (e) => {
    e.stopPropagation()
    setEditValue(displayName)
    setEditing(true)
  }

  const saveEdit = (e) => {
    e.stopPropagation()
    const v = editValue.trim()
    setAlias?.(info.name, v || info.name)
    setEditing(false)
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit(e)
    if (e.key === 'Escape') cancelEdit(e)
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* ヘッダ */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface2 transition-colors"
        onClick={() => !editing && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isProfit ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div>
            {editing ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-bg border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none w-48"
                />
                <button onClick={saveEdit} aria-label={t('common.save')} className="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">✓</button>
                <button onClick={cancelEdit} aria-label={t('common.cancel')} className="text-slate-500 hover:text-slate-300 text-xs px-1.5 py-0.5 bg-surface2 border border-border rounded">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <div className="text-sm font-semibold text-slate-200">{displayName}</div>
                <button
                  onClick={startEdit}
                  className="text-slate-600 hover:text-blue-400 transition-colors text-xs leading-none opacity-0 group-hover:opacity-100"
                  title={t('account.card.rename')}
                  aria-label={t('account.card.rename')}
                >
                  ✎
                </button>
              </div>
            )}
            <div className="text-xs text-slate-500">{t('account.card.tradesCount', { count: stats.totalTrades })}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-600 font-mono">
            <span>{sortVal.label}</span>
          </div>
          <div className={`font-mono text-sm font-bold ${sortVal.color}`}>
            {sortVal.value}
          </div>
          {sortKey !== 'winRate' && (
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              WR {formatPercent(stats.winRate, { lang })}
            </div>
          )}
          {sortKey !== 'pf' && (
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              PF {isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor, { lang }) : '∞'}
            </div>
          )}
          {onTradingToggle && (
            <button
              onClick={e => { e.stopPropagation(); onTradingToggle(!tradingEnabled) }}
              title={tradingEnabled ? t('account.card.tradingStopHint') : t('account.card.tradingRunHint')}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all
                ${tradingEnabled
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                  : 'text-slate-500 border-slate-700 bg-slate-800/50 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${tradingEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {tradingEnabled ? t('account.card.tradingActive') : t('account.card.tradingPaused')}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
            title={t('account.card.delete')}
            aria-label={t('account.card.delete')}
          >
            ✕
          </button>
          <span aria-hidden="true" className="text-slate-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 展開詳細 */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* 口座情報 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(() => {
              const floating = (info.equity || 0) - (info.balance || 0) - (info.credit || 0)
              const cur = normalizeCurrency(info.currency)
              return [
                { label: t('account.card.metrics.balance'),  value: formatMoneyWithCurrency(info.balance || 0, cur, { lang }), color: 'text-slate-200' },
                { label: t('account.card.metrics.credit'),   value: formatMoneyWithCurrency(info.credit || 0,  cur, { lang }), color: 'text-blue-400' },
                { label: t('account.card.metrics.equity'),   value: formatMoneyWithCurrency(info.equity || 0,  cur, { lang }), color: (info.equity || 0) >= (info.balance || 0) ? 'text-emerald-400' : 'text-amber-400' },
                { label: t('account.card.metrics.floating'), value: `${formatSignedMoney(floating, { lang })}${cur ? ' ' + cur : ''}`, color: floating >= 0 ? 'text-emerald-400' : 'text-red-400' },
              ]
            })().map(item => (
              <div key={item.label} className="bg-bg rounded-lg p-2.5">
                <div className="text-xs text-slate-600 mb-0.5">{item.label}</div>
                <div className={`font-mono text-sm font-semibold ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
          {/* 取引成績 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: t('account.card.metrics.profit'),       value: formatSignedMoney(stats.totalProfit, { lang }), color: isProfit ? 'text-emerald-400' : 'text-red-400' },
              { label: t('account.card.metrics.grossProfit'),  value: '+' + formatNumber(stats.grossProfit, { lang }), color: 'text-emerald-400' },
              { label: t('account.card.metrics.grossLoss'),    value: '-' + formatNumber(stats.grossLoss,   { lang }), color: 'text-red-400' },
              { label: t('account.card.metrics.profitFactor'), value: isFinite(stats.profitFactor) ? formatNumber(stats.profitFactor, { lang }) : '∞', color: 'text-blue-400' },
              { label: t('account.card.metrics.winRate'),      value: formatPercent(stats.winRate, { lang }), color: 'text-slate-300' },
              { label: t('account.card.metrics.wins'),         value: formatCount(stats.wins,   { lang }), color: 'text-emerald-400' },
              { label: t('account.card.metrics.losses'),       value: formatCount(stats.losses, { lang }), color: 'text-red-400' },
              { label: t('account.card.metrics.maxDrawdown'),  value: formatNumber(stats.maxDrawdown, { lang }), color: 'text-amber-400' },
            ].map(item => (
              <div key={item.label} className="bg-bg rounded-lg p-2.5">
                <div className="text-xs text-slate-600 mb-0.5">{item.label}</div>
                <div className={`font-mono text-sm font-semibold ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
          {/* EA パラメータ管理（Pro 限定） */}
          {info.number != null && (
            <div className="pt-2 border-t border-border">
              <EaParamsPanel
                accountNumber={info.number}
                isPro={isPro}
                onUpgrade={onUpgrade}
              />
            </div>
          )}
          {/* 含み損アラート通知 */}
          {info.number != null && onAlertThresholdChange && notificationPermission !== 'unsupported' && (
            <div className="pt-2 border-t border-border">
              <div className={`rounded-lg p-3 space-y-2.5 transition-colors ${alertThreshold != null ? 'bg-amber-500/5 border border-amber-500/25' : 'bg-bg border border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-medium">🔔 {t('account.card.lossAlert.title')}</span>
                  {alertThreshold != null && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      {t('account.card.lossAlert.active')}
                      <span className="font-mono">−{alertThreshold.toLocaleString()}</span>
                    </span>
                  )}
                </div>
                {notificationPermission === 'denied' && (
                  <p className="text-xs text-red-400/80">{t('account.card.lossAlert.denied')}</p>
                )}
                {notificationPermission === 'default' && (
                  <button
                    onClick={e => { e.stopPropagation(); onRequestNotification?.() }}
                    className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-1 rounded transition-colors"
                  >
                    {t('account.card.lossAlert.enable')}
                  </button>
                )}
                {notificationPermission === 'granted' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-600 font-mono">−</span>
                      <input
                        type="number"
                        min="0"
                        value={thresholdInput}
                        onChange={e => setThresholdInput(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder={t('account.card.lossAlert.placeholder')}
                        className="bg-bg border border-border rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 w-28"
                      />
                    </div>
                    <button
                      disabled={thresholdSaving}
                      onClick={async e => {
                        e.stopPropagation()
                        const val = parseFloat(thresholdInput)
                        if (!isFinite(val) || val <= 0) return
                        setThresholdSaving(true)
                        await onAlertThresholdChange(val).catch(console.error)
                        setThresholdSaving(false)
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-1 rounded transition-colors disabled:opacity-40"
                    >
                      {t('account.card.lossAlert.save')}
                    </button>
                    {alertThreshold != null ? (
                      <button
                        onClick={e => { e.stopPropagation(); onAlertThresholdChange(null).catch(console.error) }}
                        className="text-xs text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                      >
                        {t('account.card.lossAlert.remove')}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">{t('account.card.lossAlert.hint')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
