import { useState, useRef, useCallback, useEffect, DragEvent } from 'react'
import { GitCompare, Upload, X, FileDown, AlignJustify, Columns2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import { getBackend } from '../lib/backend'

interface DiffLine {
  type: string
  content: string
  line_a: number
  line_b: number
}

interface SideBySideRow {
  type: 'equal' | 'insert' | 'delete' | 'changed'
  leftLine?: number
  leftContent?: string
  rightLine?: number
  rightContent?: string
}

function buildSideBySide(diffs: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0
  while (i < diffs.length) {
    const line = diffs[i]
    if (line.type === 'equal') {
      rows.push({ type: 'equal', leftLine: line.line_a, leftContent: line.content, rightLine: line.line_b, rightContent: line.content })
      i++
    } else {
      const deletes: DiffLine[] = []
      const inserts: DiffLine[] = []
      while (i < diffs.length && diffs[i].type === 'delete') { deletes.push(diffs[i]); i++ }
      while (i < diffs.length && diffs[i].type === 'insert') { inserts.push(diffs[i]); i++ }

      const pairedCount = Math.min(deletes.length, inserts.length)
      for (let j = 0; j < pairedCount; j++) {
        rows.push({ type: 'changed', leftLine: deletes[j].line_a, leftContent: deletes[j].content, rightLine: inserts[j].line_b, rightContent: inserts[j].content })
      }
      for (let j = pairedCount; j < deletes.length; j++) {
        rows.push({ type: 'delete', leftLine: deletes[j].line_a, leftContent: deletes[j].content })
      }
      for (let j = pairedCount; j < inserts.length; j++) {
        rows.push({ type: 'insert', rightLine: inserts[j].line_b, rightContent: inserts[j].content })
      }
    }
  }
  return rows
}

const ROW_STYLES: Record<string, { left: string; right: string; marker: string }> = {
  equal:   { left: 'bg-transparent text-slate-500',                           right: 'bg-transparent text-slate-500',                           marker: 'text-slate-700' },
  delete:  { left: 'bg-red-900/20 border-l-2 border-red-500 text-red-300',    right: 'bg-red-900/5 text-transparent select-none',               marker: 'text-red-400' },
  insert:  { left: 'bg-green-900/5 text-transparent select-none',             right: 'bg-green-900/20 border-l-2 border-green-500 text-green-300', marker: 'text-green-400' },
  changed: { left: 'bg-amber-900/20 border-l-2 border-amber-500 text-amber-200', right: 'bg-amber-900/20 border-l-2 border-amber-500 text-amber-200', marker: 'text-amber-400' },
}

export default function DiffPage() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [fileNameA, setFileNameA] = useState('')
  const [fileNameB, setFileNameB] = useState('')
  const [diffs, setDiffs] = useState<DiffLine[]>([])
  const [stats, setStats] = useState<{ added: number; removed: number; unchanged: number; summary: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Options
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [trimTrailing, setTrimTrailing] = useState(true)
  const [ignorePatterns, setIgnorePatterns] = useState('')

  // Display
  const [showOnlyChanges, setShowOnlyChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')

  // Backup comparison mode
  const [diffMode, setDiffMode] = useState<'text' | 'backup'>('text')
  const [backups, setBackups] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [selectedBackupA, setSelectedBackupA] = useState('')
  const [selectedBackupB, setSelectedBackupB] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  const fileRefA = useRef<HTMLInputElement>(null)
  const fileRefB = useRef<HTMLInputElement>(null)

  // Synchronized scroll
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const handleLeftScroll = useCallback(() => {
    if (syncing.current || !rightPaneRef.current || !leftPaneRef.current) return
    syncing.current = true
    rightPaneRef.current.scrollTop = leftPaneRef.current.scrollTop
    syncing.current = false
  }, [])

  const handleRightScroll = useCallback(() => {
    if (syncing.current || !leftPaneRef.current || !rightPaneRef.current) return
    syncing.current = true
    leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop
    syncing.current = false
  }, [])

  useEffect(() => {
    const l = leftPaneRef.current
    const r = rightPaneRef.current
    if (!l || !r) return
    l.addEventListener('scroll', handleLeftScroll)
    r.addEventListener('scroll', handleRightScroll)
    return () => { l.removeEventListener('scroll', handleLeftScroll); r.removeEventListener('scroll', handleRightScroll) }
  }, [diffs, handleLeftScroll, handleRightScroll])

  const loadDevices = async () => {
    const m = await getBackend()
    setDevices(await m.GetDevices() || [])
  }

  const loadBackups = async (deviceId: string) => {
    if (!deviceId) { setBackups([]); return }
    const m = await getBackend()
    setBackups(await m.GetBackups(deviceId) || [])
  }

  const readFile = useCallback((file: File, setter: (v: string) => void, nameSetter: (v: string) => void) => {
    const reader = new FileReader()
    reader.onload = e => { setter(e.target?.result as string || ''); nameSetter(file.name) }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((side: 'a' | 'b') => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) readFile(files[0], side === 'a' ? setTextA : setTextB, side === 'a' ? setFileNameA : setFileNameB)
  }, [readFile])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation() }, [])

  const handleFileInput = useCallback((side: 'a' | 'b') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readFile(file, side === 'a' ? setTextA : setTextB, side === 'a' ? setFileNameA : setFileNameB)
  }, [readFile])

  const getPatterns = () => ignorePatterns.split('\n').map(s => s.trim()).filter(Boolean)

  const handleExportHTML = async () => {
    setExporting(true)
    try {
      const m = await getBackend()
      await m.ExportDiffHTML(
        { text_a: textA, text_b: textB, ignore_patterns: getPatterns(), ignore_case: ignoreCase, ignore_whitespace: ignoreWhitespace, trim_trailing: trimTrailing },
        fileNameA || 'Config A', fileNameB || 'Config B',
      )
    } finally { setExporting(false) }
  }

  const handleCompare = async () => {
    setLoading(true)
    try {
      const m = await getBackend()
      const result = await m.CompareDiff({ text_a: textA, text_b: textB, ignore_patterns: getPatterns(), ignore_case: ignoreCase, ignore_whitespace: ignoreWhitespace, trim_trailing: trimTrailing })
      if (result) {
        setDiffs(result.diffs || [])
        setStats({ added: result.added, removed: result.removed, unchanged: result.unchanged, summary: result.summary || '' })
      }
    } finally { setLoading(false) }
  }

  const handleCompareBackups = async () => {
    if (!selectedBackupA || !selectedBackupB) return
    setLoading(true)
    try {
      const m = await getBackend()
      const result = await m.CompareBackups(selectedBackupA, selectedBackupB)
      if (result) {
        setDiffs(result.diffs || [])
        setStats({ added: result.added, removed: result.removed, unchanged: result.unchanged, summary: result.summary || '' })
      }
    } catch { setDiffs([]); setStats(null) } finally { setLoading(false) }
  }

  const sideBySideRows = buildSideBySide(diffs)
  const displayRows = showOnlyChanges ? sideBySideRows.filter(r => r.type !== 'equal') : sideBySideRows
  const unifiedDiffs = showOnlyChanges ? diffs.filter(d => d.type !== 'equal') : diffs

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Comparateur de configurations" description="Diff ligne à ligne"
        actions={
          <div className="flex items-center gap-3">
            {stats && (
              <div className="flex gap-3 text-xs font-mono">
                <span className="text-green-400 bg-green-500/10 px-2 py-1 rounded border border-green-500/20">+{stats.added}</span>
                <span className="text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">−{stats.removed}</span>
                <span className="text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">~{Math.round((stats.added + stats.removed) / 2)}</span>
                <span className="text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">={stats.unchanged}</span>
              </div>
            )}
            {diffs.length > 0 && (
              <Button variant="secondary" loading={exporting} onClick={handleExportHTML}>
                <FileDown className="w-4 h-4" /> Export HTML
              </Button>
            )}
            <Button variant="primary" loading={loading} onClick={handleCompare} disabled={!textA.trim() || !textB.trim()}>
              <GitCompare className="w-4 h-4" /> Comparer
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Options bar */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4 px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5 mr-2">
            <button onClick={() => setDiffMode('text')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${diffMode === 'text' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
              Texte
            </button>
            <button onClick={() => { setDiffMode('backup'); loadDevices() }}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${diffMode === 'backup' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
              Backups
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors" title="Ignorer majuscules/minuscules">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={ignoreCase} onChange={e => setIgnoreCase(e.target.checked)} />
            Ignorer casse
          </label>
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors" title="Ignorer les espacements">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={ignoreWhitespace} onChange={e => setIgnoreWhitespace(e.target.checked)} />
            Ignorer espaces
          </label>
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors" title="Ignorer les espaces en fin de ligne">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={trimTrailing} onChange={e => setTrimTrailing(e.target.checked)} />
            Trim trailing
          </label>
          <div className="h-4 w-px bg-slate-700" />
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors" title="Afficher uniquement les lignes modifiées">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={showOnlyChanges} onChange={e => setShowOnlyChanges(e.target.checked)} />
            Diff only
          </label>

          <div className="flex-1" />

          {/* View mode toggle */}
          {diffs.length > 0 && (
            <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'split' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                title="Vue côte à côte">
                <Columns2 className="w-3 h-3" /> Split
              </button>
              <button onClick={() => setViewMode('unified')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'unified' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                title="Vue unifiée">
                <AlignJustify className="w-3 h-3" /> Unifié
              </button>
            </div>
          )}

          <div className="relative group">
            <button className="text-slate-500 hover:text-slate-300 transition-colors text-xs" title="Filtres regex">
              Filtres regex...
            </button>
            <div className="absolute right-0 top-full mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <label className="text-xs text-slate-400 block mb-1">Lignes à ignorer (regex, une par ligne)</label>
              <textarea value={ignorePatterns} onChange={e => setIgnorePatterns(e.target.value)}
                placeholder={"^!.*timestamp.*\n^ntp clock-period"}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-blue-500"
                rows={3} />
            </div>
          </div>
        </div>

        {/* Input areas */}
        {diffMode === 'backup' ? (
          <div className="border-b border-slate-800 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <select value={selectedDeviceId} onChange={e => { setSelectedDeviceId(e.target.value); loadBackups(e.target.value) }}
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="">Sélectionner un équipement...</option>
                {devices.map((d: any) => <option key={d.id} value={d.id}>{d.hostname || d.ip} ({d.ip})</option>)}
              </select>
              <select value={selectedBackupA} onChange={e => setSelectedBackupA(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="">Backup A...</option>
                {backups.map((b: any) => <option key={b.id} value={b.id}>{new Date(b.created_at).toLocaleString()} ({b.config_type})</option>)}
              </select>
              <select value={selectedBackupB} onChange={e => setSelectedBackupB(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="">Backup B...</option>
                {backups.map((b: any) => <option key={b.id} value={b.id}>{new Date(b.created_at).toLocaleString()} ({b.config_type})</option>)}
              </select>
            </div>
            <Button variant="primary" loading={loading} onClick={handleCompareBackups}
              disabled={!selectedBackupA || !selectedBackupB || selectedBackupA === selectedBackupB}>
              <GitCompare className="w-4 h-4" /> Comparer les backups
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 border-b border-slate-800 min-h-[12rem] md:h-48">
            <div className="flex flex-col border-r border-slate-800" onDrop={handleDrop('a')} onDragOver={handleDragOver}>
              <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Config A {fileNameA && <span className="text-blue-400 ml-1">({fileNameA})</span>}
                </span>
                <div className="flex items-center gap-1">
                  {textA && <button onClick={() => { setTextA(''); setFileNameA('') }} className="text-slate-600 hover:text-slate-300 p-0.5"><X className="w-3 h-3" /></button>}
                  <button onClick={() => fileRefA.current?.click()} className="text-slate-500 hover:text-blue-400 p-0.5" title="Charger un fichier"><Upload className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <input ref={fileRefA} type="file" className="hidden" accept=".txt,.cfg,.conf,.log" onChange={handleFileInput('a')} />
              <textarea value={textA} onChange={e => { setTextA(e.target.value); setFileNameA('') }}
                className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
                placeholder="Coller ou glisser-déposer la configuration A ici..." />
            </div>
            <div className="flex flex-col" onDrop={handleDrop('b')} onDragOver={handleDragOver}>
              <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Config B {fileNameB && <span className="text-blue-400 ml-1">({fileNameB})</span>}
                </span>
                <div className="flex items-center gap-1">
                  {textB && <button onClick={() => { setTextB(''); setFileNameB('') }} className="text-slate-600 hover:text-slate-300 p-0.5"><X className="w-3 h-3" /></button>}
                  <button onClick={() => fileRefB.current?.click()} className="text-slate-500 hover:text-blue-400 p-0.5" title="Charger un fichier"><Upload className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <input ref={fileRefB} type="file" className="hidden" accept=".txt,.cfg,.conf,.log" onChange={handleFileInput('b')} />
              <textarea value={textB} onChange={e => { setTextB(e.target.value); setFileNameB('') }}
                className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
                placeholder="Coller ou glisser-déposer la configuration B ici..." />
            </div>
          </div>
        )}

        {/* Diff output */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {diffs.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              Collez deux configurations et cliquez Comparer
            </div>
          ) : displayRows.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              Aucune différence — les configurations sont identiques.
            </div>
          ) : viewMode === 'split' ? (
            /* ── SPLIT VIEW ── */
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Column headers */}
              <div className="grid grid-cols-2 border-b border-slate-800 shrink-0">
                <div className="px-4 py-1.5 bg-slate-900/60 text-xs font-semibold text-slate-400 border-r border-slate-800">
                  {fileNameA || 'Config A'}
                </div>
                <div className="px-4 py-1.5 bg-slate-900/60 text-xs font-semibold text-slate-400">
                  {fileNameB || 'Config B'}
                </div>
              </div>
              {/* Split panes */}
              <div className="flex-1 overflow-hidden grid grid-cols-2">
                {/* Left pane */}
                <div ref={leftPaneRef} className="overflow-auto border-r border-slate-800">
                  <pre className="text-xs font-mono">
                    {displayRows.map((row, i) => {
                      const s = ROW_STYLES[row.type]
                      const marker = row.type === 'delete' ? '−' : row.type === 'changed' ? '~' : row.type === 'insert' ? ' ' : ' '
                      return (
                        <div key={i} className={`flex gap-0 ${s.left}`}>
                          <span className="w-10 text-right pr-2 text-slate-700 select-none shrink-0 py-0.5">
                            {row.leftLine ?? ''}
                          </span>
                          <span className={`w-4 shrink-0 font-bold ${s.marker} py-0.5`}>{marker}</span>
                          <span className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">{row.leftContent ?? ''}</span>
                        </div>
                      )
                    })}
                  </pre>
                </div>
                {/* Right pane */}
                <div ref={rightPaneRef} className="overflow-auto">
                  <pre className="text-xs font-mono">
                    {displayRows.map((row, i) => {
                      const s = ROW_STYLES[row.type]
                      const marker = row.type === 'insert' ? '+' : row.type === 'changed' ? '~' : row.type === 'delete' ? ' ' : ' '
                      return (
                        <div key={i} className={`flex gap-0 ${s.right}`}>
                          <span className="w-10 text-right pr-2 text-slate-700 select-none shrink-0 py-0.5">
                            {row.rightLine ?? ''}
                          </span>
                          <span className={`w-4 shrink-0 font-bold ${s.marker} py-0.5`}>{marker}</span>
                          <span className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">{row.rightContent ?? ''}</span>
                        </div>
                      )
                    })}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            /* ── UNIFIED VIEW ── */
            <div className="flex-1 overflow-auto">
              <pre className="text-xs font-mono">
                {unifiedDiffs.map((line, i) => (
                  <div key={i} className={`px-2 md:px-4 py-0.5 flex gap-2 md:gap-4 ${
                    line.type === 'insert'  ? 'bg-green-900/15 border-l-2 border-green-500' :
                    line.type === 'delete'  ? 'bg-red-900/15 border-l-2 border-red-500' :
                    'border-l-2 border-transparent'}`}>
                    <span className="hidden sm:inline w-10 text-slate-600 select-none text-right shrink-0">
                      {line.type !== 'insert' ? line.line_a : ''}
                    </span>
                    <span className="hidden sm:inline w-10 text-slate-600 select-none text-right shrink-0">
                      {line.type !== 'delete' ? line.line_b : ''}
                    </span>
                    <span className={`mr-2 font-bold ${line.type === 'insert' ? 'text-green-400' : line.type === 'delete' ? 'text-red-400' : 'text-slate-700'}`}>
                      {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
                    </span>
                    <span className={`break-all whitespace-pre-wrap ${line.type === 'insert' ? 'text-green-300' : line.type === 'delete' ? 'text-red-300' : 'text-slate-500'}`}>
                      {line.content}
                    </span>
                  </div>
                ))}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
