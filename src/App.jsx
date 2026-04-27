import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  parseHTMLReport, parseMT4Json, calcStatsFromTrades, buildEquityCurve
} from './lib/mt4Parser'
import {
  saveHandle, loadHandle, collectReportFiles,
  FOLDER_KEY, supportsFileSystemAccess
} from './lib/folderStore'
import { INSTALL_BAT, MQ4_CONTENT, MQ5_CONTENT } from './lib/downloadFiles'
import {
  loadGitHubSettings, saveGitHubSettings, clearGitHubSettings,
  fetchReportFilesFromGitHub, pushFilesToGitHub,
  writeTrigger, checkTrigger, deleteTrigger,
} from './lib/githubSync'
import UploadZone from './components/UploadZone'
import StatCard from './components/StatCard'
import AccountCard from './components/AccountCard'
import AccountBreakdown from './components/AccountBreakdown'
import EquityChart from './components/EquityChart'
import TradeTable from './components/TradeTable'
import DateRangeFilter from './components/DateRangeFilter'

const TABS = [
  { id: 'overview', label: 'サマリー' },
  { id: 'ea',       label: '口座別成績' },
  { id: 'trades',   label: '全取引'   },
]

const EXPORT_INTERVAL_MS = 5 * 60 * 1000 // EA の RefreshMinutes に合わせる
const GITHUB_INTERVAL_MS = 5 * 60 * 1000

const SYNC_PS1 = `# Sync JSON files from MTExport folder to a private GitHub repository
#
# Usage:
#   Unblock-File ".\\sync-to-github.ps1"
#   .\\sync-to-github.ps1 -Token "ghp_xxxx" -Owner "yourname" -Repo "mt4-report-data"
#
# Register with Task Scheduler (run every 5 minutes):
#   schtasks /create /tn "MTExportSync" /sc minute /mo 5 /f /tr "powershell -NonInteractive -File \\"%USERPROFILE%\\Downloads\\sync-to-github.ps1\\" -Token ghp_xxxx -Owner yourname -Repo mt4-report-data"

param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [string]$Folder = "$env:USERPROFILE\\MTExport"
)

$headers = @{
    Authorization = "token $Token"
    "User-Agent"  = "MTExporter-Sync/1.0"
    Accept        = "application/vnd.github.v3+json"
}

$files = Get-ChildItem -Path $Folder -Filter "*.json" -ErrorAction SilentlyContinue
if (-not $files) { Write-Host "No JSON files found: $Folder"; exit 0 }

foreach ($file in $files) {
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    $sha = $null
    try {
        $existing = Invoke-RestMethod "https://api.github.com/repos/$Owner/$Repo/contents/$($file.Name)" -Headers $headers -ErrorAction Stop
        $sha = $existing.sha
    } catch {}
    $body = @{ message = "sync: $($file.Name)"; content = $b64 }
    if ($sha) { $body.sha = $sha }
    try {
        Invoke-RestMethod "https://api.github.com/repos/$Owner/$Repo/contents/$($file.Name)" -Method Put -Headers $headers -Body ($body | ConvertTo-Json -Depth 3) -ContentType "application/json" | Out-Null
        Write-Host "[OK] $($file.Name)"
    } catch { Write-Warning "[NG] $($file.Name): $($_.Exception.Message)" }
}
Write-Host "Sync complete"
`

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

function makeRunSyncVbs(owner, repo, token) {
  return [
    'Dim ps1',
    'ps1 = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERPROFILE%\\Downloads\\sync-to-github.ps1")',
    `CreateObject("WScript.Shell").Run "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """ -Token ${token} -Owner ${owner} -Repo ${repo}", 0, False`,
  ].join('\r\n') + '\r\n'
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
  const [loading,    setLoading]    = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('レポートを解析中…')
  const [dateRange,  setDateRange]  = useState({ from: '', to: '' })
  const [aliases,    setAliasesState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mt4_aliases') || '{}') } catch { return {} }
  })
  const setAlias = useCallback((originalName, displayName) => {
    setAliasesState(prev => {
      const next = { ...prev }
      if (displayName && displayName !== originalName) {
        next[originalName] = displayName
      } else {
        delete next[originalName]
      }
      localStorage.setItem('mt4_aliases', JSON.stringify(next))
      return next
    })
  }, [])

  const [githubSettings,   setGitHubSettings]   = useState(() => loadGitHubSettings())
  const [showGitHubModal,  setShowGitHubModal]  = useState(false)
  const [ghOwner,          setGhOwner]          = useState('')
  const [ghRepo,           setGhRepo]           = useState('')
  const [ghToken,          setGhToken]          = useState('')
  const [ghRequesting,     setGhRequesting]     = useState(false)

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
  const autoLoadDoneRef     = useRef(false)
  const lastModifiedRef     = useRef(new Map())
  const reloadFolderRef     = useRef(null)
  const githubSettingsRef   = useRef(githubSettings)
  const dirHandleRef        = useRef(null)

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

  // ── GitHub から同期 ───────────────────────────────────
  const syncFromGitHub = useCallback(async (settings) => {
    const s = settings ?? githubSettings
    if (!s) return
    setLoading(true)
    setLoadingMsg('GitHub から取得中…')
    try {
      const files   = await fetchReportFilesFromGitHub(s)
      const results = await parseFiles(files)
      setAccounts(prev => {
        const byName = new Map(prev.map(a => [a.account.name, a]))
        results.forEach(r => byName.set(r.account.name, r))
        return [...byName.values()]
      })
      setLastUpdated(new Date())
      if (!dirHandleRef.current) setNextExportAt(Date.now() + GITHUB_INTERVAL_MS)
    } catch (e) {
      console.error('GitHub sync error:', e)
      throw e
    } finally {
      setLoading(false)
    }
  }, [githubSettings, parseFiles])

  // ── フォルダから読み込み ──────────────────────────────
  const loadFromDir = useCallback(async (handle) => {
    setLoading(true)
    setLoadingMsg(`${handle.name} を読み込み中…`)
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

      // GitHub 設定済みなら JSON ファイルを自動プッシュ
      const gs = githubSettingsRef.current
      if (gs) {
        const jsonFiles = files.filter(f => /\.json$/i.test(f.name))
        if (jsonFiles.length > 0) {
          setLoadingMsg('GitHub へ同期中…')
          try { await pushFilesToGitHub(gs, jsonFiles) }
          catch (e) { console.error('GitHub push error:', e) }
        }
      }
    } catch (e) {
      console.error('Folder read error:', e)
    }
    setLastUpdated(new Date())
    setLoading(false)
  }, [parseFiles])

  // ── 手動アップロード ──────────────────────────────────
  const handleFiles = async (files) => {
    setLoading(true)
    setLoadingMsg('レポートを解析中…')
    const results = await parseFiles(files)
    setAccounts(prev => {
      const byName = new Map(prev.map(a => [a.account.name, a]))
      results.forEach(r => byName.set(r.account.name, r))
      return [...byName.values()]
    })
    setLastUpdated(new Date())
    setLoading(false)
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

            setLoadingMsg('EA にエクスポートをリクエスト中…')
            setLoading(true)
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

// ── 起動時: 登録済みフォルダ or GitHub から自動読み込み ──
  useEffect(() => {
    if (autoLoadDoneRef.current) return
    autoLoadDoneRef.current = true
    ;(async () => {
      try {
        const handle = await loadHandle(FOLDER_KEY)
        if (handle) {
          const perm = await handle.queryPermission({ mode: 'read' })
          setDirHandle(handle)
          if (perm === 'granted') {
            await loadFromDir(handle)
            return
          }
        }
        // ローカルフォルダなし or 権限なし → GitHub から取得
        const gs = loadGitHubSettings()
        if (gs) await syncFromGitHub(gs)
      } catch (e) { console.error('Auto-load error:', e) }
    })()
  }, [loadFromDir, syncFromGitHub])

  // ── 各 ref を常に最新に保つ ──────────────────────────
  useEffect(() => { reloadFolderRef.current = reloadFolder }, [reloadFolder])
  useEffect(() => { githubSettingsRef.current = githubSettings }, [githubSettings])
  useEffect(() => { dirHandleRef.current = dirHandle }, [dirHandle])

  // ── スマホ → PC への更新リクエスト ────────────────────
  const requestGitHubRefresh = useCallback(async () => {
    if (!githubSettings || ghRequesting) return
    setGhRequesting(true)
    setLoadingMsg('PC に更新をリクエスト中…')
    setLoading(true)
    try {
      await writeTrigger(githubSettings)
      // PC がトリガーを処理するまで最大40秒ポーリング
      const deadline = Date.now() + 40000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000))
        const t = await checkTrigger(githubSettings)
        if (!t) break  // PC がトリガーを削除した = 処理完了
      }
      await syncFromGitHub(githubSettings)
    } catch (e) {
      console.error('Request refresh error:', e)
      try { await syncFromGitHub(githubSettings) } catch {}
    } finally {
      setGhRequesting(false)
      setLoading(false)
    }
  }, [githubSettings, ghRequesting, syncFromGitHub])

  // ── PC: GitHub トリガー監視（30秒ごと） ──────────────
  useEffect(() => {
    if (!dirHandle || !githubSettings) return
    const poll = async () => {
      try {
        const t = await checkTrigger(githubSettings)
        if (!t) return
        await deleteTrigger(githubSettings, t.sha)
        reloadFolderRef.current?.(true)
      } catch {}
    }
    const id = setInterval(poll, 30 * 1000)
    return () => clearInterval(id)
  }, [dirHandle, githubSettings])

  // ── GitHub 自動更新（5分ごと） ───────────────────────
  useEffect(() => {
    if (!githubSettings) return
    const id = setInterval(() => syncFromGitHub(), GITHUB_INTERVAL_MS)
    return () => clearInterval(id)
  }, [githubSettings, syncFromGitHub])

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
        reloadFolderRef.current?.(false)
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

  const hasData    = accounts.length > 0
  const isFiltered = !!(dateRange.from || dateRange.to)

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
            <div className="flex items-center gap-2">
              {secondsLeft != null && (
                <span className="text-xs text-slate-600 tabular-nums">
                  次回 {fmtCountdown(secondsLeft)}
                </span>
              )}
              {dirHandle && (
                <button onClick={() => reloadFolder(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                  ↻ 更新
                </button>
              )}
              {githubSettings ? (
                <div className="flex items-center gap-1">
                  {!dirHandle && (
                    <button
                      onClick={requestGitHubRefresh}
                      disabled={ghRequesting}
                      className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50 transition-colors bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-lg">
                      {ghRequesting ? '…' : '↻ 更新'}
                    </button>
                  )}
                  <button onClick={() => { setGhOwner(githubSettings.owner); setGhRepo(githubSettings.repo); setGhToken(githubSettings.token); setShowGitHubModal(true) }}
                    className="text-slate-600 hover:text-purple-400 transition-colors px-1 py-1.5 text-sm" title="GitHub 設定">
                    ⚙
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowGitHubModal(true)}
                  className="text-xs text-slate-500 hover:text-purple-400 transition-colors border border-[#1f2d40] hover:border-purple-500/30 px-3 py-1.5 rounded-lg">
                  <span className="hidden sm:inline">GitHub 同期</span>
                  <span className="sm:hidden">GH 設定</span>
                </button>
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
                  <button onClick={clearAll} className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1">
                    クリア
                  </button>
                </>
              )}
            </div>
          </div>
          {hasData && (
            <div className="sm:hidden flex gap-1 pb-2">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all
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

            <div className="w-full max-w-2xl bg-[#111827] border border-[#1f2d40] rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide">セットアップ（初回のみ）</div>
              {[
                {
                  step: '1',
                  text: '下のボタンから install.bat・MT4ReportExporter.mq4・MT5ReportExporter.mq5 を同じフォルダにダウンロード',
                  sub: null,
                  code: null,
                },
                {
                  step: '2',
                  text: 'PowerShell で下のコマンドを実行（Downloads フォルダにダウンロードした場合）',
                  sub: 'ダウンロード先が異なる場合はパスを変更してください',
                  code: 'Unblock-File "$env:USERPROFILE\\Downloads\\install.bat"; & "$env:USERPROFILE\\Downloads\\install.bat"',
                },
                {
                  step: '3',
                  text: '開いた MT4/MT5 ウィンドウそれぞれで初回セットアップを行う',
                  sub: '① ReportExporter EA をチャートにドラッグ → OK　② ファイル → プロファイル → 名前を付けて保存 → MTExporter → OK　③ ターミナルを閉じる',
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
                  text: supportsFileSystemAccess() && !dirHandle
                    ? '下の「MTExport フォルダを選択」をクリック（初回のみ）'
                    : 'MT4/MT5 起動後に右上の「↻ 更新」を押すとデータが表示されます',
                  sub: supportsFileSystemAccess() && !dirHandle
                    ? '%USERPROFILE%\\MTExport を選択 → 以後は 5 分ごとに自動更新されます'
                    : '5 分ごとに自動更新されます。手動更新は右上の「↻ 更新」から',
                  code: null,
                },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center flex-shrink-0 font-bold mt-0.5">{s.step}</span>
                  <div className="min-w-0">
                    <div className="text-slate-300">{s.text}</div>
                    {s.sub && <div className="text-slate-500 mt-0.5">{s.sub}</div>}
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
                {supportsFileSystemAccess() && (
                  <button onClick={registerFolder}
                    className="sm:ml-auto text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-lg transition-colors">
                    📁 {dirHandle ? 'MTExport フォルダを変更' : 'MTExport フォルダを選択'}
                  </button>
                )}
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
            <div className="flex items-center justify-end gap-2">
              <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                <input type="file" accept=".htm,.html,.json" multiple className="hidden"
                  onChange={e => handleFiles(e.target.files)} />
                + ファイルを追加
              </label>
            </div>

            {/* 期間フィルタ */}
            <DateRangeFilter
              from={dateRange.from} to={dateRange.to} onChange={setDateRange}
              dataMin={dataMin} dataMax={dataMax}
              totalCount={allTrades.length} filteredCount={filteredTrades.length}
            />

            {filteredTrades.length === 0 ? (
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
                    {isFiltered && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded font-medium">
                          {dateRange.from || dataMin} 〜 {dateRange.to || dataMax}
                        </span>
                        <span>の集計</span>
                      </div>
                    )}
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
                          <AccountCard key={acc.account.name} account={acc} onRemove={() => removeAccount(acc.account.name)} aliases={aliases} setAlias={setAlias} />
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

      {loading && (
        <div className="fixed inset-0 bg-[#0a0e17]/80 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-[#111827] border border-[#1f2d40] rounded-2xl px-8 py-6 text-slate-300 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{loadingMsg}</span>
          </div>
        </div>
      )}

      {/* GitHub 同期設定モーダル */}
      {showGitHubModal && (
        <div
          className="fixed inset-0 bg-[#0a0e17]/80 backdrop-blur flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setShowGitHubModal(false)}
        >
          <div
            className="bg-[#111827] border border-[#1f2d40] rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh] sm:max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* ドラッグハンドル（モバイルのみ） */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-[#1f2d40] rounded-full" />
            </div>

            {/* ヘッダ */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f2d40] flex-shrink-0">
              <div>
                <div className="text-sm font-semibold text-slate-100">GitHub 同期設定</div>
                <div className="text-xs text-slate-500 mt-0.5">PC の MTExport フォルダをスマホで自動更新</div>
              </div>
              <button onClick={() => setShowGitHubModal(false)} className="text-slate-400 hover:text-slate-100 text-xl px-2 py-1 flex-shrink-0">✕</button>
            </div>

            {/* スクロール可能な本文 */}
            <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs">

              {/* 接続済みバナー */}
              {githubSettings && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 flex items-center gap-2 text-purple-300">
                  <span>✓</span>
                  <span className="font-mono">{githubSettings.owner}/{githubSettings.repo}</span>
                  <span className="text-purple-400">接続済み・5分ごと自動更新</span>
                </div>
              )}

              {/* STEP 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                  <span className="font-semibold text-slate-200">GitHub プライベートリポジトリを作成</span>
                </div>
                <div className="ml-7 space-y-2 text-slate-400">
                  <p>取引データを保存する専用リポジトリを作成します。</p>
                  <a href="https://github.com/new" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 underline">
                    github.com/new を開く ↗
                  </a>
                  <div className="bg-[#0a0e17] rounded-lg p-3 space-y-1.5 border border-[#1f2d40]">
                    <div><span className="text-slate-500">Repository name: </span><span className="text-purple-300 font-mono">mt4-report-data</span><span className="text-slate-600">（任意）</span></div>
                    <div><span className="text-slate-500">Visibility: </span><span className="text-slate-300 font-semibold">Private</span><span className="text-slate-600"> ← 必ずプライベートを選択</span></div>
                    <div className="text-slate-600">README の追加は不要。そのまま「Create repository」をクリック</div>
                  </div>
                </div>
              </div>

              {/* STEP 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                  <span className="font-semibold text-slate-200">Personal Access Token を発行</span>
                </div>
                <div className="ml-7 space-y-2 text-slate-400">
                  <p>アプリが GitHub にアクセスするための鍵（トークン）を発行します。</p>
                  <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 underline">
                    トークン発行ページを開く ↗
                  </a>
                  <div className="bg-[#0a0e17] rounded-lg p-3 space-y-1.5 border border-[#1f2d40]">
                    <div><span className="text-slate-500">Note: </span><span className="text-slate-300">MT4 Report Viewer</span><span className="text-slate-600">（任意の名前）</span></div>
                    <div><span className="text-slate-500">Expiration: </span><span className="text-slate-300">No expiration</span><span className="text-slate-600">（推奨）</span></div>
                    <div><span className="text-slate-500">Scopes: </span><span className="text-purple-300 font-mono font-bold">repo</span><span className="text-slate-600"> にチェック ✅（1箇所のみ）</span></div>
                  </div>
                  <p>ページ下部「Generate token」→ 表示された <span className="text-purple-300 font-mono">ghp_xxxx...</span> をコピー</p>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
                    ⚠ ページを閉じると二度と表示されません。必ずこの場でコピーしてください。
                  </div>
                </div>
              </div>

              {/* STEP 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                  <span className="font-semibold text-slate-200">PC（Chrome / Edge）で接続</span>
                </div>
                <div className="ml-7 space-y-2 text-slate-400">
                  <p>MT4/MT5 が動いている PC の Chrome または Edge でこのアプリを開いてください。</p>
                  <div className="bg-[#0a0e17] rounded-lg p-3 space-y-1.5 border border-[#1f2d40]">
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">①</span><span>下の入力欄に GitHub ユーザー名・リポジトリ名・Token を入力して「接続して同期」をタップ</span></div>
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">②</span><span>ページ上部の「📁 MTExport フォルダを選択」をクリックして <span className="font-mono text-slate-300">%USERPROFILE%\MTExport</span> を選択</span></div>
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">③</span><span>ブラウザが開いている間は 5 分ごとに自動で GitHub へアップロードされます</span></div>
                  </div>
                  <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg px-3 py-2 text-slate-400">
                    ⚠ ブラウザを閉じると同期が止まります。ブラウザを閉じていても同期を続けたい場合は STEP 4 も設定してください。
                  </div>
                </div>
              </div>

              {/* STEP 4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">4</span>
                  <span className="font-semibold text-slate-200">タスクスケジューラ設定（ブラウザを閉じても同期）</span>
                </div>
                <div className="ml-7 space-y-3 text-slate-400">
                  <p>PC を起動しているだけで 5 分ごとに自動プッシュします。ブラウザは不要です。</p>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => downloadText(SYNC_PS1, 'sync-to-github.ps1')}
                      className="text-purple-400 hover:text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-lg transition-colors text-xs">
                      ↓ sync-to-github.ps1
                    </button>
                    {githubSettings ? (
                      <button onClick={() => downloadText(makeRunSyncVbs(githubSettings.owner, githubSettings.repo, githubSettings.token), 'run-sync.vbs')}
                        className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors text-xs">
                        ↓ run-sync.vbs（設定情報入り）
                      </button>
                    ) : (
                      <span className="text-slate-600 text-xs py-1.5">※ 先に下の入力欄で接続すると run-sync.vbs に設定が自動入力されます</span>
                    )}
                  </div>

                  <div>
                    <div className="text-slate-400 mb-1 font-medium">① 両ファイルをブロック解除（PowerShell）</div>
                    <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2d40] rounded-lg px-3 py-2 overflow-x-auto">
                      <code className="text-green-400 font-mono flex-1 whitespace-nowrap text-[11px]">{'Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-github.ps1"; Unblock-File "$env:USERPROFILE\\Downloads\\run-sync.vbs"'}</code>
                      <button onClick={() => navigator.clipboard.writeText('Unblock-File "$env:USERPROFILE\\Downloads\\sync-to-github.ps1"; Unblock-File "$env:USERPROFILE\\Downloads\\run-sync.vbs"')}
                        className="text-slate-600 hover:text-slate-300 flex-shrink-0 ml-1" title="コピー">⎘</button>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 mb-1 font-medium">② タスクスケジューラに登録（5 分ごと・完全サイレント）</div>
                    <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2d40] rounded-lg px-3 py-2 overflow-x-auto">
                      <code className="text-green-400 font-mono flex-1 whitespace-nowrap text-[11px]">{'schtasks /create /tn "MTExportSync" /sc minute /mo 5 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"'}</code>
                      <button onClick={() => navigator.clipboard.writeText('schtasks /create /tn "MTExportSync" /sc minute /mo 5 /f /tr "wscript /b %USERPROFILE%\\Downloads\\run-sync.vbs"')}
                        className="text-slate-600 hover:text-slate-300 flex-shrink-0 ml-1" title="コピー">⎘</button>
                    </div>
                    <div className="text-slate-600 mt-1">「スケジュール タスク "MTExportSync" を作成しました。」と表示されれば完了。ウィンドウは一切表示されません。</div>
                  </div>
                </div>
              </div>

              {/* STEP 5 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">5</span>
                  <span className="font-semibold text-slate-200">スマホで接続</span>
                </div>
                <div className="ml-7 space-y-2 text-slate-400">
                  <div className="bg-[#0a0e17] rounded-lg p-3 space-y-1.5 border border-[#1f2d40]">
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">①</span><span>スマホのブラウザでこのアプリ（Vercel の URL）を開く</span></div>
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">②</span><span>右上の「GH 設定」をタップ → 同じ GitHub 情報を入力して「接続して同期」</span></div>
                    <div className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">③</span><span>以後は 5 分ごとに GitHub から最新データを自動取得します</span></div>
                  </div>
                </div>
              </div>

              {/* 入力フォーム */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 text-xs flex items-center justify-center font-bold flex-shrink-0">↓</span>
                  <span className="font-semibold text-slate-200">GitHub 接続情報を入力</span>
                </div>
                <div className="ml-7 space-y-2">
                  <p className="text-slate-400">STEP 1〜2 が完了したら入力してください。PC・スマホそれぞれで設定します。</p>
                  <input type="text" placeholder="GitHub ユーザー名 (例: tomoki)"
                    value={ghOwner} onChange={e => setGhOwner(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
                  <input type="text" placeholder="リポジトリ名 (例: mt4-report-data)"
                    value={ghRepo} onChange={e => setGhRepo(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
                  <input type="password" placeholder="Personal Access Token (ghp_xxxx...)"
                    value={ghToken} onChange={e => setGhToken(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-[#1f2d40] rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500" />
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={!ghOwner || !ghRepo || !ghToken}
                      onClick={async () => {
                        const s = { owner: ghOwner.trim(), repo: ghRepo.trim(), token: ghToken.trim() }
                        try {
                          await syncFromGitHub(s)
                          saveGitHubSettings(s)
                          setGitHubSettings(s)
                          setShowGitHubModal(false)
                        } catch (e) {
                          alert(`接続エラー: ${e.message}`)
                        }
                      }}
                      className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors font-semibold">
                      接続して同期
                    </button>
                    {githubSettings && (
                      <button
                        onClick={() => { clearGitHubSettings(); setGitHubSettings(null); setShowGitHubModal(false) }}
                        className="text-slate-500 hover:text-red-400 px-3 py-2 rounded-lg border border-[#1f2d40] transition-colors">
                        設定削除
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
