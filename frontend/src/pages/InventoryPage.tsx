import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  ArrowUpDown, Plus, Trash2, Edit, Plug, RefreshCw, Eraser, Download, Upload,
  Folder, FolderPlus, FolderOpen, ChevronDown, ChevronRight, MoveRight, Layers, CheckSquare
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import { formatDate } from '../lib/utils'
import backend from '../lib/backend'
import { useToast } from '../components/Toast'
import { DeviceGroup } from '../types/models'

interface Device {
  id: string
  ip: string
  hostname: string
  vendor: string
  model: string
  os_version: string
  location: string
  ssh_port: number
  credential_id: string
  group_id?: string
  group_name?: string
  last_seen_at?: string
  last_connectivity_check_at?: string
  connectivity_status?: string
  created_at: string
}

interface Credential {
  id: string
  name: string
  username: string
}

const vendorOptions = [
  { value: 'cisco', label: 'Cisco' },
  { value: 'aruba', label: 'Aruba/HP' },
  { value: 'allied', label: 'Allied Telesis' },
  { value: 'unknown', label: 'Inconnu' },
]

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  title,
  'aria-label': ariaLabel,
  className = '',
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
  title?: string
  'aria-label'?: string
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = !checked && Boolean(indeterminate)
    }
  }, [checked, indeterminate])

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onChange={onChange}
      className={`h-4 w-4 rounded border-slate-700 bg-slate-900 accent-blue-500 cursor-pointer ${className}`}
    />
  )
}

export default function InventoryPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Modals state
  const [showModal, setShowModal] = useState(false)
  const [editDevice, setEditDevice] = useState<Partial<Device> | null>(null)
  const [showGroupManager, setShowGroupManager] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedTargetGroupId, setSelectedTargetGroupId] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null)

  const [testing, setTesting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [connectivityFilter, setConnectivityFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'ip' | 'hostname' | 'vendor' | 'last_seen_at' | 'last_connectivity_check_at'>('ip')
  const [sortAscending, setSortAscending] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // Queries
  const { data: devices = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: () => backend.GetDevices(),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['device-groups'],
    queryFn: () => backend.GetDeviceGroups(),
  })

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => backend.GetCredentials(),
  })

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (device: Partial<Device>) => {
      // If group_id is selected, populate group_name
      if (device.group_id) {
        const found = (groups as DeviceGroup[]).find(g => g.id === device.group_id)
        if (found) device.group_name = found.name
      } else {
        device.group_name = ''
      }
      return backend.SaveDevice(device as any)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setShowModal(false)
      setEditDevice(null)
      toast('Équipement sauvegardé', 'success')
    },
    onError: (err: any) => toast('Erreur: ' + err, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      toast('Équipement supprimé', 'success')
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => backend.ClearInventory(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmClear(false)
      toast('Inventaire vidé', 'success')
    },
  })

  const saveGroupMutation = useMutation({
    mutationFn: (grp: Partial<DeviceGroup>) => backend.SaveDeviceGroup(grp as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-groups'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      setNewGroupName('')
      setNewGroupDesc('')
      setEditingGroup(null)
      toast('Groupe enregistré avec succès', 'success')
    },
    onError: (err: any) => toast('Erreur groupe: ' + err, 'error'),
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteDeviceGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-groups'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmDeleteGroupId(null)
      toast('Groupe supprimé. Les équipements sont passés dans « Non classés »', 'success')
    },
    onError: (err: any) => toast('Erreur suppression groupe: ' + err, 'error'),
  })

  const assignGroupMutation = useMutation({
    mutationFn: ({ deviceIds, groupId }: { deviceIds: string[]; groupId: string }) =>
      backend.AssignDevicesToGroup(deviceIds, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setShowAssignModal(false)
      toast('Équipements réassignés avec succès', 'success')
    },
    onError: (err: any) => toast('Erreur assignation: ' + err, 'error'),
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
        qc.invalidateQueries({ queryKey: ['device-groups'] })
        toast(`${count} équipements importés avec succès`, 'success')
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

  // Filtered devices
  const filtered = useMemo(() => {
    return (devices as Device[]).filter(d =>
      (!search ||
        d.ip?.includes(search) ||
        d.hostname?.toLowerCase().includes(search.toLowerCase()) ||
        d.vendor?.toLowerCase().includes(search.toLowerCase()) ||
        d.model?.toLowerCase().includes(search.toLowerCase()) ||
        d.group_name?.toLowerCase().includes(search.toLowerCase())) &&
      (vendorFilter === 'all' || d.vendor === vendorFilter) &&
      (connectivityFilter === 'all' ||
        (connectivityFilter === 'not_checked'
          ? !d.last_connectivity_check_at
          : d.connectivity_status === connectivityFilter)) &&
      (groupFilter === 'all' ||
        (groupFilter === '__unassigned__'
          ? !d.group_id
          : d.group_id === groupFilter))
    )
  }, [devices, search, vendorFilter, connectivityFilter, groupFilter])

  // Sort within groups
  const sortDevices = (list: Device[]) => {
    return [...list].sort((left, right) => {
      const leftValue = String(left[sortBy] || '')
      const rightValue = String(right[sortBy] || '')
      return leftValue.localeCompare(rightValue, 'fr', { numeric: true }) * (sortAscending ? 1 : -1)
    })
  }

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

  // Synchronize selected devices with available list
  useEffect(() => {
    const available = new Set((devices as Device[]).map(device => device.id))
    setSelectedDeviceIds(current => current.filter(id => available.has(id)))
  }, [devices])

  // Selection handlers
  const toggleSelectedDevice = (id: string) => {
    setSelectedDeviceIds(current =>
      current.includes(id) ? current.filter(selected => selected !== id) : [...current, id]
    )
  }

  const selectAllFiltered = () => {
    const filteredIDs = filtered.map(d => d.id)
    setSelectedDeviceIds(current => [...new Set([...current, ...filteredIDs])])
  }

  const deselectAllFiltered = () => {
    const filteredIDs = new Set(filtered.map(d => d.id))
    setSelectedDeviceIds(current => current.filter(id => !filteredIDs.has(id)))
  }

  const toggleGroupSelection = (groupDevices: Device[]) => {
    const gIds = groupDevices.map(d => d.id)
    const isAllSelected = gIds.length > 0 && gIds.every(id => selectedDeviceIds.includes(id))
    if (isAllSelected) {
      setSelectedDeviceIds(current => current.filter(id => !gIds.includes(id)))
    } else {
      setSelectedDeviceIds(current => [...new Set([...current, ...gIds])])
    }
  }

  const toggleCollapseGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  // Grouped structure
  const groupedSections = useMemo(() => {
    const map = new Map<string, { group: DeviceGroup | null; devices: Device[] }>()

    // Custom groups
    for (const g of (groups as DeviceGroup[])) {
      map.set(g.id, { group: g, devices: [] })
    }
    // Unassigned group
    map.set('__unassigned__', { group: null, devices: [] })

    // Distribute filtered devices
    for (const dev of filtered) {
      const gid = dev.group_id && map.has(dev.group_id) ? dev.group_id : '__unassigned__'
      map.get(gid)!.devices.push(dev)
    }

    const sections: { id: string; name: string; description?: string; group: DeviceGroup | null; devices: Device[] }[] = []

    for (const g of (groups as DeviceGroup[])) {
      const entry = map.get(g.id)!
      if (entry.devices.length > 0 || groupFilter === 'all' || groupFilter === g.id) {
        sections.push({
          id: g.id,
          name: g.name,
          description: g.description,
          group: g,
          devices: sortDevices(entry.devices),
        })
      }
    }

    const unassigned = map.get('__unassigned__')!
    if (unassigned.devices.length > 0 || groupFilter === 'all' || groupFilter === '__unassigned__') {
      sections.push({
        id: '__unassigned__',
        name: 'Non classés',
        description: 'Équipements sans affectation de groupe',
        group: null,
        devices: sortDevices(unassigned.devices),
      })
    }

    return sections
  }, [filtered, groups, groupFilter, sortBy, sortAscending])

  const totalFilteredCount = filtered.length
  const allFilteredSelected = totalFilteredCount > 0 && filtered.every(d => selectedDeviceIds.includes(d.id))
  const someFilteredSelected = selectedDeviceIds.some(id => filtered.some(d => d.id === id))

  const credOptions = [
    { value: '', label: '— Aucune —' },
    ...(credentials as Credential[]).map(c => ({ value: c.id, label: c.name })),
  ]

  const groupOptionsForDevice = [
    { value: '', label: '— Non classés —' },
    ...(groups as DeviceGroup[]).map(g => ({ value: g.id, label: g.name })),
  ]

  const groupFilterOptions = [
    { value: 'all', label: 'Tous les groupes' },
    ...(groups as DeviceGroup[]).map(g => ({ value: g.id, label: g.name })),
    { value: '__unassigned__', label: 'Non classés uniquement' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventaire"
        description={`${(devices as Device[]).length} équipement${(devices as Device[]).length > 1 ? 's' : ''} réparti${(devices as Device[]).length > 1 ? 's' : ''} en ${(groups as DeviceGroup[]).length} groupe${(groups as DeviceGroup[]).length > 1 ? 's' : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Rechercher IP, nom, modèle, groupe..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 py-1.5"
            />
            <Select
              aria-label="Filtrer par groupe"
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              options={groupFilterOptions}
              className="w-44 py-1.5"
            />
            <Select
              aria-label="Filtrer par constructeur"
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              options={[{ value: 'all', label: 'Tous constructeurs' }, ...vendorOptions]}
              className="w-40 py-1.5"
            />
            <Select
              aria-label="Filtrer par état de connexion"
              value={connectivityFilter}
              onChange={e => setConnectivityFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Tous états' },
                { value: 'reachable', label: 'Joignable (testé)' },
                { value: 'unreachable', label: 'Non joignable (testé)' },
                { value: 'not_checked', label: 'Non vérifié' },
              ]}
              className="w-40 py-1.5"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowGroupManager(true)}
              title="Gérer les groupes d'équipements">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Groupes ({(groups as DeviceGroup[]).length})</span>
            </Button>
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
              <div className="flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                <span className="text-xs text-red-400 mr-1">Vider tout ?</span>
                <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()} loading={clearMutation.isPending}>
                  <span className="text-red-400 font-bold">Oui</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Non</Button>
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => { setEditDevice({ ssh_port: 22, vendor: 'cisco' }); setShowModal(true) }}>
              <Plus className="w-4 h-4" /> Ajouter
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Bulk action banner when items selected */}
        {selectedDeviceIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-5 py-3 shadow-lg shadow-blue-500/5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                {selectedDeviceIds.length}
              </div>
              <div>
                <span className="text-sm font-bold text-slate-100">
                  {selectedDeviceIds.length} équipement{selectedDeviceIds.length > 1 ? 's' : ''} sélectionné{selectedDeviceIds.length > 1 ? 's' : ''}
                </span>
                <span className="text-xs text-slate-400 ml-2">sur {(devices as Device[]).length} au total</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setSelectedTargetGroupId(''); setShowAssignModal(true) }}>
                <MoveRight className="w-3.5 h-3.5 text-blue-400" />
                Assigner au groupe…
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/backup', { state: { source: 'inventory', deviceIds: selectedDeviceIds } })}>
                Sauvegarder
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/playbook', { state: { deviceIds: selectedDeviceIds } })}>
                Playbook SSH
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/audit', { state: { source: 'inventory', deviceIds: selectedDeviceIds } })}>
                Auditer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedDeviceIds([])} className="text-slate-400 hover:text-slate-200">
                Désélectionner tout
              </Button>
            </div>
          </div>
        )}

        {/* Global selection helper */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
              className="text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1.5 transition-colors">
              <CheckSquare className="w-3.5 h-3.5" />
              {allFilteredSelected ? 'Tout désélectionner' : `Tout sélectionner (${filtered.length} filtrés)`}
            </button>
            <span className="text-slate-600">•</span>
            <span>{selectedDeviceIds.length} sélectionné{selectedDeviceIds.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allCollapsed = groupedSections.every(s => collapsedGroups[s.id])
                const next: Record<string, boolean> = {}
                groupedSections.forEach(s => { next[s.id] = !allCollapsed })
                setCollapsedGroups(next)
              }}
              className="text-slate-400 hover:text-slate-200 transition-colors">
              {groupedSections.every(s => collapsedGroups[s.id]) ? 'Tout déplier' : 'Tout replier'}
            </button>
          </div>
        </div>

        {/* Group Sections */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3 bg-slate-900/40 rounded-2xl border border-white/[0.05]">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm font-medium animate-pulse">Chargement de l'inventaire...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSections.map(section => {
              const secDevices = section.devices
              const secSelected = secDevices.filter(d => selectedDeviceIds.includes(d.id))
              const isAllSecSelected = secDevices.length > 0 && secSelected.length === secDevices.length
              const isIndeterminate = secSelected.length > 0 && secSelected.length < secDevices.length
              const isCollapsed = Boolean(collapsedGroups[section.id])

              return (
                <div
                  key={section.id}
                  className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden transition-all duration-200">
                  {/* Group header bar */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/60 border-b border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleCollapseGroup(section.id)}
                        className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/[0.05] transition-colors"
                        title={isCollapsed ? 'Déplier le groupe' : 'Replier le groupe'}>
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
                      </button>

                      <IndeterminateCheckbox
                        checked={isAllSecSelected}
                        indeterminate={isIndeterminate}
                        onChange={() => toggleGroupSelection(secDevices)}
                        title={`Sélectionner tout le groupe ${section.name}`}
                        aria-label={`Sélectionner le groupe ${section.name}`}
                      />

                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <Folder className="w-4 h-4 text-blue-400" />
                        ) : (
                          <FolderOpen className="w-4 h-4 text-blue-400" />
                        )}
                        <h2 className="text-sm font-bold text-slate-100">{section.name}</h2>
                        {section.description && (
                          <span className="text-xs text-slate-500 hidden md:inline">— {section.description}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                        {secSelected.length > 0 ? (
                          <span className="text-blue-400 font-bold">{secSelected.length}/</span>
                        ) : null}
                        {secDevices.length} équipement{secDevices.length > 1 ? 's' : ''}
                      </span>

                      {section.group && (
                        <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingGroup(section.group)
                              setShowGroupManager(true)
                            }}
                            className="w-7 h-7 rounded text-slate-400 hover:text-blue-400"
                            title="Renommer le groupe">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          {confirmDeleteGroupId === section.id ? (
                            <div className="flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                              <span className="text-[10px] text-red-400">Supprimer ?</span>
                              <button
                                onClick={() => deleteGroupMutation.mutate(section.id)}
                                className="text-[10px] text-red-400 font-bold hover:underline">
                                Oui
                              </button>
                              <button
                                onClick={() => setConfirmDeleteGroupId(null)}
                                className="text-[10px] text-slate-400 hover:underline">
                                Non
                              </button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDeleteGroupId(section.id)}
                              className="w-7 h-7 rounded text-slate-400 hover:text-red-400"
                              title="Supprimer le groupe">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Group Table content */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-950/30 text-slate-400 border-b border-white/[0.04] text-[10px] uppercase tracking-wider">
                            <th className="w-10 py-2.5 px-3"></th>
                            <th className="text-left py-2.5 px-4 font-bold">
                              <button type="button" onClick={() => toggleSort('ip')} className="inline-flex items-center gap-1 hover:text-white">
                                Adresse IP <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="text-left py-2.5 px-4 font-bold">
                              <button type="button" onClick={() => toggleSort('hostname')} className="inline-flex items-center gap-1 hover:text-white">
                                Hostname <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="text-left py-2.5 px-4 font-bold">
                              <button type="button" onClick={() => toggleSort('vendor')} className="inline-flex items-center gap-1 hover:text-white">
                                Système / Modèle <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="text-left py-2.5 px-4 font-bold">Localisation</th>
                            <th className="text-left py-2.5 px-4 font-bold">
                              <button type="button" onClick={() => toggleSort('last_seen_at')} className="inline-flex items-center gap-1 hover:text-white">
                                Découverte <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="text-left py-2.5 px-4 font-bold">
                              <button type="button" onClick={() => toggleSort('last_connectivity_check_at')} className="inline-flex items-center gap-1 hover:text-white">
                                Connexion <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="text-right py-2.5 px-4 font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                          {secDevices.map(device => {
                            const isSelected = selectedDeviceIds.includes(device.id)
                            return (
                              <tr
                                key={device.id}
                                className={`transition-colors group ${
                                  isSelected ? 'bg-blue-500/[0.04]' : 'hover:bg-white/[0.02]'
                                }`}>
                                <td className="py-2.5 px-3">
                                  <input
                                    type="checkbox"
                                    aria-label={`Sélectionner ${device.hostname || device.ip}`}
                                    checked={isSelected}
                                    onChange={() => toggleSelectedDevice(device.id)}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-blue-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className="font-mono text-blue-400 font-medium bg-blue-500/5 px-2 py-0.5 rounded-md border border-blue-500/10 group-hover:border-blue-500/30 transition-colors">
                                    {device.ip}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-medium text-slate-200">
                                  {device.hostname || <span className="text-slate-600 italic">Non défini</span>}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex flex-col gap-0.5 items-start">
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                                      {device.vendor || 'Unknown'}
                                    </span>
                                    <span className="text-xs text-slate-300">{device.model || 'N/A'}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-slate-400 text-xs">{device.location || '—'}</td>
                                <td className="py-2.5 px-4 text-slate-500 text-xs font-medium">
                                  {device.last_seen_at ? formatDate(device.last_seen_at) : 'Jamais découverte'}
                                </td>
                                <td className="py-2.5 px-4 text-xs">
                                  <div
                                    className={
                                      device.connectivity_status === 'reachable'
                                        ? 'text-emerald-300'
                                        : device.connectivity_status === 'unreachable'
                                        ? 'text-red-300'
                                        : 'text-slate-500'
                                    }>
                                    {connectivityLabel(device)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {device.last_connectivity_check_at ? formatDate(device.last_connectivity_check_at) : '—'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => { setEditDevice(device); setShowModal(true) }}
                                      className="w-7 h-7 rounded bg-white/[0.02]"
                                      title="Modifier l'équipement">
                                      <Edit className="w-3.5 h-3.5 text-blue-400" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="Vérifier la connexion SSH"
                                      loading={testing === device.id}
                                      onClick={() => handleTest(device.id)}
                                      className="w-7 h-7 rounded bg-white/[0.02]">
                                      <Plug className="w-3.5 h-3.5 text-emerald-400" />
                                    </Button>
                                    {confirmDeleteId === device.id ? (
                                      <div className="flex items-center bg-red-500/10 rounded border border-red-500/20 px-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => { deleteMutation.mutate(device.id); setConfirmDeleteId(null) }}
                                          className="text-red-400 hover:text-red-300 p-0.5 text-xs font-bold">
                                          OK
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="text-slate-400 hover:text-slate-300 p-0.5 text-xs">
                                          X
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setConfirmDeleteId(device.id)}
                                        className="w-7 h-7 rounded bg-white/[0.02]"
                                        title="Supprimer">
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {secDevices.length === 0 && (
                            <tr>
                              <td colSpan={8} className="text-center py-6 text-xs text-slate-500 italic">
                                Aucun équipement dans ce groupe.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="bg-slate-900/40 rounded-2xl border border-white/[0.05] p-12 text-center">
                <p className="text-slate-400 font-medium">
                  {isError ? 'Inventaire indisponible.' : 'Aucun équipement correspondant à vos critères.'}
                </p>
                <p className="text-slate-600 text-sm mt-1">
                  {isError ? 'Vérifiez la base locale ou réessayez.' : 'Ajustez votre recherche ou vos filtres.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit / Add Device Modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditDevice(null) }}
        title={editDevice?.id ? 'Modifier équipement' : 'Ajouter équipement'}>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editDevice!) }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Adresse IP *"
              value={editDevice?.ip || ''}
              required
              onChange={e => setEditDevice(d => ({ ...d, ip: e.target.value }))}
            />
            <Input
              label="Hostname"
              value={editDevice?.hostname || ''}
              onChange={e => setEditDevice(d => ({ ...d, hostname: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Groupe d'appartenance"
              value={editDevice?.group_id || ''}
              options={groupOptionsForDevice}
              onChange={e => {
                const gid = e.target.value
                const gname = (groups as DeviceGroup[]).find(g => g.id === gid)?.name || ''
                setEditDevice(d => ({ ...d, group_id: gid, group_name: gname }))
              }}
            />
            <Select
              label="Constructeur"
              value={editDevice?.vendor || 'unknown'}
              options={vendorOptions}
              onChange={e => setEditDevice(d => ({ ...d, vendor: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Modèle"
              value={editDevice?.model || ''}
              onChange={e => setEditDevice(d => ({ ...d, model: e.target.value }))}
            />
            <Input
              label="Port SSH"
              type="number"
              value={editDevice?.ssh_port || 22}
              onChange={e => setEditDevice(d => ({ ...d, ssh_port: parseInt(e.target.value) || 22 }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Emplacement / Bâtiment"
              value={editDevice?.location || ''}
              onChange={e => setEditDevice(d => ({ ...d, location: e.target.value }))}
            />
            <Select
              label="Identifiants SSH/SNMP associés"
              value={editDevice?.credential_id || ''}
              options={credOptions}
              onChange={e => setEditDevice(d => ({ ...d, credential_id: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending} className="px-6">Sauvegarder</Button>
          </div>
        </form>
      </Modal>

      {/* Group Manager Modal */}
      <Modal
        open={showGroupManager}
        onClose={() => {
          setShowGroupManager(false)
          setEditingGroup(null)
          setNewGroupName('')
          setNewGroupDesc('')
        }}
        title="Gestion des groupes d'équipements"
        size="lg">
        <div className="space-y-6">
          {/* Create or Edit Group Form */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-white/[0.05] space-y-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-blue-400" />
              {editingGroup ? `Renommer le groupe « ${editingGroup.name} »` : 'Créer un nouveau groupe'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Nom du groupe *"
                placeholder="Ex : Lycée Victor Hugo, Bâtiment C, Site Nord"
                value={editingGroup ? editingGroup.name : newGroupName}
                onChange={e => {
                  if (editingGroup) setEditingGroup({ ...editingGroup, name: e.target.value })
                  else setNewGroupName(e.target.value)
                }}
              />
              <Input
                label="Description"
                placeholder="Ex : 2ème étage, armoire réseau brassage"
                value={editingGroup ? editingGroup.description || '' : newGroupDesc}
                onChange={e => {
                  if (editingGroup) setEditingGroup({ ...editingGroup, description: e.target.value })
                  else setNewGroupDesc(e.target.value)
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {editingGroup && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingGroup(null)}>
                  Annuler modification
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                loading={saveGroupMutation.isPending}
                disabled={!(editingGroup ? editingGroup.name.trim() : newGroupName.trim())}
                onClick={() => {
                  if (editingGroup) {
                    saveGroupMutation.mutate(editingGroup)
                  } else {
                    saveGroupMutation.mutate({ name: newGroupName.trim(), description: newGroupDesc.trim() })
                  }
                }}>
                {editingGroup ? 'Mettre à jour' : 'Ajouter le groupe'}
              </Button>
            </div>
          </div>

          {/* Existing Groups List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Groupes configurés</h4>
            <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.05] bg-slate-900/40 overflow-hidden">
              {(groups as DeviceGroup[]).map(g => {
                const count = (devices as Device[]).filter(d => d.group_id === g.id).length
                return (
                  <div key={g.id} className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <Folder className="w-5 h-5 text-blue-400 shrink-0" />
                      <div>
                        <div className="text-sm font-bold text-slate-200">{g.name}</div>
                        {g.description && <div className="text-xs text-slate-500">{g.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                        {count} équipement{count > 1 ? 's' : ''}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingGroup(g)}
                        className="w-7 h-7 text-slate-400 hover:text-blue-400"
                        title="Éditer">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteGroupMutation.mutate(g.id)}
                        className="w-7 h-7 text-slate-400 hover:text-red-400"
                        title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
              {(groups as DeviceGroup[]).length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  Aucun groupe personnalisé pour le moment. Créez-en un ci-dessus.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-white/[0.04]">
            <Button onClick={() => setShowGroupManager(false)}>Fermer</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Assign Group Modal */}
      <Modal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={`Assigner ${selectedDeviceIds.length} équipement(s) à un groupe`}>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Choisissez le groupe de destination pour les {selectedDeviceIds.length} équipements sélectionnés.
          </p>

          <Select
            label="Groupe de destination"
            value={selectedTargetGroupId}
            options={[
              { value: '', label: '— Déplacer vers « Non classés » —' },
              ...(groups as DeviceGroup[]).map(g => ({ value: g.id, label: g.name })),
            ]}
            onChange={e => setSelectedTargetGroupId(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <Button variant="ghost" onClick={() => setShowAssignModal(false)}>Annuler</Button>
            <Button
              variant="primary"
              loading={assignGroupMutation.isPending}
              onClick={() => {
                assignGroupMutation.mutate({
                  deviceIds: selectedDeviceIds,
                  groupId: selectedTargetGroupId,
                })
              }}>
              Appliquer l'affectation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
