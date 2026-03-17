import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Play, Eye, Archive } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import { formatDate, formatBytes } from '../lib/utils'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function BackupPage() {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [configType, setConfigType] = useState('running')
  const [viewBackup, setViewBackup] = useState<string | null>(null)
  const [backupContent, setBackupContent] = useState('')
  const [selectedDevice, setSelectedDevice] = useState('')

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backups', selectedDevice],
    enabled: !!selectedDevice,
    queryFn: async () => { const m = await getBackend(); return m.GetBackups(selectedDevice) },
  })

  const backupMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      return m.RunBackup({ device_ids: selectedDevices, config_type: configType })
    },
    onSuccess: () => refetchBackups(),
  })

  const handleViewBackup = async (id: string) => {
    const m = await getBackend()
    const content = await m.GetBackupContent(id)
    setBackupContent(content)
    setViewBackup(id)
  }

  const configTypeOptions = [
    { value: 'running', label: 'Running config' },
    { value: 'startup', label: 'Startup config' },
  ]

  const toggleDevice = (id: string) =>
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Gestionnaire de backups" description="Sauvegarder et exporter les configurations" />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Lancer un backup</h2>
          <div className="flex gap-4 items-end">
            <Select label="Type de config" value={configType} options={configTypeOptions}
              onChange={e => setConfigType(e.target.value)} />
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-400 mb-1">Équipements ({selectedDevices.length} sélectionnés)</p>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {(devices as any[]).map((d: any) => (
                  <button key={d.id} onClick={() => toggleDevice(d.id)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${selectedDevices.includes(d.id)
                      ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    {d.hostname || d.ip}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" loading={backupMutation.isPending}
              disabled={selectedDevices.length === 0} onClick={() => backupMutation.mutate()}>
              <Play className="w-4 h-4" /> Lancer
            </Button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-300">Historique</h2>
            <Select value={selectedDevice} className="w-48 py-1"
              options={[{ value: '', label: 'Sélectionner...' }, ...(devices as any[]).map((d: any) => ({ value: d.id, label: d.hostname || d.ip }))]}
              onChange={e => setSelectedDevice(e.target.value)} />
          </div>
          {selectedDevice ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Statut</th>
                  <th className="text-left p-3 font-medium">Taille</th>
                  <th className="text-left p-3 font-medium">Durée</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(backups as any[]).map((b: any) => (
                  <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 text-slate-300 text-xs">{formatDate(b.created_at)}</td>
                    <td className="p-3 text-slate-400">{b.config_type}</td>
                    <td className="p-3"><StatusBadge status={b.status} /></td>
                    <td className="p-3 text-slate-400">{formatBytes(b.file_size_bytes)}</td>
                    <td className="p-3 text-slate-400">{b.duration_ms}ms</td>
                    <td className="p-3">
                      {b.status === 'success' && (
                        <Button size="sm" variant="ghost" onClick={() => handleViewBackup(b.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {(backups as any[]).length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-500">Aucun backup</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-slate-500">Sélectionnez un équipement</div>
          )}
        </div>
      </div>

      <Modal open={!!viewBackup} onClose={() => setViewBackup(null)} title="Contenu du backup" size="xl">
        <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg overflow-auto max-h-[60vh] font-mono">
          {backupContent}
        </pre>
      </Modal>
    </div>
  )
}
