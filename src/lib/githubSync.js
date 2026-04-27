const SETTINGS_KEY = 'github_sync_settings'

export function loadGitHubSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') } catch { return null }
}

export function saveGitHubSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function clearGitHubSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}

export async function fetchReportFilesFromGitHub({ owner, repo, token }) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  }

  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/`,
    { headers }
  )
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${listRes.status}`)
  }

  const entries = await listRes.json()
  const jsonEntries = entries.filter(e => e.type === 'file' && /\.json$/i.test(e.name))

  const files = []
  for (const entry of jsonEntries) {
    const res = await fetch(entry.url, { headers })
    if (!res.ok) continue
    const data = await res.json()
    const text = atob(data.content.replace(/\n/g, ''))
    files.push(new File([text], entry.name, { type: 'application/json' }))
  }
  return files
}

export async function pushFilesToGitHub({ owner, repo, token }, files) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }

  for (const file of files) {
    const text = await file.text()
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)

    let sha = null
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.name}`,
        { headers }
      )
      if (res.ok) sha = (await res.json()).sha
    } catch {}

    const body = { message: `sync: ${file.name}`, content: b64 }
    if (sha) body.sha = sha

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file.name}`,
      { method: 'PUT', headers, body: JSON.stringify(body) }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`${file.name}: ${err.message || res.status}`)
    }
  }
}
