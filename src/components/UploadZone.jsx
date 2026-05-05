import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function UploadZone({ onFiles }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files) => {
    const htmlFiles = [...files].filter(f => f.name.endsWith('.htm') || f.name.endsWith('.html'))
    if (htmlFiles.length > 0) onFiles(htmlFiles)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all
        ${dragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-[#1f2d40] hover:border-[#2a3f5a] hover:bg-[#111827]/50'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".htm,.html"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-all ${dragging ? 'bg-blue-500/20' : 'bg-[#1a2235]'}`}>
        📊
      </div>
      <div className="text-center">
        <div className="text-slate-300 font-semibold mb-1">{t('upload.title')}</div>
        <div className="text-slate-500 text-sm">{t('upload.subtitle')}</div>
        <div className="text-slate-600 text-xs mt-2">{t('upload.hint')}</div>
      </div>
    </div>
  )
}
