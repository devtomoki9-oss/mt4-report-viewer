import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  supabase,
  fetchEaParams, setEaParamDesired, deleteEaParam, subscribeToEaParams,
} from '../lib/supabaseClient'

// ── 値の正規化 / 検証 ─────────────────────────────────

function coerceValue(spec, raw) {
  switch (spec.type) {
    case 'int': {
      const n = parseInt(raw, 10)
      return Number.isFinite(n) ? n : (spec.default ?? 0)
    }
    case 'double': {
      const n = parseFloat(raw)
      return Number.isFinite(n) ? n : (spec.default ?? 0)
    }
    case 'bool':
      return !!raw
    default:
      return raw == null ? '' : String(raw)
  }
}

function clamp(spec, value) {
  if (typeof value !== 'number') return value
  let v = value
  if (typeof spec.min === 'number') v = Math.max(spec.min, v)
  if (typeof spec.max === 'number') v = Math.min(spec.max, v)
  return v
}

function deepEqualValues(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  const ks = Object.keys(a)
  if (ks.length !== Object.keys(b).length) return false
  return ks.every((k) => a[k] === b[k])
}

function rangeText(spec) {
  const hasMin = spec.min != null && spec.min !== ''
  const hasMax = spec.max != null && spec.max !== ''
  if (hasMin && hasMax) return `${spec.min} – ${spec.max}`
  if (hasMin)           return `≥ ${spec.min}`
  if (hasMax)           return `≤ ${spec.max}`
  return null
}

// ── ステータスバッジ ─────────────────────────────────

const STATUS_STYLE = {
  notSet:  { color: 'text-slate-400',   border: 'border-slate-700',       bg: 'bg-slate-800/50',    dot: 'bg-slate-500'   },
  applied: { color: 'text-emerald-400', border: 'border-emerald-500/30',  bg: 'bg-emerald-500/10',  dot: 'bg-emerald-400' },
  pending: { color: 'text-amber-400',   border: 'border-amber-500/30',    bg: 'bg-amber-500/10',    dot: 'bg-amber-400'   },
  drift:   { color: 'text-orange-400',  border: 'border-orange-500/30',   bg: 'bg-orange-500/10',   dot: 'bg-orange-400'  },
}

function statusFor(row) {
  if (!row.manifest)                                  return null
  if (!row.desired)                                   return 'notSet'
  if (row.actual && deepEqualValues(row.desired, row.actual)) return 'applied'
  const dt = row.desired_at ? new Date(row.desired_at).getTime() : 0
  const at = row.actual_at  ? new Date(row.actual_at).getTime()  : 0
  return dt > at ? 'pending' : 'drift'
}

function StatusPill({ status, t }) {
  if (!status) return null
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${s.border} ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {t(`eaParams.status.${status}`)}
    </span>
  )
}

// ── 単一パラメータの入力 UI ──────────────────────────

const BASE_INPUT = 'bg-bg border border-border rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors'

function ParamField({ spec, value, onChange, disabled }) {
  const id = `pf-${spec.name}`
  if (spec.type === 'bool') {
    return (
      <label htmlFor={id} className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-3.5 h-3.5 accent-blue-500"
        />
        <span className="text-[11px] font-mono text-slate-400">{value ? 'true' : 'false'}</span>
      </label>
    )
  }
  if (spec.type === 'enum' && Array.isArray(spec.options)) {
    return (
      <select
        id={id}
        disabled={disabled}
        value={value ?? spec.default ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${BASE_INPUT} w-full`}
      >
        {spec.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  if (spec.type === 'int' || spec.type === 'double') {
    return (
      <input
        id={id}
        type="number"
        disabled={disabled}
        value={value ?? ''}
        step={spec.type === 'int' ? 1 : 'any'}
        min={spec.min ?? undefined}
        max={spec.max ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${BASE_INPUT} w-full font-mono`}
      />
    )
  }
  return (
    <input
      id={id}
      type="text"
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${BASE_INPUT} w-full`}
    />
  )
}

// ── 1 EA インスタンス分のフォーム ─────────────────────

function EaInstanceCard({ row, onSave, onDelete, disabled, t }) {
  const params = useMemo(() => row.manifest?.params ?? [], [row.manifest])
  const initialValues = useMemo(() => {
    const v = {}
    for (const p of params) {
      const fromDesired = row.desired?.[p.name]
      const fromActual  = row.actual?.[p.name]
      const fromDefault = p.default
      v[p.name] = fromDesired ?? fromActual ?? fromDefault
    }
    return v
  }, [params, row.desired, row.actual])

  const initialKey = JSON.stringify(initialValues)
  const [values, setValues]   = useState(() => initialValues)
  const [prevKey, setPrevKey] = useState(initialKey)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const dirty = useMemo(() => {
    return params.some((p) => {
      const cur = values[p.name]
      const ref = row.desired?.[p.name] ?? row.actual?.[p.name] ?? p.default
      return String(cur) !== String(ref)
    })
  }, [params, values, row.desired, row.actual])

  // MT 側で値が変わったら表示も追従させる。ただしユーザーが編集中（dirty）
  // のときは入力を奪わないため、その回はスキップする。
  if (prevKey !== initialKey) {
    setPrevKey(initialKey)
    if (!dirty) setValues(initialValues)
  }

  const status = statusFor(row)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const out = {}
      for (const p of params) {
        const v = coerceValue(p, values[p.name])
        out[p.name] = clamp(p, v)
      }
      await onSave(out)
    } catch (e) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleResetToDefaults = () => {
    const v = {}
    for (const p of params) v[p.name] = p.default
    setValues(v)
  }

  const handleResetEdits = () => setValues(initialValues)

  const eaName = row.ea_name || row.manifest?.eaName || '—'

  return (
    <div className="bg-bg border border-border rounded-lg overflow-hidden">
      {/* ヘッダ */}
      <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 border-b border-border/70 bg-[#0d1320]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-blue-400/70 text-xs">⚙</span>
            <span className="text-sm font-semibold text-slate-100 truncate" title={eaName}>{eaName}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] text-slate-500 font-mono">{row.symbol || '—'} · {row.timeframe || '—'}</span>
            <StatusPill status={status} t={t} />
          </div>
        </div>
        <button
          onClick={() => onDelete(row.chart_id)}
          className="text-slate-600 hover:text-red-400 hover:bg-red-500/10 text-sm w-6 h-6 rounded flex items-center justify-center transition-colors flex-shrink-0"
          title={t('eaParams.deleteHint')}
          disabled={disabled || saving}
          aria-label={t('eaParams.deleteHint')}
        >
          ✕
        </button>
      </div>

      {/* パラメータ */}
      <div className="px-3.5 py-3 space-y-3">
        {params.length === 0 ? (
          <div className="text-[11px] text-slate-500 py-2">{t('eaParams.noParams')}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {params.map((p) => {
              const range = rangeText(p)
              return (
                <div key={p.name} className="bg-surface/40 border border-border/60 rounded-md px-2.5 py-2 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor={`pf-${p.name}`}
                      className="text-[11px] font-medium text-slate-200 truncate"
                      title={p.name}
                    >
                      {p.name}
                    </label>
                    <span className="text-[9px] text-slate-500 font-mono shrink-0">{p.type}</span>
                  </div>
                  <ParamField
                    spec={p}
                    value={values[p.name]}
                    onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))}
                    disabled={disabled || saving}
                  />
                  {range && (
                    <div className="text-[9px] text-slate-600 font-mono">{range}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
            {error}
          </div>
        )}

        {/* アクション行 */}
        {params.length > 0 && (
          <div className="flex items-center justify-between pt-1 gap-2">
            <button
              onClick={handleResetToDefaults}
              disabled={disabled || saving}
              className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
            >
              ↺ {t('eaParams.resetDefaults')}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetEdits}
                disabled={disabled || saving || !dirty}
                className="text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                type="button"
              >
                {t('eaParams.discardEdits')}
              </button>
              <button
                onClick={handleSave}
                disabled={disabled || saving || !dirty}
                className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                type="button"
              >
                {saving ? t('eaParams.saving') : t('eaParams.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── パネル本体 ───────────────────────────────────────

function PanelHeader({ t }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-blue-400/80 text-sm">⚙</span>
        <span className="text-xs font-semibold text-slate-200">{t('eaParams.title')}</span>
      </div>
      <span className="text-[10px] text-slate-600">{t('eaParams.subtitle')}</span>
    </div>
  )
}

function SourceWarning({ t }) {
  return (
    <div
      className="text-[11px] text-amber-200/80 leading-relaxed bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2"
      dangerouslySetInnerHTML={{ __html: t('eaParams.sourceRequired') }}
    />
  )
}

export default function EaParamsPanel({ accountNumber, isPro, onUpgrade }) {
  const { t } = useTranslation()
  const [rows, setRows]   = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const data = await fetchEaParams(accountNumber)
      setRows(data)
      setError(null)
    } catch (e) {
      setError(e.message ?? String(e))
    }
  }, [accountNumber])

  useEffect(() => {
    if (!isPro) return
    let cancelled = false
    fetchEaParams(accountNumber)
      .then((data) => { if (!cancelled) { setRows(data); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message ?? String(e)) })
    const channel = subscribeToEaParams(accountNumber, (payload) => {
      const row = payload.new ?? payload.old
      if (row && Number(row.account_number) === Number(accountNumber)) reload()
    })
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [accountNumber, isPro, reload])

  const handleSave = useCallback(async (chartId, desired) => {
    if (!window.confirm(t('eaParams.confirmSave'))) {
      throw new Error(t('eaParams.cancelled'))
    }
    await setEaParamDesired(accountNumber, chartId, desired)
  }, [accountNumber, t])

  const handleDelete = useCallback(async (chartId) => {
    if (!window.confirm(t('eaParams.confirmDelete'))) return
    await deleteEaParam(accountNumber, chartId).catch((e) => setError(e.message))
    reload()
  }, [accountNumber, reload, t])

  // ── Free プラン: アップグレード CTA ─────────────────
  if (!isPro) {
    return (
      <div className="space-y-2">
        <PanelHeader t={t} />
        <div className="bg-bg border border-border rounded-lg p-4 space-y-3">
          <div className="text-[11px] text-slate-400 leading-relaxed">{t('eaParams.proOnly')}</div>
          <SourceWarning t={t} />
          <div className="flex justify-center">
            <button
              onClick={onUpgrade}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold shadow-lg transition-colors"
            >
              {t('eaParams.upgradeCta')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Pro プラン ──────────────────────────────────────
  return (
    <div className="space-y-2">
      <PanelHeader t={t} />

      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
          {error}
        </div>
      )}

      {rows == null ? (
        <div className="text-[11px] text-slate-500 py-2">{t('eaParams.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="bg-bg border border-dashed border-border rounded-lg p-4 space-y-2">
          <SourceWarning t={t} />
          <div
            className="text-[11px] text-slate-500 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t('eaParams.empty') }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <EaInstanceCard
              key={r.chart_id}
              row={r}
              t={t}
              onSave={(desired) => handleSave(r.chart_id, desired)}
              onDelete={(chartId) => handleDelete(chartId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
