import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import {
  parseHTMLReport, parseMT4Json, calcStatsFromTrades, buildEquityCurve
} from './lib/mt4Parser'
import {
  saveHandle, loadHandle, collectReportFiles,
  FOLDER_KEY, supportsFileSystemAccess
} from './lib/folderStore'
import { INSTALL_BAT, MQ4_CONTENT, MQ5_CONTENT, SYNC_PS1_CONTENT } from './lib/downloadFiles'

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

function generateRunSyncVbs(url, anonKey, email, password) {
  const u = url.trim()
  const k = anonKey.trim()
  const e = email.trim()
  const p = password.replace(/"/g, '""')
  return (
    `' MT Report Viewer - Auto Sync\r\n` +
    `' Place in the same folder as sync-to-supabase.ps1\r\n` +
    `Dim WshShell, ps1Path, psArgs\r\n` +
    `Set WshShell = CreateObject("WScript.Shell")\r\n` +
    `ps1Path = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\\")) & "sync-to-supabase.ps1"\r\n` +
    `psArgs = " -Url ""${u}"" -AnonKey ""${k}"" -Email ""${e}"" -Password ""${p}"""\r\n` +
    `WshShell.Run "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File """ & ps1Path & """" & psArgs, 0, False\r\n` +
    `Set WshShell = Nothing\r\n`
  )
}
import {
  supabase, signOut, getSession, fetchReports, deleteAccount,
  fetchAliases, saveAliases, fetchPlan,
} from './lib/supabaseClient'
import PrivacyPolicy from './components/PrivacyPolicy'
import DeleteAccountModal from './components/DeleteAccountModal'
import FeedbackModal from './components/FeedbackModal'
import ManualModal from './components/ManualModal'
import TermsModal from './components/TermsModal'
import UploadZone from './components/UploadZone'
import StatCard from './components/StatCard'
import AccountCard from './components/AccountCard'
import AccountBreakdown from './components/AccountBreakdown'
import EquityChart from './components/EquityChart'
import TradeTable from './components/TradeTable'
import OpenPositions from './components/OpenPositions'
import DateRangeFilter from './components/DateRangeFilter'
import TradeCalendar from './components/TradeCalendar'
import InsightPanel from './components/InsightPanel'
import LoginScreen from './components/LoginScreen'
import LandingPage from './components/LandingPage'

const TABS = [
  { id: 'overview',  label: 'サマリー'   },
  { id: 'ea',        label: '口座別成績' },
  { id: 'trades',    label: '全取引'     },
  { id: 'calendar',  label: 'カレンダー' },
]

const EXPORT_INTERVAL_MS = 1 * 60 * 1000
const SUPABASE_INTERVAL_MS = 1 * 60 * 1000

const ACC_SORT_FNS = {
  name:        (a) => a.account.name ?? '',
  trades:      (a) => a.stats.totalTrades ?? 0,
  profit:      (a) => a.stats.totalProfit ?? 0,
  pf:          (a) => isFinite(a.stats.profitFactor) ? a.stats.profitFactor : 1e9,
  winRate:     (a) => a.stats.winRate ?? 0,
  maxDrawdown: (a) => a.stats.maxDrawdown ?? 0,
  avgWin:      (a) => a.stats.avgWin ?? 0,
  avgLoss:     (a) => a.stats.avgLoss ?? 0,
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


function fmt(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  return abs >= 1000 ? abs.toLocaleString('en', { maximumFractionDigits: 2 }) : abs.toFixed(2)
}
function toDay(str) { return str?.slice(0, 10) || '' }
function fmtTime(d) {
  if (!d) return ''
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtCountdown(s) {
  if (s == null) return ''
  const n = Math.max(0, s)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

export default function App() {
  const [accounts,   setAccounts]   = useState([])
  const [tab,        setTab]        = useState('overview')
  const [dateRange,  setDateRange]  = useState({ from: '', to: '' })
  const [aliases,    setAliasesState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mt4_aliases') || '{}') } catch { return {} }
  })
  const aliasesSyncTimerRef = useRef(null)
  const setAlias = useCallback((originalName, displayName) => {
    setAliasesState(prev => {
      const next = { ...prev }
      if (displayName && displayName !== originalName) {
        next[originalName] = displayName
      } else {
        delete next[originalName]
      }
      localStorage.setItem('mt4_aliases', JSON.stringify(next))
      // Supabase へデバウンス保存（0.8秒）
      if (aliasesSyncTimerRef.current) clearTimeout(aliasesSyncTimerRef.current)
      aliasesSyncTimerRef.current = setTimeout(() => {
        saveAliases(next).catch(console.error)
      }, 800)
      return next
    })
  }, [])

  const [showLp,      setShowLp]      = useState(true)
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [refreshing,   setRefreshing]  = useState(false)
  const [showPrivacy,  setShowPrivacy] = useState(false)
  const [syncDone,        setSyncDone]        = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deletingAccount,   setDeletingAccount]   = useState(false)
  const [showVbsModal,      setShowVbsModal]      = useState(false)
  const [vbsPass,           setVbsPass]           = useState('')
  const [showFeedback,      setShowFeedback]      = useState(false)
  const [showManual,        setShowManual]        = useState(false)
  const [showTerms,         setShowTerms]         = useState(false)
  const [showMobileMenu,    setShowMobileMenu]    = useState(false)
  const mobileMenuRef = useRef(null)
  const [plan, setPlan] = useState('free')

  const hasData = accounts.length > 0

  const [accSort, setAccSort] = useState({ key: 'profit', dir: 'desc' })
  const onAccSort = useCallback((col) => {
    setAccSort(s => s.key === col
      ? { key: col, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { key: col, dir: 'desc' }
    )
  }, [])

  const [dirHandle,    setDirHandle]   = useState(null)
  const [lastUpdated,  setLastUpdated] = useState(null)
  const [secondsLeft,  setSecondsLeft] = useState(null)
  const [nextExportAt, setNextExportAt] = useState(null)
  const autoLoadDoneRef = useRef(false)
  const lastModifiedRef = useRef(new Map())
  const reloadFolderRef = useRef(null)
  const dirHandleRef    = useRef(null)

  // ── ファイル解析 ──────────────────────────────────────
  const parseFiles = useCallback(async (files) => {
    const results = []
    for (const file of files) {
      try {
        const text  = await file.text()
        const label = file.name.replace(/\.(html?|json)$/i, '')
        const parsed = /\.json$/i.test(file.name)
          ? parseMT4Json(text, label)
          : parseHTMLReport(text, label)
        if (parsed) results.push(parsed)
      } catch (e) {
        console.error('Parse error:', file.name, e)
      }
    }
    return results
  }, [])

  // ── Supabase から同期 ─────────────────────────────────
  const syncFromSupabase = useCallback(async () => {
    try {
      const rows    = await fetchReports()
      const files   = rows.map(r => new File([r.text], r.name, { lastModified: r.lastModified }))
      const results = await parseFiles(files)
      setAccounts(prev => {
        const byName = new Map(prev.map(a => [a.account.name, a]))
        results.forEach(r => byName.set(r.account.name, r))
        return [...byName.values()]
      })
      setLastUpdated(new Date())
      if (results.length > 0) setNextExportAt(Date.now() + SUPABASE_INTERVAL_MS)
    } catch (e) {
      console.error('Supabase sync error:', e)
    }
  }, [parseFiles])

  // ── フォルダから読み込み ──────────────────────────────
  const loadFromDir = useCallback(async (handle) => {
    try {
      const files   = await collectReportFiles(handle)
      const results = await parseFiles(files)
      const byName  = new Map()
      for (const r of results) byName.set(r.account.name, r)
      setAccounts([...byName.values()])
      let maxModified = 0
      for (const f of files) {
        lastModifiedRef.current.set(f.name, f.lastModified)
        if (f.lastModified > maxModified) maxModified = f.lastModified
      }
      if (maxModified > 0) setNextExportAt(maxModified + EXPORT_INTERVAL_MS)

    } catch (e) {
      console.error('Folder read error:', e)
    }
    setLastUpdated(new Date())
  }, [parseFiles])

  // ── 手動アップロード ──────────────────────────────────
  const handleFiles = async (files) => {
    const results = await parseFiles(files)
    setAccounts(prev => {
      const byName = new Map(prev.map(a => [a.account.name, a]))
      results.forEach(r => byName.set(r.account.name, r))
      return [...byName.values()]
    })
    setLastUpdated(new Date())
  }

  // ── フォルダ登録 ─────────────────────────────────────
  const registerFolder = async () => {
    if (!supportsFileSystemAccess()) {
      alert('Chrome / Edge をお使いください（File System Access API が必要です）')
      return
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await saveHandle(FOLDER_KEY, handle)
      setDirHandle(handle)

      await loadFromDir(handle)
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e)
    }
  }

  // ── 更新（force=true: MT4にトリガー送信して再取得、false: 変化検知のみ） ──
  const reloadFolder = useCallback(async (force = false) => {
    if (!dirHandle) return
    try {
      if (force) {
        // readwrite 権限でトリガーファイルを書き込む
        const rwPerm = await dirHandle.queryPermission({ mode: 'readwrite' })
        const granted = rwPerm === 'granted'
          || (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted'
        if (granted) {
          try {
            // トリガー前の lastModified スナップショット（全 JSON）
            const snapshot = new Map()
            for (const f of await collectReportFiles(dirHandle)) snapshot.set(f.name, f.lastModified)

            const fh = await dirHandle.getFileHandle('_refresh.cmd', { create: true })
            const writable = await fh.createWritable()
            await writable.write('1')
            await writable.close()

            // 全 JSON が更新されるまで最大 15 秒待機
            const deadline = Date.now() + 15000
            while (Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 1000))
              const files = await collectReportFiles(dirHandle)
              const jsonFiles = files.filter(f => /\.json$/i.test(f.name))
              const allUpdated = jsonFiles.length > 0
                && jsonFiles.every(f => f.lastModified > (snapshot.get(f.name) ?? 0))
              if (allUpdated) {
                await loadFromDir(dirHandle)
                try { await dirHandle.removeEntry('_refresh.cmd') } catch (e) { void e }
                return
              }
            }
          } catch (e) { console.error('Trigger write error:', e) }
          // タイムアウト時もトリガーを削除
          try { await dirHandle.removeEntry('_refresh.cmd') } catch (e) { void e }
        }
        // タイムアウトまたは readwrite 不可の場合は現在のファイルを強制読み込み
        await loadFromDir(dirHandle)
      } else {
        const perm = await dirHandle.queryPermission({ mode: 'read' })
        if (perm !== 'granted') return
        const files = await collectReportFiles(dirHandle)
        const hasChanges = files.some(f => f.lastModified > (lastModifiedRef.current.get(f.name) ?? 0))
        if (hasChanges) await loadFromDir(dirHandle)
      }
    } catch (e) { console.error(e) }
  }, [dirHandle, loadFromDir])

  // ── Supabase セッション監視 ───────────────────────────
  useEffect(() => {
    getSession()
      .then(session => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── 起動時: ログイン済みなら自動読み込み ─────────────
  useEffect(() => {
    if (!user || autoLoadDoneRef.current) return
    autoLoadDoneRef.current = true

    // プランを取得
    fetchPlan().then(setPlan).catch(console.error)

    // Supabase から最新の alias を取得してローカルに反映
    fetchAliases().then(remote => {
      if (Object.keys(remote).length > 0) {
        setAliasesState(remote)
        localStorage.setItem('mt4_aliases', JSON.stringify(remote))
      } else {
        // リモートが空の場合、ローカルの alias をアップロード（初回同期）
        setAliasesState(local => {
          if (Object.keys(local).length > 0) saveAliases(local).catch(console.error)
          return local
        })
      }
    }).catch(console.error)

    syncFromSupabase()
  }, [user, syncFromSupabase])

  // ── モバイルメニューの外側クリックで閉じる ──────────
  useEffect(() => {
    if (!showMobileMenu) return
    const close = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target))
        setShowMobileMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showMobileMenu])

  // ── 各 ref を常に最新に保つ ──────────────────────────
  const syncFromSupabaseRef = useRef(null)
  useEffect(() => { reloadFolderRef.current     = reloadFolder     }, [reloadFolder])
  useEffect(() => { syncFromSupabaseRef.current = syncFromSupabase }, [syncFromSupabase])
  useEffect(() => { dirHandleRef.current        = dirHandle        }, [dirHandle])

  // ── 手動更新 ─────────────────────────────────────────
  const requestRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await syncFromSupabase()
    } finally {
      setRefreshing(false)
      setSyncDone(true)
    }
  }, [refreshing, syncFromSupabase])

  // ── Stripe アップグレード ─────────────────────────────
  const handleUpgrade = useCallback(async () => {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, email: user?.email, returnUrl: window.location.href }),
      })
      if (!res.ok) throw new Error('checkout session failed')
      const { url } = await res.json()
      window.location.href = url
    } catch (e) {
      alert('アップグレードの処理中にエラーが発生しました。しばらく経ってから再試行してください。')
      console.error(e)
    }
  }, [user])

  // ── Supabase 自動更新（1分ごと・メイン画面のみ） ────
  useEffect(() => {
    if (!user || !hasData) return
    const id = setInterval(() => syncFromSupabase(), SUPABASE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user, hasData, syncFromSupabase])

  // ── 30秒ポーリング（変化検知） ────────────────────
  useEffect(() => {
    if (!dirHandle) return
    const id = setInterval(() => reloadFolder(false), 30 * 1000)
    return () => { clearInterval(id); setNextExportAt(null); setSecondsLeft(null) }
  }, [dirHandle, reloadFolder])

  // ── カウントダウン（nextExportAt から逆算、0 で再チェック） ──
  useEffect(() => {
    if (!nextExportAt) return
    let fired = false
    const update = () => {
      const s = Math.max(0, Math.round((nextExportAt - Date.now()) / 1000))
      setSecondsLeft(s)
      if (s === 0 && !fired) {
        fired = true
        if (dirHandleRef.current) reloadFolderRef.current?.(false)
        else syncFromSupabaseRef.current?.()
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => { clearInterval(id); setSecondsLeft(null) }
  }, [nextExportAt])

  const removeAccount = (name) => setAccounts(prev => prev.filter(a => a.account.name !== name))
  const clearAll = () => {
    setAccounts([])
    setTab('overview')
    setDateRange({ from: '', to: '' })
    setLastUpdated(null)
  }

  // ── 派生データ ────────────────────────────────────────
  const allTrades = useMemo(
    () => accounts.flatMap(a => a.trades.map(t => ({ ...t, account: a.account.name }))),
    [accounts]
  )
  const allPositions = useMemo(
    () => accounts.flatMap(a => (a.positions || []).map(p => ({ ...p, account: a.account.name }))),
    [accounts]
  )
  const { dataMin, dataMax } = useMemo(() => {
    const dates = allTrades.map(t => toDay(t.closeTime)).filter(Boolean).sort()
    return { dataMin: dates[0] || '', dataMax: dates[dates.length - 1] || '' }
  }, [allTrades])

  const filteredTrades = useMemo(() => {
    const { from, to } = dateRange
    if (!from && !to) return allTrades
    return allTrades.filter(t => {
      const d = toDay(t.closeTime)
      return !(from && d < from) && !(to && d > to)
    })
  }, [allTrades, dateRange])

  const agg              = useMemo(() => filteredTrades.length > 0 ? calcStatsFromTrades(filteredTrades) : null, [filteredTrades])

  const equityCurve      = useMemo(() => buildEquityCurve(filteredTrades), [filteredTrades])
  const filteredAccStats = useMemo(
    () => accounts.map(acc => ({
      account: acc.account,
      stats: calcStatsFromTrades(filteredTrades.filter(t => t.account === acc.account.name)),
    })),
    [accounts, filteredTrades]
  )

  const sortedFilteredAccStats = useMemo(() => {
    const fn = ACC_SORT_FNS[accSort.key] ?? ACC_SORT_FNS.profit
    return [...filteredAccStats].sort((a, b) => {
      const va = fn(a), vb = fn(b)
      if (typeof va === 'string') return accSort.dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
      return accSort.dir === 'desc' ? vb - va : va - vb
    })
  }, [filteredAccStats, accSort])

  const isFiltered = !!(dateRange.from || dateRange.to)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-slate-500 text-sm">読み込み中…</div>
      </div>
    )
  }

  if (!user) {
    return showLp
      ? <LandingPage onStart={() => setShowLp(false)} />
      : <LoginScreen onLogin={setUser} />
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">

      {/* ヘッダ */}
      <header className="border-b border-[#1f2d40] bg-[#0a0e17]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
                📈
              </div>
              <span className="font-semibold text-slate-100 text-sm tracking-tight">MT4/MT5 Report Viewer</span>
              {hasData && <span className="text-xs text-slate-600 ml-1 hidden sm:inline">{accounts.length} 口座</span>}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {user && (
                <>
                  <button
                    onClick={requestRefresh}
                    disabled={refreshing}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                    {refreshing ? '…' : '↻ 更新'}
                  </button>
                  <button
                    onClick={async () => { await signOut(); setAccounts([]); setUser(null) }}
                    className="text-slate-600 hover:text-slate-300 transition-colors px-2 py-1.5 text-xs">
                    ログアウト
                  </button>
                  <button
                    onClick={() => setShowDeleteAccount(true)}
                    className="hidden sm:inline text-slate-700 hover:text-red-400 transition-colors px-2 py-1.5 text-xs"
                    title="アカウント削除">
                    アカウント削除
                  </button>
                </>
              )}
              {hasData && (
                <>
                  <nav className="hidden sm:flex gap-1 bg-[#111827] border border-[#1f2d40] rounded-lg p-1">
                    {TABS.map(t => (
                      <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all
                          ${tab === t.id ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                        {t.label}
                      </button>
                    ))}
                  </nav>
                  <button onClick={clearAll} className="hidden sm:inline text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1">
                    クリア
                  </button>
                </>
              )}
              {/* モバイル用メニュー（⋮ボタン + ドロップダウン） */}
              <div className="relative sm:hidden" ref={mobileMenuRef}>
                <button
                  onClick={() => setShowMobileMenu(v => !v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[#1a2235] transition-colors text-base">
                  ⋮
                </button>
                {showMobileMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-[#111827] border border-[#1f2d40] rounded-xl shadow-2xl py-1 z-50">
                    {hasData && (
                      <button
                        onClick={() => { clearAll(); setShowMobileMenu(false) }}
                        className="w-full text-left px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-[#1a2235] transition-colors">
                        データをクリア
                      </button>
                    )}
                    {user && (
                      <button
                        onClick={() => { setShowDeleteAccount(true); setShowMobileMenu(false) }}
                        className="w-full text-left px-4 py-2.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-[#1a2235] transition-colors">
                        アカウント削除
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {hasData && (
            <div className="sm:hidden flex gap-1 pb-2 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 flex-shrink-0 py-1.5 text-xs rounded-md font-medium transition-all whitespace-nowrap
                    ${tab === t.id ? 'bg-blue-600 text-white shadow' : 'bg-[#111827] border border-[#1f2d40] text-slate-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">

{!hasData ? (
          /* ── ウェルカム画面 ── */
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-6">
            <div className="text-center mb-2">
              <h1 className="text-2xl font-bold text-slate-100 mb-2">MT4/MT5 取引レポートビューア</h1>
              <p className="text-slate-500 text-sm">複数口座のレポートを集約し、成績を分析します</p>
            </div>

            {syncDone && (
              <div className="w-full max-w-2xl bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-amber-400">
                <span className="text-base flex-shrink-0">⚠</span>
                <div className="space-y-1">
                  <div className="font-semibold">Supabase にレポートデータが見つかりません</div>
                  <div className="text-amber-500/80">MT4/MT5 が起動しているか、<code className="font-mono bg-amber-500/10 px-1 rounded">sync-to-supabase.ps1</code> のタスクスケジューラが動作しているか確認してください。</div>
                </div>
              </div>
            )}

            <div className="w-full max-w-2xl bg-[#111827] border border-[#1f2d40] rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide">セットアップ（初回のみ）</div>
              {[
                {
                  step: '1',
                  text: '下のボタンから install.bat・MT4ReportExporter.mq4・MT5ReportExporter.mq5 を同じフォルダにダウンロード',
                  sub: null, code: null,
                },
                {
                  step: '2',
                  text: 'PowerShell で下のコマンドを実行（Downloads フォルダにダウンロードした場合）',
                  sub: 'ダウンロード先が異なる場合はパスを変更してください',
                  code: 'Unblock-File "$env:USERPROFILE\\Downloads\\install.bat"; & "$env:USERPROFILE\\Downloads\\install.bat"',
                },
                {
                  step: '3',
                  text: '開いた MT4/MT5 ウィンドウそれぞれで一回セットアップを行う',
                  sub: null,
                  subContent: (
                    <div className="space-y-2 mt-1">
                      <div>
                        <div className="text-slate-400 font-medium mb-0.5">MT4 の場合</div>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1 text-slate-500">
                          <li>ファイル → 新規チャート → 任意のチャートを選択</li>
                          <li>ナビゲーター → Experts から <span className="text-slate-300">MT4ReportExporter</span> をチャートにドラッグ → OK</li>
                          <li>ファイル → チャートの組表示 → 名前を付けて保存 → <span className="text-slate-300">MTExporter</span> → OK</li>
                          <li>ファイル → 終了</li>
                        </ol>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium mb-0.5">MT5 の場合</div>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1 text-slate-500">
                          <li>ファイル → 新規チャート → 任意のチャートを選択</li>
                          <li>ナビゲーター → Experts から <span className="text-slate-300">MT5ReportExporter</span> をチャートにドラッグ → OK</li>
                          <li>ファイル → チャートのプロファイル → 保存 → <span className="text-slate-300">MTExporter</span> → OK</li>
                          <li>ファイル → 終了</li>
                        </ol>
                      </div>
                    </div>
                  ),
                  code: null,
                },
                {
                  step: '4',
                  text: '以後はデスクトップの MT_Exporter.bat で MT4/MT5 を起動（EA が自動ロード）',
                  sub: '通常の MT4/MT5 ショートカットの代わりに使用してください',
                  code: null,
                },
                {
                  step: '5',
                  text: '下のボタンから sync-to-supabase.ps1 と run-sync.vbs を同じフォルダにダウンロード',
                  sub: 'run-sync.vbs はログイン情報が自動で埋め込まれます。パスワード入力ダイアログが表示されます',
                  code: null,
                },
                {
                  step: '6',
                  text: 'PowerShell で PS1 ファイルのブロックを解除する',
                  sub: 'ダウンロード先が異なる場合はパスを変更してください',
                  code: 'Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-supabase.ps1"',
                },
                {
                  step: '7',
                  text: 'PowerShell で タスクスケジューラに登録（1分ごとに自動アップロード）',
                  sub: 'ダウンロード先が異なる場合はパスを変更してください',
                  code: 'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"',
                },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold mt-0.5">{s.step}</span>
                  <div className="min-w-0">
                    <div className="text-slate-300">{s.text}</div>
                    {s.sub && <div className="text-slate-500 mt-0.5">{s.sub}</div>}
                    {s.subContent && <div className="mt-0.5">{s.subContent}</div>}
                    {s.code && (
                      <div className="mt-1.5 flex items-center gap-2 bg-[#0d1117] border border-[#1f2d40] rounded px-2.5 py-1.5 overflow-x-auto">
                        <code className="text-green-400 font-mono flex-1 select-all whitespace-nowrap text-[11px] sm:text-xs">{s.code}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(s.code)}
                          className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
                          title="コピー"
                        >⎘</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1f2d40]">
                <button onClick={() => downloadText(INSTALL_BAT, 'install.bat')}
                  className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                  ↓ install.bat
                </button>
                <button onClick={() => downloadText(MQ4_CONTENT, 'MT4ReportExporter.mq4')}
                  className="text-xs text-slate-500 hover:text-slate-300 bg-[#1a2235] border border-[#1f2d40] px-3 py-1.5 rounded-lg transition-colors">
                  ↓ MT4ReportExporter.mq4
                </button>
                <button onClick={() => downloadText(MQ5_CONTENT, 'MT5ReportExporter.mq5')}
                  className="text-xs text-slate-500 hover:text-slate-300 bg-[#1a2235] border border-[#1f2d40] px-3 py-1.5 rounded-lg transition-colors">
                  ↓ MT5ReportExporter.mq5
                </button>
                <button onClick={() => downloadText(SYNC_PS1_CONTENT, 'sync-to-supabase.ps1')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                  ↓ sync-to-supabase.ps1
                </button>
                <button onClick={() => { setVbsPass(''); setShowVbsModal(true) }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                  ↓ run-sync.vbs
                </button>
              </div>
            </div>

            <div className="w-full max-w-2xl">
              <div className="text-xs text-slate-600 text-center mb-3">または HTML / JSON レポートを手動でアップロード</div>
              <UploadZone onFiles={handleFiles} />
            </div>
          </div>
        ) : (
          <>
            {/* ツールバー */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                {lastUpdated && (
                  <span>最終更新: {fmtTime(lastUpdated)} <span className="text-slate-700">JST</span></span>
                )}
                {secondsLeft != null && (
                  <span className="text-slate-700">次回 {fmtCountdown(secondsLeft)}</span>
                )}
              </div>
              <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                <input type="file" accept=".htm,.html,.json" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
                + ファイルを追加
              </label>
            </div>

            {/* 期間フィルタ（カレンダータブでは非表示） */}
            {tab !== 'calendar' && (
              <DateRangeFilter
                from={dateRange.from} to={dateRange.to} onChange={setDateRange}
                dataMin={dataMin} dataMax={dataMax}
                totalCount={allTrades.length} filteredCount={filteredTrades.length}
              />
            )}

            {tab === 'calendar' ? (
              <TradeCalendar trades={allTrades} aliases={aliases} />
            ) : filteredTrades.length === 0 ? (
              <div className="bg-[#111827] border border-[#1f2d40] rounded-xl p-8 text-center text-slate-500 text-sm">
                選択期間に取引がありません
                <button onClick={() => setDateRange({ from: '', to: '' })}
                  className="block mx-auto mt-2 text-xs text-blue-400 hover:text-blue-300">
                  絞り込みを解除
                </button>
              </div>
            ) : (
              <>
                {tab === 'overview' && agg && (
                  <div className="space-y-5">
                    <InsightPanel trades={filteredTrades} stats={agg} plan={plan} onUpgrade={handleUpgrade} />
                    {isFiltered && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded font-medium">
                          {dateRange.from || dataMin} 〜 {dateRange.to || dataMax}
                        </span>
                        <span>の集計</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(() => {
                        const totalBalance = accounts.reduce((s, a) => s + (a.account.balance || 0), 0)
                        const totalEquity  = accounts.reduce((s, a) => s + (a.account.equity  || 0), 0)
                        const totalCredit  = accounts.reduce((s, a) => s + (a.account.credit  || 0), 0)
                        const totalFloat   = totalEquity - totalBalance - totalCredit
                        const currency = accounts[0]?.account.currency || ''
                        return (<>
                          <StatCard label="残高合計"    value={totalBalance.toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + currency} color="white" size="lg" />
                          <StatCard label="有効証拠金合計" value={totalEquity.toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + currency} color={totalEquity >= totalBalance ? 'profit' : 'warn'} size="lg" />
                          <StatCard label="含み損益合計" value={(totalFloat >= 0 ? '+' : '') + totalFloat.toFixed(2) + ' ' + currency} color={totalFloat >= 0 ? 'profit' : 'loss'} size="lg" />
                        </>)
                      })()}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:grid-cols-7">
                      <StatCard label="純益合計"
                        value={(agg.totalProfit >= 0 ? '+' : '-') + fmt(agg.totalProfit)}
                        color={agg.totalProfit >= 0 ? 'profit' : 'loss'} size="lg" />
                      <StatCard label="総取引数" value={agg.totalTrades.toLocaleString()} color="white" />
                      <StatCard label="勝率" value={agg.winRate.toFixed(1) + '%'}
                        color={agg.winRate >= 50 ? 'profit' : 'warn'} />
                      <StatCard label="プロフィットファクター"
                        value={isFinite(agg.profitFactor) ? agg.profitFactor.toFixed(2) : '∞'}
                        color={agg.profitFactor >= 1.5 ? 'profit' : agg.profitFactor >= 1 ? 'warn' : 'loss'} />
                      <StatCard label="総利益" value={'+' + fmt(agg.grossProfit)} color="profit" />
                      <StatCard label="総損失" value={'-' + fmt(agg.grossLoss)} color="loss" />
                      <StatCard label="最大DD" value={fmt(agg.maxDrawdown)} color="warn" />
                    </div>
                    <EquityChart data={equityCurve} title="全口座合算 エクイティカーブ" />
                    <OpenPositions positions={allPositions} aliases={aliases} />
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-slate-400">口座別成績</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          {[
                            { key: 'profit',      label: '純益'   },
                            { key: 'name',        label: '口座名' },
                            { key: 'trades',      label: '取引数' },
                            { key: 'pf',          label: 'PF'     },
                            { key: 'winRate',     label: '勝率'   },
                            { key: 'maxDrawdown', label: '最大DD' },
                          ].map(({ key, label }) => {
                            const active = accSort.key === key
                            return (
                              <button key={key} onClick={() => onAccSort(key)}
                                className={`px-2 py-0.5 rounded transition-colors inline-flex items-center gap-0.5 border
                                  ${active ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'border-transparent hover:text-slate-300'}`}>
                                {label}
                                {active && <span className="text-[10px]">{accSort.dir === 'desc' ? '▼' : '▲'}</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {sortedFilteredAccStats.map((acc) => (
                          <AccountCard key={acc.account.name} account={acc} onRemove={() => removeAccount(acc.account.name)} aliases={aliases} setAlias={setAlias} sortKey={accSort.key} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {tab === 'ea'     && <AccountBreakdown accounts={sortedFilteredAccStats} filteredTrades={filteredTrades} aliases={aliases} setAlias={setAlias} sortKey={accSort.key} sortDir={accSort.dir} onSort={onAccSort} />}
                {tab === 'trades' && <TradeTable trades={filteredTrades} showSearch aliases={aliases} />}
              </>
            )}
          </>
        )}
      </main>

      {/* フッター */}
      <footer className="text-center py-4 text-xs text-slate-700 space-x-4">
        <button onClick={() => setShowManual(true)} className="hover:text-slate-400 underline">
          操作マニュアル
        </button>
        <button onClick={() => setShowTerms(true)} className="hover:text-slate-400 underline">
          利用規約
        </button>
        <button onClick={() => setShowPrivacy(true)} className="hover:text-slate-400 underline">
          プライバシーポリシー
        </button>
        <button onClick={() => setShowFeedback(true)} className="hover:text-slate-400 underline">
          お問い合わせ
        </button>
      </footer>

      {showManual   && <ManualModal     onClose={() => setShowManual(false)} />}
      {showTerms    && <TermsModal      onClose={() => setShowTerms(false)} />}
      {showPrivacy  && <PrivacyPolicy   onClose={() => setShowPrivacy(false)} />}
      {showFeedback && <FeedbackModal   onClose={() => setShowFeedback(false)} />}

      {showVbsModal && (
        <div className="fixed inset-0 bg-[#0a0e17]/90 backdrop-blur flex items-center justify-center z-50 p-4"
          onClick={() => setShowVbsModal(false)}>
          <div className="bg-[#111827] border border-[#1f2d40] rounded-2xl w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-200">run-sync.vbs を生成</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                パスワードを入力すると接続情報が埋め込まれた VBS ファイルをダウンロードします。<br />
                sync-to-supabase.ps1 と同じフォルダに置いてください。
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">メールアドレス</div>
              <div className="text-xs text-slate-400 bg-[#0a0e17] border border-[#1f2d40] rounded px-3 py-2">{user?.email}</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">パスワード</label>
              <input
                type="password"
                value={vbsPass}
                onChange={e => setVbsPass(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && vbsPass) {
                    downloadText(generateRunSyncVbs(SUPABASE_URL, SUPABASE_ANON_KEY, user.email, vbsPass), 'run-sync.vbs')
                    setShowVbsModal(false)
                  }
                }}
                className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50"
                placeholder="ログインパスワード"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowVbsModal(false)}
                className="flex-1 bg-[#1a2235] border border-[#1f2d40] text-slate-400 hover:text-slate-200 text-xs px-4 py-2.5 rounded-lg transition-colors">
                キャンセル
              </button>
              <button
                disabled={!vbsPass}
                onClick={() => {
                  downloadText(generateRunSyncVbs(SUPABASE_URL, SUPABASE_ANON_KEY, user.email, vbsPass), 'run-sync.vbs')
                  setShowVbsModal(false)
                }}
                className="flex-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-4 py-2.5 rounded-lg transition-colors">
                ↓ ダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccount && (
        <DeleteAccountModal
          loading={deletingAccount}
          onClose={() => setShowDeleteAccount(false)}
          onConfirm={async () => {
            setDeletingAccount(true)
            try {
              await deleteAccount()
              setUser(null)
              setAccounts([])
              setShowDeleteAccount(false)
            } catch (e) {
              alert('削除に失敗しました: ' + e.message)
            } finally {
              setDeletingAccount(false)
            }
          }}
        />
      )}

      <Analytics />
      <SpeedInsights />
    </div>
  )
}
