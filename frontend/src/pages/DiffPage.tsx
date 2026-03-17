import { useState } from 'react'
import { GitCompare } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

async function getBackend() { return import('../../wailsjs/go/main/App') }

interface DiffLine {
  type: 'equal' | 'insert' | 'delete'
  content: string
  line_a: number
  line_b: number
}

export default function DiffPage() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [diffs, setDiffs] = useState<DiffLine[]>([])
  const [stats, setStats] = useState<{ added: number; removed: number; unchanged: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCompare = async () => {
    setLoading(true)
    try {
      const m = await getBackend()
      const result = await m.CompareDiff({ text_a: textA, text_b: textB, ignore_patterns: [], ignore_case: false })
      if (result) {
        setDiffs(result.diffs || [])
        setStats({ added: result.added, removed: result.removed, unchanged: result.unchanged })
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Comparateur de configurations" description="Diff texte ligne à ligne"
        actions={<Button variant="primary" loading={loading} onClick={handleCompare}><GitCompare className="w-4 h-4" /> Comparer</Button>}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="grid grid-cols-2 gap-0 border-b border-slate-800 h-48">
          <div className="flex flex-col border-r border-slate-800">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">Configuration A</div>
            <textarea value={textA} onChange={e => setTextA(e.target.value)}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller la configuration A ici..." />
          </div>
          <div className="flex flex-col">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">Configuration B</div>
            <textarea value={textB} onChange={e => setTextB(e.target.value)}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller la configuration B ici..." />
          </div>
        </div>
        {stats && (
          <div className="flex gap-4 px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
            <span className="text-green-400">+{stats.added}</span>
            <span className="text-red-400">-{stats.removed}</span>
            <span className="text-slate-500">={stats.unchanged}</span>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          <pre className="text-xs font-mono">
            {diffs.map((line, i) => (
              <div key={i} className={`px-4 py-0.5 flex gap-4 ${line.type === 'insert' ? 'diff-added' : line.type === 'delete' ? 'diff-removed' : 'diff-equal'}`}>
                <span className="w-10 text-slate-600 select-none text-right shrink-0">
                  {line.type === 'insert' ? line.line_b : line.type === 'delete' ? line.line_a : line.line_a}
                </span>
                <span className={`mr-2 ${line.type === 'insert' ? 'text-green-400' : line.type === 'delete' ? 'text-red-400' : 'text-slate-600'}`}>
                  {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
                </span>
                <span className={line.type === 'equal' ? 'text-slate-500' : 'text-slate-200'}>{line.content}</span>
              </div>
            ))}
          </pre>
          {diffs.length === 0 && <div className="text-center py-16 text-slate-600">Collez deux configurations et cliquez Comparer</div>}
        </div>
      </div>
    </div>
  )
}
