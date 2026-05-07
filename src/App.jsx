import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import {
  parseHTMLReport, parseMT4Json, calcStatsFromTrades, buildEquityCurve
} from './lib/mt4Parser'
import {
  saveHandle, loadHandle, collectReportFiles,
  FOLDER_KEY, supportsFileSystemAccess
} from './lib/folderStore'
import { INSTALL_BAT } from './lib/downloadFiles'

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
  supabase, signOut, getSession, fetchReports, deleteAccount, deleteReport,
  fetchAliases, saveAliases, fetchPlan, updatePassword, subscribeToReports,
  fetchTradingStates, setTradingEnabled, subscribeToTradingStates,
  savePushSubscription, deletePushSubscription, fetchAlertSettings, saveAlertSetting, deleteAlertSetting,
} from './lib/supabaseClient'
import { registerServiceWorker, requestAndSubscribe, unsubscribeFromPush, getNotificationPermission } from './lib/pushNotifications'
import PrivacyPolicy from './components/PrivacyPolicy'
import DeleteAccountModal from './components/DeleteAccountModal'
import FeedbackModal from './components/FeedbackModal'
import ManualModal from './components/ManualModal'
import HelpModal from './components/HelpModal'
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
import PasswordResetScreen from './components/PasswordResetScreen'
import LanguageSwitcher from './components/LanguageSwitcher'
import SetupStep, { CodeCopyBlock } from './components/SetupStep'
import { formatMoney, formatMoneyWithCurrency, formatSignedMoney, formatCount, formatPercent, formatTime, normalizeCurrency } from './i18n/format'

const TAB_IDS = ['overview', 'insight', 'ea', 'trades', 'calendar']

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


function toDay(str) { return str?.slice(0, 10) || '' }
function fmtCountdown(s) {
  if (s == null) return ''
  const n = Math.max(0, s)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

export default function App() {
  const { t, i18n } = useTranslation()
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

  const [showLp,           setShowLp]           = useState(true)
  const [lpMode,           setLpMode]           = useState('login')
  const [showPasswordReset, setShowPasswordReset] = useState(false)
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
  const [showHelp,          setShowHelp]          = useState(false)
  const [tradingStates,         setTradingStates]         = useState(null)
  const [showTerms,             setShowTerms]             = useState(false)
  const [alertSettings,         setAlertSettings]         = useState({})
  const [swRegistration,        setSwRegistration]        = useState(null)
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission())

  const [showUserMenu,      setShowUserMenu]      = useState(false)
  const userMenuRef = useRef(null)
  const [plan, setPlan] = useState('free')

  const hasData = accounts.length > 0
  const [manualCleared, setManualCleared] = useState(false)

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
      if (results.length > 0) {
        setNextExportAt(Date.now() + SUPABASE_INTERVAL_MS)
        setManualCleared(false)
      }
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
    if (results.length > 0) setManualCleared(false)
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
      alert(t('app.errors.fileSystemAccessRequired'))
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true)
      } else {
        setUser(session?.user ?? null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Lemon Squeezy 決済完了後のプラン反映（?upgraded=true） ──
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('upgraded')) return

    // URL から ?upgraded=true を除去
    window.history.replaceState({}, '', window.location.pathname)

    // Webhook の処理が完了するまで最大 10 秒リトライ
    let tries = 0
    const poll = async () => {
      tries++
      const p = await fetchPlan().catch(() => 'free')
      if (p === 'pro') {
        setPlan('pro')
        return
      }
      if (tries < 10) setTimeout(poll, 1000)
    }
    poll()
  }, [user])

  // ── 起動時: ログイン済みなら自動読み込み ─────────────
  useEffect(() => {
    if (!user || autoLoadDoneRef.current) return
    autoLoadDoneRef.current = true

    // プランを取得
    fetchPlan().then(setPlan).catch(console.error)

    // 自動取引状態を取得
    fetchTradingStates().then(setTradingStates).catch(console.error)

    // アラート設定を取得
    fetchAlertSettings().then(setAlertSettings).catch(console.error)

    // Service Worker を登録（HTTPS 環境のみ有効）
    registerServiceWorker().then(reg => {
      setSwRegistration(reg)
      setNotificationPermission(getNotificationPermission())
    })

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


  // ── ユーザーメニューの外側クリックで閉じる ───────────
  useEffect(() => {
    if (!showUserMenu) return
    const close = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target))
        setShowUserMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showUserMenu])

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

  // ── Lemon Squeezy サブスクリプション管理ポータル ──────
  const handleManagePlan = useCallback(async () => {
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, returnUrl: window.location.href }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      window.location.href = json.url
    } catch (e) {
      console.error('[LemonSqueezy] portal error:', e)
      alert(t('app.errors.generic', { message: e.message }))
    }
  }, [user, t])

  // ── Lemon Squeezy アップグレード ─────────────────────
  const handleUpgrade = useCallback(async () => {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, email: user?.email, returnUrl: window.location.href }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (!json.url) throw new Error(t('app.errors.lemonNoUrl'))
      window.location.href = json.url
    } catch (e) {
      console.error('[LemonSqueezy] upgrade error:', e)
      alert(t('app.errors.upgradeFailed', { message: e.message }))
    }
  }, [user, t])

  // ── プッシュ通知の許可リクエスト & 購読 ────────────────
  const handleRequestNotification = useCallback(async () => {
    const sub = await requestAndSubscribe(swRegistration)
    if (sub) {
      await savePushSubscription(sub).catch(console.error)
      setNotificationPermission(getNotificationPermission())
    } else {
      setNotificationPermission(getNotificationPermission())
    }
  }, [swRegistration])

  // ── アラート閾値の保存・削除 ──────────────────────────
  const handleAlertThresholdChange = useCallback(async (accountNumber, threshold) => {
    if (threshold === null) {
      await deleteAlertSetting(accountNumber)
      setAlertSettings(prev => { const next = { ...prev }; delete next[String(accountNumber)]; return next })
    } else {
      await saveAlertSetting(accountNumber, threshold)
      setAlertSettings(prev => ({ ...prev, [String(accountNumber)]: threshold }))
    }
  }, [])

  // ── Supabase Realtime 購読（reports テーブル変更を即時検知） ──
  useEffect(() => {
    if (!user) return
    const channel = subscribeToReports(() => syncFromSupabase())
    return () => { supabase.removeChannel(channel) }
  }, [user, syncFromSupabase])

  // ── ea_controls リアルタイム購読（MT手動変更をWebに反映） ──
  useEffect(() => {
    if (!user) return
    const channel = subscribeToTradingStates((payload) => {
      const { eventType, new: row, old: oldRow } = payload
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && row) {
        setTradingStates(prev => ({ ...(prev ?? {}), [String(row.account_number)]: row.enabled }))
      } else if (eventType === 'DELETE' && oldRow) {
        setTradingStates(prev => {
          if (!prev) return prev
          const next = { ...prev }
          delete next[String(oldRow.account_number)]
          return next
        })
      }
    })
    return () => { supabase.removeChannel(channel) }
  }, [user])

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

  const removeAccount = useCallback(async (name) => {
    const target = accounts.find(a => a.account.name === name)
    setAccounts(prev => prev.filter(a => a.account.name !== name))
    if (target?.account.number) {
      await deleteReport(target.account.number).catch(console.error)
    }
  }, [accounts])
  const clearAll = () => {
    setAccounts([])
    setManualCleared(true)
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
  const allCharts = useMemo(() => {
    const merged = {}
    for (const a of accounts) {
      for (const [sym, data] of Object.entries(a.charts || {})) {
        if (!merged[sym]) merged[sym] = data
      }
    }
    return merged
  }, [accounts])
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

  const perAccountData = useMemo(
    () => filteredAccStats.map(acc => ({
      account: acc.account,
      trades: filteredTrades.filter(t => t.account === acc.account.name),
      stats: acc.stats,
    })),
    [filteredAccStats, filteredTrades]
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
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-slate-500 text-sm">{t('common.loading')}</div>
      </div>
    )
  }

  if (showPasswordReset) {
    return <PasswordResetScreen onDone={() => setShowPasswordReset(false)} />
  }

  if (!user) {
    return showLp
      ? <LandingPage
          onStart={() => { setLpMode('signup'); setShowLp(false) }}
          onLogin={() => { setLpMode('login');  setShowLp(false) }}
        />
      : <LoginScreen onLogin={setUser} initialMode={lpMode} />
  }

  return (
    <div className="min-h-screen bg-bg text-slate-200">

      {/* ヘッダ */}
      <header className="border-b border-border bg-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-12 sm:h-14 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm shrink-0">
                📈
              </div>
              <span className="font-semibold text-slate-100 text-sm tracking-tight truncate">{t('app.title')}</span>
              {hasData && <span className="text-xs text-slate-600 ml-1 hidden lg:inline shrink-0">{t('units.accounts', { count: accounts.length })}</span>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasData && (
                <nav className="hidden lg:flex gap-0.5 bg-surface border border-border rounded-lg p-1">
                  {TAB_IDS.map(id => (
                    <button key={id} onClick={() => setTab(id)}
                      className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all whitespace-nowrap
                        ${tab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                      {t(`app.tabs.${id}`)}
                    </button>
                  ))}
                </nav>
              )}
              <LanguageSwitcher compact />
              {user && (
                <>
                  <button
                    onClick={requestRefresh}
                    disabled={refreshing}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                    {refreshing ? t('app.header.refreshShort') : t('app.header.refresh')}
                  </button>
                  {/* アカウントメニュー */}
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setShowUserMenu(v => !v)}
                      aria-haspopup="menu"
                      aria-expanded={showUserMenu}
                      aria-label={user.email}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border hover:border-slate-600 transition-colors">
                      <span className="text-xs text-slate-400 max-w-[100px] truncate hidden lg:inline">{user.email}</span>
                      {plan === 'pro'
                        ? <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold">{t('app.header.userMenu.planPro')}</span>
                        : <span className="text-[10px] bg-slate-700/50 text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded font-semibold">{t('app.header.userMenu.planFree')}</span>
                      }
                      <span aria-hidden="true" className="text-slate-600 text-[10px]">▾</span>
                    </button>
                    {showUserMenu && (
                      <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-xl shadow-2xl py-1 z-50">
                        <div className="px-4 py-2.5 border-b border-border">
                          <div className="text-xs text-slate-400 truncate">{user.email}</div>
                          {plan === 'pro'
                            ? <div className="text-[10px] text-blue-400 mt-0.5">{t('app.header.userMenu.planProLabel')}</div>
                            : <div className="text-[10px] text-slate-600 mt-0.5">{t('app.header.userMenu.planFreeLabel')}</div>
                          }
                        </div>
                        {plan === 'pro' && (
                          <button
                            onClick={() => { handleManagePlan(); setShowUserMenu(false) }}
                            className="w-full text-left px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-surface2 transition-colors">
                            {t('app.header.userMenu.manageSubscription')}
                          </button>
                        )}
                        <button
                          onClick={async () => { setShowUserMenu(false); await signOut(); setAccounts([]); setUser(null) }}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-surface2 transition-colors">
                          {t('app.header.userMenu.logout')}
                        </button>
                        <div className="border-t border-border mt-1 pt-1">
                          <button
                            onClick={() => { setShowDeleteAccount(true); setShowUserMenu(false) }}
                            className="w-full text-left px-4 py-2.5 text-xs text-red-400/60 hover:text-red-400 hover:bg-surface2 transition-colors">
                            {t('app.header.userMenu.deleteAccount')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {hasData && (
            <nav className="lg:hidden flex gap-1.5 pb-2 overflow-x-auto tab-scroll-bar" aria-label={t('app.tabs.label', { defaultValue: 'Sections' })}>
              {TAB_IDS.map(id => (
                <button key={id} onClick={() => setTab(id)}
                  className={`shrink-0 px-3 py-1.5 text-xs rounded-md font-medium transition-all whitespace-nowrap
                    ${tab === id ? 'bg-blue-600 text-white shadow' : 'bg-surface border border-border text-slate-500 hover:text-slate-300'}`}>
                  {t(`app.tabs.${id}`)}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4">

{!hasData ? (
          /* ── セットアップ画面（クリア後もここに集約） ── */
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 py-4">
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-100 mb-1.5">{t('app.setup.title')}</h1>
              <p className="text-slate-500 text-sm">{t('app.setup.subtitle')}</p>
            </div>

            {manualCleared && (
              <div className="w-full max-w-lg bg-surface border border-border rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{t('app.cleared.message')}</span>
                <button
                  type="button"
                  onClick={() => setManualCleared(false)}
                  className="text-slate-500 hover:text-slate-200 transition-colors"
                  aria-label={t('common.close', { defaultValue: 'Close' })}
                >
                  ✕
                </button>
              </div>
            )}

            {syncDone && (
              <div className="w-full max-w-lg bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-amber-400">
                <span className="flex-shrink-0 mt-0.5" aria-hidden="true">⚠</span>
                <div>
                  <div className="font-semibold">{t('app.syncWarn.title')}</div>
                  <div className="text-amber-500/80 mt-0.5">{t('app.syncWarn.body')}</div>
                </div>
              </div>
            )}

            <div className="w-full max-w-lg space-y-3">
              <SetupStep
                number={1}
                title={t('app.setup.step1.title')}
                description={t('app.setup.step1.description', { file: 'install.bat' })}
              >
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => downloadText(INSTALL_BAT, 'install.bat')}
                    className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ install.bat
                  </button>
                  <a href="/MT4ReportExporter.mq4" download="MT4ReportExporter.mq4"
                    className="text-xs text-slate-400 hover:text-slate-200 bg-surface2 border border-border px-3 py-1.5 rounded-lg transition-colors">
                    ↓ MT4ReportExporter.mq4
                  </a>
                  <a href="/MT5ReportExporter.mq5" download="MT5ReportExporter.mq5"
                    className="text-xs text-slate-400 hover:text-slate-200 bg-surface2 border border-border px-3 py-1.5 rounded-lg transition-colors">
                    ↓ MT5ReportExporter.mq5
                  </a>
                </div>
                <CodeCopyBlock code={'Unblock-File "$env:USERPROFILE\\Downloads\\install.bat"; & "$env:USERPROFILE\\Downloads\\install.bat"'} />
              </SetupStep>

              <SetupStep
                number={2}
                title={t('app.setup.step2.title')}
                description={t('app.setup.step2.description')}
              >
                <div className="flex flex-wrap gap-2">
                  <a href="/sync-to-supabase.ps1" download="sync-to-supabase.ps1"
                    className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ sync-to-supabase.ps1
                  </a>
                  <button onClick={() => { setVbsPass(''); setShowVbsModal(true) }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    ↓ run-sync.vbs
                  </button>
                </div>
                <CodeCopyBlock code={'Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-supabase.ps1"'} />
              </SetupStep>

              <SetupStep
                number={3}
                title={t('app.setup.step3.title')}
                description={t('app.setup.step3.description')}
              >
                <CodeCopyBlock code={'schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'} />
              </SetupStep>
            </div>

            <button onClick={() => setShowManual(true)}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors underline">
              {t('app.setup.manualLink')}
            </button>

            <div className="w-full max-w-lg">
              <div className="text-xs text-slate-600 text-center mb-2">{t('app.setup.orUploadManual')}</div>
              <UploadZone onFiles={handleFiles} />
            </div>
          </div>
        ) : (
          // hasData
          <>
            {/* ツールバー */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {lastUpdated && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 flex-shrink-0" />
                    {formatTime(lastUpdated, { lang: i18n.language })}
                  </span>
                )}
                <button onClick={clearAll} className="hidden lg:inline text-slate-600 hover:text-red-400 transition-colors">
                  {t('app.toolbar.clear')}
                </button>
              </div>
              <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                <input type="file" accept=".htm,.html,.json" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
                {t('app.toolbar.addFiles')}
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
              <div className="bg-surface border border-border rounded-xl p-8 text-center text-slate-500 text-sm">
                {t('app.noTradesInRange.message')}
                <button onClick={() => setDateRange({ from: '', to: '' })}
                  className="block mx-auto mt-2 text-xs text-blue-400 hover:text-blue-300">
                  {t('app.noTradesInRange.clearFilter')}
                </button>
              </div>
            ) : (
              <>
                {tab === 'insight' && (
                  <InsightPanel trades={filteredTrades} stats={agg} plan={plan} onUpgrade={handleUpgrade} perAccountData={perAccountData} aliases={aliases} />
                )}
                {tab === 'overview' && agg && (
                  <div className="space-y-5">
                    {isFiltered && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded font-medium">
                          {dateRange.from || dataMin} 〜 {dateRange.to || dataMax}
                        </span>
                        <span>{t('app.filteredRange.of')}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(() => {
                        const totalBalance = accounts.reduce((s, a) => s + (a.account.balance || 0), 0)
                        const totalEquity  = accounts.reduce((s, a) => s + (a.account.equity  || 0), 0)
                        const totalCredit  = accounts.reduce((s, a) => s + (a.account.credit  || 0), 0)
                        const totalFloat   = totalEquity - totalBalance - totalCredit
                        const currency = normalizeCurrency(accounts[0]?.account.currency)
                        return (<>
                          <StatCard label={t('app.stats.balanceTotal')}     value={formatMoneyWithCurrency(totalBalance, currency, { lang: i18n.language })} color="white" size="lg" />
                          <StatCard label={t('app.stats.creditTotal')}      value={formatMoneyWithCurrency(totalCredit,  currency, { lang: i18n.language })} color="white" size="lg" />
                          <StatCard label={t('app.stats.equityTotal')}      value={formatMoneyWithCurrency(totalEquity,  currency, { lang: i18n.language })} color={totalEquity >= totalBalance ? 'profit' : 'warn'} size="lg" />
                          <StatCard label={t('app.stats.floatPnlTotal')}    value={`${formatSignedMoney(totalFloat, { lang: i18n.language })}${currency ? ' ' + currency : ''}`} color={totalFloat >= 0 ? 'profit' : 'loss'} size="lg" />
                        </>)
                      })()}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                      <StatCard label={t('app.stats.netProfitTotal')}
                        value={formatSignedMoney(agg.totalProfit, { lang: i18n.language })}
                        color={agg.totalProfit >= 0 ? 'profit' : 'loss'} size="lg" />
                      <StatCard label={t('app.stats.totalTrades')} value={formatCount(agg.totalTrades, { lang: i18n.language })} color="white" />
                      <StatCard label={t('app.stats.winRate')} value={formatPercent(agg.winRate, { lang: i18n.language })}
                        color={agg.winRate >= 50 ? 'profit' : 'warn'} />
                      <StatCard label={t('app.stats.profitFactor')}
                        value={isFinite(agg.profitFactor) ? formatMoney(agg.profitFactor, { lang: i18n.language }) : '∞'}
                        color={agg.profitFactor >= 1.5 ? 'profit' : agg.profitFactor >= 1 ? 'warn' : 'loss'} />
                      <StatCard label={t('app.stats.grossProfit')} value={'+' + formatMoney(agg.grossProfit, { lang: i18n.language })} color="profit" />
                      <StatCard label={t('app.stats.grossLoss')}   value={'-' + formatMoney(agg.grossLoss,   { lang: i18n.language })} color="loss" />
                      <StatCard label={t('app.stats.maxDrawdown')} value={formatMoney(agg.maxDrawdown,        { lang: i18n.language })} color="warn" />
                    </div>
                    <EquityChart data={equityCurve} title={t('app.equityChart.allCombined')} />
                    <OpenPositions positions={allPositions} aliases={aliases} charts={allCharts} trades={filteredTrades} />
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-slate-400">{t('app.accountList.title')}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          {[
                            { key: 'profit',      label: t('app.accountList.sort.profit')      },
                            { key: 'name',        label: t('app.accountList.sort.name')        },
                            { key: 'trades',      label: t('app.accountList.sort.trades')      },
                            { key: 'pf',          label: t('app.accountList.sort.pf')          },
                            { key: 'winRate',     label: t('app.accountList.sort.winRate')     },
                            { key: 'maxDrawdown', label: t('app.accountList.sort.maxDrawdown') },
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
                          <AccountCard
                            key={acc.account.name}
                            account={acc}
                            onRemove={() => removeAccount(acc.account.name)}
                            aliases={aliases}
                            setAlias={setAlias}
                            sortKey={accSort.key}
                            tradingEnabled={
                              tradingStates !== null
                                ? (tradingStates[String(acc.account.number)] ?? acc.account.autoTrading ?? true)
                                : (acc.account.autoTrading ?? true)
                            }
                            onTradingToggle={tradingStates !== null && acc.account.number ? async (val) => {
                              setTradingStates(prev => ({ ...prev, [String(acc.account.number)]: val }))
                              await setTradingEnabled(acc.account.number, val).catch(console.error)
                            } : undefined}
                            isPro={plan === 'pro'}
                            onUpgrade={handleUpgrade}
                            alertThreshold={alertSettings[String(acc.account.number)] ?? null}
                            onAlertThresholdChange={(threshold) => handleAlertThresholdChange(acc.account.number, threshold)}
                            notificationPermission={notificationPermission}
                            onRequestNotification={handleRequestNotification}
                          />
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
      <footer className="py-6 text-xs text-slate-600 space-y-3">
        <div className="flex items-center justify-center gap-x-4 gap-y-2 flex-wrap">
          <button onClick={() => setShowManual(true)} className="hover:text-slate-300 transition-colors">{t('app.footer.manual')}</button>
          <button onClick={() => setShowHelp(true)} className="hover:text-slate-300 transition-colors">{t('app.footer.help')}</button>
          <button onClick={() => setShowFeedback(true)} className="hover:text-slate-300 transition-colors">{t('app.footer.contact')}</button>
          <span aria-hidden="true" className="text-slate-800">·</span>
          <button onClick={() => setShowTerms(true)} className="hover:text-slate-300 transition-colors">{t('app.footer.terms')}</button>
          <button onClick={() => setShowPrivacy(true)} className="hover:text-slate-300 transition-colors">{t('app.footer.privacy')}</button>
        </div>
        <div className="text-center text-slate-700">{t('app.footer.copyright', { year: new Date().getFullYear() })}</div>
      </footer>

      {showManual   && <ManualModal     onClose={() => setShowManual(false)} onDownloadVbs={() => { setShowManual(false); setVbsPass(''); setShowVbsModal(true) }} />}
      {showHelp     && <HelpModal       onClose={() => setShowHelp(false)} />}
      {showTerms    && <TermsModal      onClose={() => setShowTerms(false)} />}
      {showPrivacy  && <PrivacyPolicy   onClose={() => setShowPrivacy(false)} />}
      {showFeedback && <FeedbackModal   onClose={() => setShowFeedback(false)} />}

      {showVbsModal && (
        <div className="fixed inset-0 bg-bg/90 backdrop-blur flex items-center justify-center z-50 p-4"
          onClick={() => setShowVbsModal(false)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-200">{t('app.vbsModal.title')}</h2>
              <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{t('app.vbsModal.body')}</p>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">{t('app.vbsModal.email')}</div>
              <div className="text-xs text-slate-400 bg-bg border border-border rounded px-3 py-2">{user?.email}</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">{t('app.vbsModal.password')}</label>
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
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/50"
                placeholder={t('app.vbsModal.passwordPlaceholder')}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowVbsModal(false)}
                className="flex-1 bg-surface2 border border-border text-slate-400 hover:text-slate-200 text-xs px-4 py-2.5 rounded-lg transition-colors">
                {t('common.cancel')}
              </button>
              <button
                disabled={!vbsPass}
                onClick={() => {
                  downloadText(generateRunSyncVbs(SUPABASE_URL, SUPABASE_ANON_KEY, user.email, vbsPass), 'run-sync.vbs')
                  setShowVbsModal(false)
                }}
                className="flex-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-4 py-2.5 rounded-lg transition-colors">
                {t('common.downloadAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccount && (
        <DeleteAccountModal
          loading={deletingAccount}
          isPro={plan === 'pro'}
          onClose={() => setShowDeleteAccount(false)}
          onConfirm={async () => {
            setDeletingAccount(true)
            try {
              // Pro ユーザーは先に Lemon Squeezy サブスクリプションをキャンセル
              if (plan === 'pro' && user?.id) {
                const res = await fetch('/api/cancel-subscription', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id }),
                })
                if (!res.ok) {
                  const json = await res.json().catch(() => ({}))
                  throw new Error(json.error || t('app.errors.subscriptionCancelFailed'))
                }
              }
              await deleteAccount()
              await signOut()
              setUser(null)
              setAccounts([])
              setShowDeleteAccount(false)
            } catch (e) {
              alert(t('app.errors.deleteFailed', { message: e.message }))
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
