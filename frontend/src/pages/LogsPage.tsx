import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Input from '../components/Input'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/utils'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function LogsPage() {
  const [actionFilter, setActionFilter] = useState('')

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', actionFilter],
    queryFn: async () => { const m = await getBackend(); return m.GetAuditLogs({ limit: 200, offset: 0, action: actionFilter }) },
    refetchInterval: 10000,
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Journal d'audit"
        actions={<div className="flex gap-2 items-center">
          <Input placeholder="Filtrer..." value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-40 py-1.5" />
          <button onClick={() => refetch()} className="text-slate-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>}
      />
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left p-3">Date</th><th className="text-left p-3">Action</th>
                <th className="text-left p-3">Type</th><th className="text-left p-3">Statut</th>
                <th className="text-left p-3">Durée</th><th className="text-left p-3">Détails</th>
              </tr>
            </thead>
            <tbody>
              {(logs as any[]).map((log: any) => (
                <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="p-3 font-mono text-xs text-blue-400">{log.action}</td>
                  <td className="p-3 text-xs text-slate-400">{log.entity_type}</td>
                  <td className="p-3"><StatusBadge status={log.status || 'unknown'} /></td>
                  <td className="p-3 text-xs text-slate-500">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  <td className="p-3 text-xs text-slate-500 max-w-xs truncate">{log.details}</td>
                </tr>
              ))}
              {(logs as any[]).length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">Aucun log</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
