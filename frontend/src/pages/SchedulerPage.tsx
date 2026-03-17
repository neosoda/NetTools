import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/utils'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function SchedulerPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState<any>(null)

  const { data: jobs = [] } = useQuery({ queryKey: ['scheduled-jobs'], queryFn: async () => { const m = await getBackend(); return m.GetScheduledJobs() } })

  const saveMutation = useMutation({
    mutationFn: async (job: any) => { const m = await getBackend(); return m.SaveScheduledJob(job) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeleteScheduledJob(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => { const m = await getBackend(); return m.ToggleScheduledJob(id, enabled) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })

  const jobTypeOptions = [{ value: 'backup', label: 'Backup' }, { value: 'scan', label: 'Scan réseau' }]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Planificateur"
        actions={<Button variant="primary" onClick={() => { setEditJob({ enabled: true, job_type: 'backup', cron_expression: '0 0 2 * * *' }); setShowModal(true) }}><Plus className="w-4 h-4" /> Nouvelle</Button>}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left p-4">Nom</th><th className="text-left p-4">Type</th>
                <th className="text-left p-4">Cron</th><th className="text-left p-4">Dernière exéc.</th>
                <th className="text-left p-4">Statut</th><th className="text-left p-4">Actif</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs as any[]).map((job: any) => (
                <tr key={job.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-4 text-white font-medium">{job.name}</td>
                  <td className="p-4 text-slate-400">{job.job_type}</td>
                  <td className="p-4 font-mono text-xs text-blue-400">{job.cron_expression}</td>
                  <td className="p-4 text-xs text-slate-500">{formatDate(job.last_run_at)}</td>
                  <td className="p-4">{job.last_status && <StatusBadge status={job.last_status} />}</td>
                  <td className="p-4">
                    <button onClick={() => toggleMutation.mutate({ id: job.id, enabled: !job.enabled })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${job.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${job.enabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="p-4"><Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(job.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button></td>
                </tr>
              ))}
              {(jobs as any[]).length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-500">Aucune tâche planifiée</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Tâche planifiée">
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editJob) }} className="space-y-3">
          <Input label="Nom *" value={editJob?.name || ''} required onChange={e => setEditJob((j: any) => ({ ...j, name: e.target.value }))} />
          <Select label="Type" value={editJob?.job_type || 'backup'} options={jobTypeOptions} onChange={e => setEditJob((j: any) => ({ ...j, job_type: e.target.value }))} />
          <Input label="Expression cron" value={editJob?.cron_expression || ''} placeholder="0 0 2 * * *" onChange={e => setEditJob((j: any) => ({ ...j, cron_expression: e.target.value }))} />
          <Input label="Payload JSON" value={editJob?.payload || ''} placeholder='{"device_ids":[]}' onChange={e => setEditJob((j: any) => ({ ...j, payload: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => setShowModal(false)}>Annuler</Button><Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button></div>
        </form>
      </Modal>
    </div>
  )
}
