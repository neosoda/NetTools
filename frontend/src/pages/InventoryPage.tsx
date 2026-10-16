import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ArrowUpDown, Plus, Trash2, Edit, Plug, RefreshCw, Eraser, Download, Upload } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import { formatDate } from '../lib/utils'
import backend from '../lib/backend'
import { useToast } from '../components/Toast'

interface Device {
  id: string; ip: string; hostname: string; vendor: string; model: string
  os_version: string; location: string; ssh_port: number; credential_id: string
  last_seen_at?: string; last_connectivity_check_at?: string; connectivity_status?: string; created_at: string
}

interface Credential {
  id: string; name: string; username: string
}

const vendorOptions = [
  { value: 'cisco', label: 'Cisco' },
  { value: 'aruba', label: 'Aruba/HP' },
  { value: 'allied', label: 'Allied Telesis' },
  { value: 'unknown', label: 'Inconnu' },
]

export default function InventoryPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editDevice, setEditDevice] = useState<Partial<Device> | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [connectivityFilter, setConnectivityFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'ip' | 'hostname' | 'vendor' | 'last_seen_at' | 'last_connectivity_check_at'>('ip')
  const [sortAscending, setSortAscending] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])

  const { data: devices = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: () => backend.GetDevices(),
  })

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => backend.GetCredentials(),
  })

  const saveMutation = useMutation({
    mutationFn: (device: Partial<Device>) => backend.SaveDevice(device as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setShowModal(false)
      setEditDevice(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  const clearMutation = useMutation({
    mutationFn: () => backend.ClearInventory(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmClear(false)
    },
  })

  const handleExport = async () => {
    try {
      await backend.ExportInventoryJSON()
    } catch (e: any) {
      toast('Erreur export: ' + e, 'error')
    }
  }

  const handleImport = async () => {
    try {
      const count = await backend.ImportInventoryJSON()
      if (count > 0) {
        qc.invalidateQueries({ queryKey: ['devices'] })
        toast(`${count} équipements importés`, 'success')
      }
    } catch (e: any) {
      toast('Erreur import: ' + e, 'error')
    }
  }

  const handleTest = async (deviceId: string) => {
    setTesting(deviceId)
    try {
      const result = await backend.TestDeviceConnection(deviceId)
      toast(result.success ? 'Connexion SSH réussie' : 'Échec: ' + result.error, result.success ? 'success' : 'error')
    } catch (e: any) {
      toast('Échec: ' + e, 'error')
    } finally {
      setTesting(null)
      qc.invalidateQueries({ queryKey: ['devices'] })
    }
  }

  const filtered = (devices as Device[]).filter(d =>
    (!search || d.ip?.includes(search) || d.hostname?.toLowerCase().includes(search.toLowerCase()) || d.vendor?.toLowerCase().includes(search.toLowerCase()) || d.model?.toLowerCase().includes(search.toLowerCase())) &&
    (vendorFilter === 'all' || d.vendor === vendorFilter) &&
    (connectivityFilter === 'all' || (connectivityFilter === 'not_checked'
      ? !d.last_connectivity_check_at
      : d.connectivity_status === connectivityFilter))
  )

  const sorted = [...filtered].sort((left, right) => {
    const leftValue = String(left[sortBy] || '')
    const rightValue = String(right[sortBy] || '')
    return leftValue.localeCompare(rightValue, 'fr', { numeric: true }) * (sortAscending ? 1 : -1)
  })

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) setSortAscending(current => !current)
    else {
      setSortBy(column)
      setSortAscending(true)
    }
  }

  const connectivityLabel = (device: Device) => {
    if (!device.last_connectivity_check_at) return 'Non vérifié'
    if (device.connectivity_status === 'reachable') return 'Joignable lors du test'
    if (device.connectivity_status === 'unreachable') return 'Non joignable lors du test'
    return 'État inconnu'
  }

  useEffect(() => {
    const available = new Set((devices as Device[]).map(device => device.id))
    setSelectedDeviceIds(current => current.filter(id => available.has(id)))
  }, [devices])

  const toggleSelectedDevice = (id: string) => {
    setSelectedDeviceIds(current => current.includes(id) ? current.filter(selected => selected !== id) : [...current, id])
  }

  const toggleFilteredDevices = () => {
    const filteredIDs = filtered.map(device => device.id)
    const everyFilteredSelected = filteredIDs.length > 0 && filteredIDs.every(id => selectedDeviceIds.includes(id))
    setSelectedDeviceIds(current => everyFilteredSelected
      ? current.filter(id => !filteredIDs.includes(id))
      : [...new Set([...current, ...filteredIDs])])
  }

  const credOptions = [
    { value: '', label: '— Aucune —' },
    ...(credentials as Credential[]).map(c => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventaire"
        description={`${(devices as Device[]).length} équipements`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Rechercher IP, nom, modèle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-48 py-1.5"
            />
            <Select aria-label="Filtrer par constructeur" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} options={[{ value: 'all', label: 'Tous constructeurs' }, ...vendorOptions]} className="w-40 py-1.5" />
            <Select aria-label="Filtrer par état de connexion" value={connectivityFilter} onChange={e => setConnectivityFilter(e.target.value)} options={[{ value: 'all', label: 'Tous états' }, { value: 'reachable', label: 'Joignable (testé)' }, { value: 'unreachable', label: 'Non joignable (testé)' }, { value: 'not_checked', label: 'Non vérifié' }]} className="w-40 py-1.5" />
            <Button variant="ghost" onClick={() => refetch()} title="Rafraîchir l’affichage de l’inventaire">
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </Button>
            <Button variant="ghost" onClick={handleImport} title="Importer inventaire (JSON)">
              <Upload className="w-4 h-4 text-blue-400" />
            </Button>
            <Button variant="ghost" onClick={handleExport} title="Exporter inventaire (JSON)" disabled={(devices as Device[]).length === 0}>
              <Download className="w-4 h-4 text-emerald-400" />
            </Button>
            {!confirmClear ? (
              <Button variant="ghost" onClick={() => setConfirmClear(true)} title="Vider l'inventaire">
                <Eraser className="w-4 h-4 text-red-400" />
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-400 mr-1">Vider tout ?</span>
                <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()} loading={clearMutation.isPending}>
                  <span className="text-red-400">Oui</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Non</Button>
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => { setEditDevice({ ssh_port: 22, vendor: 'cisco' }); setShowModal(true) }}
            >
              <Plus className="w-4 h-4" /> Ajouter
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {selectedDeviceIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <span className="text-sm text-slate-200">{selectedDeviceIds.length} équipement{selectedDeviceIds.length > 1 ? 's' : ''} sélectionné{selectedDeviceIds.length > 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate('/backup', { state: { source: 'inventory', deviceIds: selectedDeviceIds } })}>Sauvegarder</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/audit', { state: { source: 'inventory', deviceIds: selectedDeviceIds } })}>Auditer</Button>
            </div>
          </div>
        )}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col h-full max-h-[800px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-sm font-medium animate-pulse">Chargement de l'inventaire...</span>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="w-10 py-3 px-3">
                      <input type="checkbox" aria-label="Sélectionner les équipements filtrés" checked={filtered.length > 0 && filtered.every(device => selectedDeviceIds.includes(device.id))} onChange={toggleFilteredDevices} className="h-4 w-4 accent-blue-500" />
                    </th>
                    <th className="text-left py-3 px-5 font-bold"><button type="button" onClick={() => toggleSort('ip')} className="inline-flex items-center gap-1">Adresse IP <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-left py-3 px-5 font-bold"><button type="button" onClick={() => toggleSort('hostname')} className="inline-flex items-center gap-1">Hostname <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-left py-3 px-5 font-bold"><button type="button" onClick={() => toggleSort('vendor')} className="inline-flex items-center gap-1">Système/Modèle <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-left py-3 px-5 font-bold">Localisation</th>
                    <th className="text-left py-3 px-5 font-bold"><button type="button" onClick={() => toggleSort('last_seen_at')} className="inline-flex items-center gap-1">Découverte <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-left py-3 px-5 font-bold"><button type="button" onClick={() => toggleSort('last_connectivity_check_at')} className="inline-flex items-center gap-1">Connexion <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-right py-3 px-5 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
              {sorted.map(device => (
                <tr key={device.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-3 px-3">
                    <input type="checkbox" aria-label={`Sélectionner ${device.hostname || device.ip}`} checked={selectedDeviceIds.includes(device.id)} onChange={() => toggleSelectedDevice(device.id)} className="h-4 w-4 accent-blue-500" />
                  </td>
                  <td className="py-3 px-5">
                    <span className="font-mono text-blue-400 font-medium bg-blue-500/5 px-2 py-1 rounded-md border border-blue-500/10 group-hover:border-blue-500/30 transition-colors">
                      {device.ip}
                    </span>
                  </td>
                  <td className="py-3 px-5 font-medium text-slate-200">
                    {device.hostname || <span className="text-slate-600 italic">Non défini</span>}
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                        {device.vendor || 'Unknown'}
                      </span>
                      <span className="text-xs text-slate-300">{device.model || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-slate-400 text-sm">{device.location || '—'}</td>
                  <td className="py-3 px-5 text-slate-500 text-xs font-medium">{device.last_seen_at ? formatDate(device.last_seen_at) : 'Jamais découverte'}</td>
                  <td className="py-3 px-5 text-xs">
                    <div className={device.connectivity_status === 'reachable' ? 'text-emerald-300' : device.connectivity_status === 'unreachable' ? 'text-red-300' : 'text-slate-500'}>{connectivityLabel(device)}</div>
                    <div className="mt-1 text-slate-500">{device.last_connectivity_check_at ? formatDate(device.last_connectivity_check_at) : '—'}</div>
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" onClick={() => { setEditDevice(device); setShowModal(true) }} className="w-8 h-8 rounded bg-white/[0.02]">
                        <Edit className="w-4 h-4 text-blue-400" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Vérifier la connexion SSH" loading={testing === device.id} onClick={() => handleTest(device.id)} className="w-8 h-8 rounded bg-white/[0.02]">
                        <Plug className="w-4 h-4 text-emerald-400" />
                      </Button>
                      {confirmDeleteId === device.id ? (
                        <div className="flex items-center bg-red-500/10 rounded border border-red-500/20 px-1">
                          <Button size="sm" variant="ghost" onClick={() => { deleteMutation.mutate(device.id); setConfirmDeleteId(null) }} className="text-red-400 hover:text-red-300 p-1 text-xs font-bold">OK</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} className="text-slate-400 hover:text-slate-300 p-1 text-xs">X</Button>
                        </div>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDeleteId(device.id)} className="w-8 h-8 rounded bg-white/[0.02]">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                      <td colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2">
                       <span className="text-slate-500 font-medium">{isError ? 'Inventaire indisponible.' : 'Aucun équipement correspondant.'}</span>
                       <span className="text-slate-600 text-sm">{isError ? 'Réessayez le chargement ou vérifiez la base locale.' : 'Ajoutez-en un, importez-en ou lancez une découverte réseau.'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditDevice(null) }}
        title={editDevice?.id ? 'Modifier équipement' : 'Ajouter équipement'}>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editDevice!) }} className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Input label="Adresse IP" value={editDevice?.ip || ''} required
              onChange={e => setEditDevice(d => ({ ...d, ip: e.target.value }))} />
            <Input label="Hostname" value={editDevice?.hostname || ''}
              onChange={e => setEditDevice(d => ({ ...d, hostname: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-5 border-t border-white/[0.04] pt-4">
            <Select label="Constructeur (Vendor)" value={editDevice?.vendor || 'unknown'} options={vendorOptions}
              onChange={e => setEditDevice(d => ({ ...d, vendor: e.target.value }))} />
            <Input label="Modèle exact" value={editDevice?.model || ''}
              onChange={e => setEditDevice(d => ({ ...d, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Input label="Port SSH" type="number" value={editDevice?.ssh_port || 22}
              onChange={e => setEditDevice(d => ({ ...d, ssh_port: parseInt(e.target.value) }))} />
            <Input label="Emplacement (Location)" value={editDevice?.location || ''}
              onChange={e => setEditDevice(d => ({ ...d, location: e.target.value }))} />
          </div>
          <div className="bg-slate-950/30 p-4 rounded-xl border border-white/[0.02]">
            <Select label="Credentials SSH/SNMP Liés" value={editDevice?.credential_id || ''} options={credOptions}
              onChange={e => setEditDevice(d => ({ ...d, credential_id: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending} className="px-6">Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
