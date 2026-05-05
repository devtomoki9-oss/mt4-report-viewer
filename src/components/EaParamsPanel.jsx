import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchEaParams, setEaParamDesired, deleteEaParam, subscribeToEaParams } from '../lib/supabaseClient'
import { supabase } from '../lib/supabaseClient'

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

// ── ステータスバッジ ─────────────────────────────────

function StatusBadge({ manifest, desired, actual, desiredAt, actualAt, t }) {
  if (!manifest) return null
  if (!desired) {
    return <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/50">{t('eaParams.status.notSet')}</span>
  }
  const synced = actual && deepEqualValues(desired, actual)
  if (synced) {
    return <span className="text-[10px] text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10">{t('eaParams.status.applied')}</span>
  }
  const desiredTime = desiredAt ? new Date(desiredAt).getTime() : 0
  const actualTime  = actualAt  ? new Date(actualAt).getTime()  : 0
  if (desiredTime > actualTime) {
    return <span className="text-[10px] text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10">{t('eaParams.status.pending')}</span>
  }
  return <span className="text-[10px] text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10">{t('eaParams.status.drift')}</span>
}

// ── 単一パラメータの入力 UI ──────────────────────────

function ParamField({ spec, value, onChange, disabled }) {
  const id = `pf-${spec.name}`
  const baseInput = "bg-[#0a0e17] border border-[#1f2d40] rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
  if (spec.type === 'bool') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-blue-500"
        />
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
        className={`${baseInput} w-full`}
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
        className={`${baseInput} w-full font-mono`}
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
      className={`${baseInput} w-full`}
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
  const [values, setValues] = useState(() => initialValues)
  const [prevKey, setPrevKey] = useState(initialKey)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  if (prevKey !== initialKey) {
    setPrevKey(initialKey)
    setValues(initialValues)
  }

  const dirty = useMemo(() => {
    return params.some((p) => {
      const cur = values[p.name]
      const ref = row.desired?.[p.name] ?? row.actual?.[p.name] ?? p.default
      return String(cur) !== String(ref)
    })
  }, [params, values, row.desired, row.actual])

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

  return (
    <div className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-200">{row.ea_name || row.manifest?.eaName || '—'}</span>
          <span className="text-[10px] text-slate-500 font-mono">{row.symbol || '—'} · {row.timeframe || '—'}</span>
          <StatusBadge
            manifest={row.manifest} desired={row.desired} actual={row.actual}
            desiredAt={row.desired_at} actualAt={row.actual_at} t={t}
          />
        </div>
        <button
          onClick={() => onDelete(row.chart_id)}
          className="text-slate-600 hover:text-red-400 text-xs px-1"
          title={t('eaParams.deleteHint')}
          disabled={disabled || saving}
        >
          ✕
        </button>
      </div>

      {params.length === 0 ? (
        <div className="text-[11px] text-slate-500">{t('eaParams.noParams')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {params.map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400 font-mono w-32 truncate" title={p.name}>{p.name}</label>
              <div className="flex-1">
                <ParamField
                  spec={p}
                  value={values[p.name]}
                  onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))}
                  disabled={disabled || saving}
                />
              </div>
              <span className="text-[9px] text-slate-600 font-mono w-12 text-right shrink-0">{p.type}</span>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          onClick={handleResetToDefaults}
          disabled={disabled || saving || params.length === 0}
          className="text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 disabled:opacity-40"
        >
          {t('eaParams.resetDefaults')}
        </button>
        <button
          onClick={handleResetEdits}
          disabled={disabled || saving || !dirty}
          className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 disabled:opacity-40"
        >
          {t('eaParams.discardEdits')}
        </button>
        <button
          onClick={handleSave}
          disabled={disabled || saving || !dirty || params.length === 0}
          className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
        >
          {saving ? t('eaParams.saving') : t('eaParams.save')}
        </button>
      </div>
    </div>
  )
}

// ── パネル本体 ───────────────────────────────────────

export default function EaParamsPanel({ accountNumber, isPro, onUpgrade }) {
  const { t } = useTranslation()
  const [rows, setRows]     = useState(null)
  const [error, setError]   = useState(null)

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
    const channel = subscribeToEaParams((payload) => {
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

  if (!isPro) {
    return (
      <div className="bg-[#0a0e17] border border-[#1f2d40] rounded-lg p-4 text-center">
        <div className="text-xs text-slate-300 mb-1 font-semibold">{t('eaParams.title')}</div>
        <div className="text-[11px] text-slate-500 mb-2">{t('eaParams.proOnly')}</div>
        <div
          className="text-[11px] text-amber-200/70 mb-3 leading-relaxed text-left bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2"
          dangerouslySetInnerHTML={{ __html: t('eaParams.sourceRequired') }}
        />
        <button
          onClick={onUpgrade}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold shadow-lg transition-colors"
        >
          {t('eaParams.upgradeCta')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-300">{t('eaParams.title')}</div>
        <div className="text-[10px] text-slate-600">{t('eaParams.subtitle')}</div>
      </div>

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      {rows == null ? (
        <div className="text-[11px] text-slate-500">{t('eaParams.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="bg-[#0a0e17] border border-dashed border-[#1f2d40] rounded-lg p-4 text-[11px] text-slate-500 space-y-2">
          <div
            className="text-amber-200/70 leading-relaxed bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2"
            dangerouslySetInnerHTML={{ __html: t('eaParams.sourceRequired') }}
          />
          <div dangerouslySetInnerHTML={{ __html: t('eaParams.empty') }} />
        </div>
      ) : (
        rows.map((r) => (
          <EaInstanceCard
            key={r.chart_id}
            row={r}
            t={t}
            onSave={(desired) => handleSave(r.chart_id, desired)}
            onDelete={(chartId) => handleDelete(chartId)}
          />
        ))
      )}
    </div>
  )
}
