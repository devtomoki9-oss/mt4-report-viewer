const DB_NAME = 'mt4-report-viewer'
const DB_VERSION = 1
const STORE_NAME = 'handles'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME)
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandle(key, handle) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadHandle(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteHandle(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * ディレクトリから .htm/.html/.json を再帰的に収集する。
 * EA が出力する mt4_report_*.json と手動 HTML の両方に対応。
 */
export async function collectReportFiles(dirHandle, depth = 0) {
  const files = []
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && /\.(html?|json)$/i.test(name)) {
      files.push(await entry.getFile())
    } else if (entry.kind === 'directory' && depth < 2) {
      files.push(...await collectReportFiles(entry, depth + 1))
    }
  }
  return files
}

// 後方互換エイリアス
export const collectHtmlFiles = collectReportFiles

export const FOLDER_KEY = 'mt4-reports-dir'
export const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window
