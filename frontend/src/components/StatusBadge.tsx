import { cn } from '../lib/utils'

interface StatusBadgeProps {
  status: 'success' | 'failed' | 'running' | 'online' | 'offline' | 'unknown' | string
  className?: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  success: { label: 'Succès', className: 'bg-green-900/50 text-green-400 border border-green-800' },
  failed:  { label: 'Échec',  className: 'bg-red-900/50 text-red-400 border border-red-800' },
  running: { label: 'En cours', className: 'bg-blue-900/50 text-blue-400 border border-blue-800' },
  online:  { label: 'En ligne', className: 'bg-green-900/50 text-green-400 border border-green-800' },
  offline: { label: 'Hors ligne', className: 'bg-slate-800 text-slate-400 border border-slate-700' },
  unknown: { label: 'Inconnu', className: 'bg-slate-800 text-slate-500 border border-slate-700' },
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, className: 'bg-slate-800 text-slate-400 border border-slate-700' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', cfg.className, className)}>
      {cfg.label}
    </span>
  )
}
