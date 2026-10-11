import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, Download } from 'lucide-react';
import { GetAllPortStates, RunPortTrackerScan, GetDevices } from '../../wailsjs/go/main/App';
import { PortState, Device } from '../types/models';

export default function PortTrackerPage() {
  const queryClient = useQueryClient();
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  
  const { data: ports = [], isLoading } = useQuery<PortState[]>({
    queryKey: ['port-states'],
    queryFn: () => GetAllPortStates(),
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => GetDevices(),
  });

  const deviceMap = useMemo(() => {
    const map: Record<string, Device> = {};
    for (const d of devices) {
      map[d.id] = d;
    }
    return map;
  }, [devices]);

  const scanMutation = useMutation({
    mutationFn: () => RunPortTrackerScan([]),
    onSuccess: () => {
      // Handled by events normally, but invalidate just in case
      queryClient.invalidateQueries({ queryKey: ['port-states'] });
    },
  });

  const filteredPorts = useMemo(() => {
    return ports.filter(p => {
      if (filterClass !== 'ALL' && p.classification !== filterClass) return false;
      if (selectedDeviceId !== 'ALL' && p.device_id !== selectedDeviceId) return false;
      if (search) {
        const s = search.toLowerCase();
        const dev = deviceMap[p.device_id];
        const devHost = (dev?.hostname || '').toLowerCase();
        const devIp = (dev?.ip || '').toLowerCase();
        return (
          p.if_name.toLowerCase().includes(s) ||
          p.if_alias.toLowerCase().includes(s) ||
          p.last_mac.toLowerCase().includes(s) ||
          devHost.includes(s) ||
          devIp.includes(s)
        );
      }
      return true;
    });
  }, [ports, filterClass, selectedDeviceId, search, deviceMap]);

  const stats = useMemo(() => {
    const total = ports.length;
    const used = ports.filter(p => p.classification === 'USED').length;
    const inactive = ports.filter(p => p.classification === 'INACTIVE').length;
    const free = ports.filter(p => p.classification === 'PROBABLY_FREE').length;
    const never = ports.filter(p => p.classification === 'NEVER_SEEN_UP').length;
    const infra = ports.filter(p => p.classification === 'INFRASTRUCTURE').length;
    const reserved = ports.filter(p => p.classification === 'RESERVED').length;
    return { total, used, inactive, free, never, infra, reserved };
  }, [ports]);

  const classColors: Record<string, string> = {
    USED: 'text-emerald-500 bg-emerald-500/10',
    INACTIVE: 'text-amber-500 bg-amber-500/10',
    PROBABLY_FREE: 'text-blue-400 bg-blue-400/10',
    NEVER_SEEN_UP: 'text-slate-400 bg-slate-400/10',
    INFRASTRUCTURE: 'text-purple-400 bg-purple-400/10',
    RESERVED: 'text-orange-400 bg-orange-400/10',
    UNKNOWN: 'text-gray-500 bg-gray-500/10'
  };

  const classLabels: Record<string, string> = {
    USED: 'Actif',
    INACTIVE: 'Inactif',
    PROBABLY_FREE: 'Libre probable',
    NEVER_SEEN_UP: 'Jamais vu UP',
    INFRASTRUCTURE: 'Infrastructure',
    RESERVED: 'Réservé',
    UNKNOWN: 'Inconnu'
  };

  const handleExportCSV = () => {
    if (filteredPorts.length === 0) return;
    const headers = ['Equipement', 'IP', 'Port', 'Description', 'Etat Op.', 'Dernier UP', 'Derniere MAC', 'Classification', 'Score Confiance (%)'];
    const rows = filteredPorts.map(p => {
      const dev = deviceMap[p.device_id];
      return [
        `"${(dev?.hostname || '').replace(/"/g, '""')}"`,
        `"${(dev?.ip || p.device_id).replace(/"/g, '""')}"`,
        `"${p.if_name.replace(/"/g, '""')}"`,
        `"${(p.if_alias || '').replace(/"/g, '""')}"`,
        p.oper_status === 1 ? 'UP' : 'DOWN',
        p.last_up_at ? new Date(p.last_up_at).toISOString().split('T')[0] : '',
        `"${(p.last_mac || '').replace(/"/g, '""')}"`,
        `"${classLabels[p.classification] || p.classification}"`,
        p.confidence
      ].join(';');
    });
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NetTools_PortTracker_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            Utilisation des Ports
          </h1>
          <p className="text-slate-400 mt-1">Historique persistant et détection des ports libres</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            disabled={filteredPorts.length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Exporter la liste filtrée au format CSV (compatible Excel)"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Exporter CSV
          </button>
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
            {scanMutation.isPending ? 'Scan en cours...' : 'Lancer un scan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Actifs" value={stats.used} color="text-emerald-500" />
        <StatCard title="Inactifs" value={stats.inactive} color="text-amber-500" />
        <StatCard title="Libres probables" value={stats.free} color="text-blue-400" />
        <StatCard title="Jamais vus UP" value={stats.never} color="text-slate-400" />
        <StatCard title="Infrastructure" value={stats.infra} color="text-purple-400" />
        <StatCard title="Réservés" value={stats.reserved} color="text-orange-400" />
      </div>

      <div className="panel flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-700 flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Rechercher port, description, MAC, IP ou machine..."
            className="input-field max-w-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select 
            className="input-field max-w-xs"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="ALL">Toutes les classifications</option>
            {Object.entries(classLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select 
            className="input-field max-w-xs"
            value={selectedDeviceId}
            onChange={e => setSelectedDeviceId(e.target.value)}
          >
            <option value="ALL">Tous les équipements</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.hostname ? `${d.hostname} (${d.ip})` : d.ip}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-400 ml-auto">
            {filteredPorts.length} port(s) affiché(s)
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/50 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="p-4 font-medium text-slate-300">Équipement</th>
                <th className="p-4 font-medium text-slate-300">Port</th>
                <th className="p-4 font-medium text-slate-300">Description</th>
                <th className="p-4 font-medium text-slate-300">État Op.</th>
                <th className="p-4 font-medium text-slate-300">Dernier UP</th>
                <th className="p-4 font-medium text-slate-300">Dernière MAC</th>
                <th className="p-4 font-medium text-slate-300">Classification</th>
                <th className="p-4 font-medium text-slate-300 text-right">Confiance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">Chargement...</td></tr>
              ) : filteredPorts.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">Aucun port trouvé</td></tr>
              ) : (
                filteredPorts.map(p => (
                  <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="p-4 text-sm font-medium">
                      <div className="text-slate-200">{deviceMap[p.device_id]?.hostname || 'Switch'}</div>
                      <div className="text-xs text-slate-400 font-mono">{deviceMap[p.device_id]?.ip || p.device_id}</div>
                    </td>
                    <td className="p-4 font-mono text-sm">{p.if_name}</td>
                    <td className="p-4 text-sm text-slate-300">{p.if_alias || <span className="text-slate-500 italic">Vide</span>}</td>
                    <td className="p-4">
                      {p.oper_status === 1 ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          UP
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          DOWN
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {p.last_up_at ? (
                        <span title={new Date(p.last_up_at).toLocaleString('fr-FR')} className="cursor-help underline decoration-dashed decoration-slate-600">
                           {new Date(p.last_up_at).toLocaleDateString('fr-FR')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400">
                      {p.last_mac ? (
                         <div>
                           {p.last_mac}
                           {p.last_mac_seen_at && (
                             <div className="text-[10px] text-slate-500">
                               vu {new Date(p.last_mac_seen_at).toLocaleDateString('fr-FR')}
                             </div>
                           )}
                         </div>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${classColors[p.classification] || classColors['UNKNOWN']}`}>
                        {classLabels[p.classification] || p.classification}
                      </span>
                      {p.has_lldp_neighbor && (
                        <span className="ml-2 inline-flex items-center text-xs text-purple-400 border border-purple-400/30 px-1.5 rounded bg-purple-400/10">
                          LLDP
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-medium">{p.confidence}%</span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${p.confidence > 70 ? 'bg-emerald-500' : p.confidence > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${p.confidence}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color = 'text-white' }: { title: string, value: number, color?: string }) {
  return (
    <div className="panel p-4 flex flex-col gap-1 items-center justify-center text-center">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}
