import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Trash2, FileCode } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'

async function getBackend() { return import('../../wailsjs/go/main/App') }

const defaultYaml = `name: Example
timeout: 60s
steps:
  - name: Show version
    command: show version
    on_error: continue
`

export default function PlaybookPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editPb, setEditPb] = useState<any>(null)
  const [runModal, setRunModal] = useState<any>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [results, setResults] = useState<any[]>([])

  const { data: playbooks = [] } = useQuery({ queryKey: ['playbooks'], queryFn: async () => { const m = await getBackend(); return m.GetPlaybooks() } })
  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: async () => { const m = await getBackend(); return m.GetDevices() } })

  const saveMutation = useMutation({
    mutationFn: async (pb: any) => { const m = await getBackend(); return m.SavePlaybook(pb) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['playbooks'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeletePlaybook(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })
  const runMutation = useMutation({
    mutationFn: async () => { const m = await getBackend(); return m.RunPlaybook({ playbook_id: runModal.id, device_ids: selectedDevices }) },
    onSuccess: (data: any) => setResults(data || []),
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Playbooks SSH"
        actions={<Button variant="primary" onClick={() => { setEditPb({ content: defaultYaml }); setShowModal(true) }}><Plus className="w-4 h-4" /> Nouveau</Button>}
      />
      <div className="flex-1 overflow-auto p-6 grid grid-cols-3 gap-4 content-start">
        {(playbooks as any[]).map((pb: any) => (
          <div key={pb.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div><FileCode className="w-4 h-4 text-blue-400 mb-1" /><h3 className="font-medium text-white">{pb.name}</h3></div>
            <pre className="text-xs text-slate-500 bg-slate-950 p-2 rounded overflow-hidden max-h-24 font-mono">{pb.content}</pre>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => { setRunModal(pb); setResults([]) }}><Play className="w-3.5 h-3.5" /> Run</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditPb(pb); setShowModal(true) }}>Éditer</Button>
              <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(pb.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
            </div>
          </div>
        ))}
        {(playbooks as any[]).length === 0 && (
          <div className="col-span-3 text-center py-16 text-slate-500">Aucun playbook.</div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Playbook" size="lg">
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editPb) }} className="space-y-3">
          <Input label="Nom *" value={editPb?.name || ''} required onChange={e => setEditPb((p: any) => ({ ...p, name: e.target.value }))} />
          <div>
            <label className="text-xs font-medium text-slate-400">YAML</label>
            <textarea value={editPb?.content || ''} onChange={e => setEditPb((p: any) => ({ ...p, content: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-xs font-mono text-slate-200 focus:outline-none resize-none" rows={12} />
          </div>
          <div className="flex justify-end gap-2"><Button onClick={() => setShowModal(false)}>Annuler</Button><Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button></div>
        </form>
      </Modal>

      <Modal open={!!runModal} onClose={() => setRunModal(null)} title={`Run: ${runModal?.name}`} size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">{selectedDevices.length}/{(devices as any[]).length} sélectionnés</p>
            <button onClick={() => setSelectedDevices(selectedDevices.length === (devices as any[]).length ? [] : (devices as any[]).map((d: any) => d.id))}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              {selectedDevices.length === (devices as any[]).length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(devices as any[]).map((d: any) => (
              <button key={d.id}
                onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                className={`px-2 py-1 rounded text-xs border ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {d.hostname || d.ip}
              </button>
            ))}
          </div>
          <Button variant="primary" loading={runMutation.isPending} disabled={selectedDevices.length === 0} onClick={() => runMutation.mutate()}>
            <Play className="w-4 h-4" /> Exécuter ({selectedDevices.length})
          </Button>
          {results.map((r: any, i: number) => (
            <div key={i} className="bg-slate-950 rounded-lg p-3">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-white">{r.DeviceIP}</span>
                <span className={r.Status === 'success' ? 'text-green-400' : 'text-red-400'}>{r.Status}</span>
              </div>
              {(r.Steps || []).map((s: any, j: number) => (
                <div key={j} className="mb-2">
                  <p className="text-xs text-slate-400">→ {s.name}: <code className="text-blue-400">{s.command}</code></p>
                  <pre className="text-xs text-slate-300 pl-3 max-h-20 overflow-y-auto">{s.output}</pre>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
