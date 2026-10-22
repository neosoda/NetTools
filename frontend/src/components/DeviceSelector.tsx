import { useEffect, useMemo, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import Input from './Input'
import { getBackend } from '../lib/backend'
import { DeviceGroup } from '../types/models'

export type DeviceSource = 'inventory' | 'last_scan' | 'manual'

export interface DeviceSelection {
  source: DeviceSource
  deviceIds: string[]
  manualIPs: string[]
}

interface DeviceSelectorProps {
  value: DeviceSelection
  onChange: (selection: DeviceSelection) => void
  manualDescription: string
}

interface SelectableDevice {
  id: string
  ip: string
  hostname?: string
  vendor?: string
  model?: string
  group_id?: string
  group_name?: string
}

const sourceLabels: Record<DeviceSource, string> = {
  inventory: 'Inventaire',
  last_scan: 'Dernier scan',
  manual: 'Saisie manuelle',
}

function parseIPs(value: string) {
  return [...new Set(value.split(/[\n,;]+/).map(ip => ip.trim()).filter(Boolean))]
}

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

export default function DeviceSelector({ value, onChange, manualDescription }: DeviceSelectorProps) {
  const [search, setSearch] = useState('')
  const [manualText, setManualText] = useState(value.manualIPs.join('\n'))
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const { data: inventory = [], isFetched: inventoryFetched } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const backend = await getBackend(); return backend.GetDevices() },
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['device-groups'],
    queryFn: async () => { const backend = await getBackend(); return backend.GetDeviceGroups() },
  })
  const { data: lastScan = [], isFetched: lastScanFetched } = useQuery({
    queryKey: ['last-scan-devices'],
    queryFn: async () => { const backend = await getBackend(); return backend.GetLastScanDevices() },
  })

  const sourceDevices = (value.source === 'inventory' ? inventory : lastScan) as SelectableDevice[]
  const sourceFetched = value.source === 'inventory' ? inventoryFetched : lastScanFetched

  const visibleDevices = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sourceDevices
    return sourceDevices.filter(device => [device.ip, device.hostname, device.vendor, device.model, device.group_name]
      .some(field => field?.toLowerCase().includes(query)))
  }, [search, sourceDevices])

  // Group visible devices by group_id
  const groupedSections = useMemo(() => {
    if (value.source !== 'inventory') {
      return [{ id: 'all', name: 'Équipements', devices: visibleDevices }]
    }

    const map = new Map<string, { id: string; name: string; devices: SelectableDevice[] }>()
    
    // Register known custom groups
    for (const g of (groups as DeviceGroup[])) {
      map.set(g.id, { id: g.id, name: g.name, devices: [] })
    }
    // "Non classés"
    map.set('__unassigned__', { id: '__unassigned__', name: 'Non classés', devices: [] })

    // Distribute devices
    for (const dev of visibleDevices) {
      const gid = dev.group_id && map.has(dev.group_id) ? dev.group_id : '__unassigned__'
      map.get(gid)!.devices.push(dev)
    }

    // Only return groups that have matching devices or all if no search filter
    const result: { id: string; name: string; devices: SelectableDevice[] }[] = []
    for (const g of (groups as DeviceGroup[])) {
      const section = map.get(g.id)
      if (section && (section.devices.length > 0 || !search.trim())) {
        result.push(section)
      }
    }
    const unassigned = map.get('__unassigned__')
    if (unassigned && (unassigned.devices.length > 0 || !search.trim())) {
      result.push(unassigned)
    }

    return result
  }, [value.source, groups, visibleDevices, search])

  useEffect(() => {
    if (value.source === 'manual' || !sourceFetched) return
    const available = new Set(sourceDevices.map(device => device.id))
    const validIDs = value.deviceIds.filter(id => available.has(id))
    if (validIDs.length !== value.deviceIds.length) {
      onChange({ ...value, deviceIds: validIDs })
    }
  }, [onChange, sourceDevices, sourceFetched, value])

  const setSource = (source: DeviceSource) => {
    setSearch('')
    if (source === 'manual') {
      onChange({ ...value, source, deviceIds: [] })
      return
    }
    onChange({ ...value, source, deviceIds: [] })
  }

  const toggleDevice = (id: string) => {
    const selected = value.deviceIds.includes(id)
    onChange({ ...value, deviceIds: selected ? value.deviceIds.filter(current => current !== id) : [...value.deviceIds, id] })
  }

  const toggleGroup = (groupDevices: SelectableDevice[]) => {
    const groupIds = groupDevices.map(d => d.id)
    const allSelected = groupIds.length > 0 && groupIds.every(id => value.deviceIds.includes(id))
    if (allSelected) {
      onChange({ ...value, deviceIds: value.deviceIds.filter(id => !groupIds.includes(id)) })
    } else {
      onChange({ ...value, deviceIds: [...new Set([...value.deviceIds, ...groupIds])] })
    }
  }

  const toggleVisible = () => {
    const visibleIDs = visibleDevices.map(device => device.id)
    const everyVisibleSelected = visibleIDs.length > 0 && visibleIDs.every(id => value.deviceIds.includes(id))
    onChange({
      ...value,
      deviceIds: everyVisibleSelected
        ? value.deviceIds.filter(id => !visibleIDs.includes(id))
        : [...new Set([...value.deviceIds, ...visibleIDs])],
    })
  }

  const selectAll = () => {
    onChange({ ...value, deviceIds: sourceDevices.map(d => d.id) })
  }

  const deselectAll = () => {
    onChange({ ...value, deviceIds: [] })
  }

  const toggleCollapseGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const updateManualIPs = (text: string) => {
    setManualText(text)
    onChange({ ...value, manualIPs: parseIPs(text) })
  }

  const selectedCount = value.source === 'manual' ? value.manualIPs.length : value.deviceIds.length
  const everyVisibleSelected = visibleDevices.length > 0 && visibleDevices.every(device => value.deviceIds.includes(device.id))

  return (
    <section className="space-y-4" aria-label="Sélection des équipements">
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.04] bg-slate-950/50 p-1 w-fit">
        {(Object.keys(sourceLabels) as DeviceSource[]).map(source => (
          <button key={source} type="button" onClick={() => setSource(source)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${value.source === source ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {sourceLabels[source]}
          </button>
        ))}
      </div>

      {value.source === 'manual' ? (
        <div className="space-y-2">
          <label className="block text-xs font-semibold tracking-wide text-slate-300" htmlFor="manual-device-ips">
            Adresses IP, séparées par une ligne, une virgule ou un point-virgule
          </label>
          <textarea id="manual-device-ips" value={manualText} onChange={event => updateManualIPs(event.target.value)}
            placeholder={'192.168.1.1\n192.168.1.2'} rows={3}
            className="w-full resize-none rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 font-mono text-xs text-slate-200 shadow-inner transition-colors hover:border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <p className="text-xs text-slate-500">{manualDescription}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Input label="Rechercher" value={search} onChange={event => setSearch(event.target.value)} placeholder="IP, hostname, constructeur, groupe..." className="w-64" />
            <div className="flex items-center gap-3">
              <button type="button" onClick={selectAll} disabled={sourceDevices.length === 0}
                className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50">
                Tout sélectionner ({sourceDevices.length})
              </button>
              <span className="text-slate-600">|</span>
              <button type="button" onClick={deselectAll} disabled={value.deviceIds.length === 0}
                className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50">
                Tout désélectionner
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs bg-slate-900/40 px-3 py-1.5 rounded-lg border border-white/[0.04]">
            <span className="font-semibold text-slate-300" aria-live="polite">
              <span className="text-blue-400 font-bold">{selectedCount}</span> équipement{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''} sur {sourceDevices.length}
            </span>
            {search.trim() && (
              <button type="button" onClick={toggleVisible} disabled={visibleDevices.length === 0}
                className="text-blue-400 hover:text-blue-300">
                {everyVisibleSelected ? 'Désélectionner filtrés' : 'Sélectionner filtrés'} ({visibleDevices.length})
              </button>
            )}
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/[0.04] bg-slate-950/30 p-2 custom-scrollbar">
            {groupedSections.map(section => {
              const secDevices = section.devices
              const secSelected = secDevices.filter(d => value.deviceIds.includes(d.id))
              const isAllSecSelected = secDevices.length > 0 && secSelected.length === secDevices.length
              const isIndeterminate = secSelected.length > 0 && secSelected.length < secDevices.length
              const isCollapsed = Boolean(collapsedGroups[section.id])

              return (
                <div key={section.id} className="rounded-lg border border-white/[0.04] bg-slate-900/30 overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-950/50 hover:bg-slate-900/60 transition-colors">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCollapseGroup(section.id)}
                        className="text-slate-400 hover:text-slate-200 p-0.5"
                        title={isCollapsed ? 'Déplier' : 'Replier'}>
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <IndeterminateCheckbox
                        checked={isAllSecSelected}
                        indeterminate={isIndeterminate}
                        onChange={() => toggleGroup(secDevices)}
                        title={`Sélectionner/Désélectionner tout ${section.name}`}
                        aria-label={`Sélectionner ${section.name}`}
                      />
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-blue-400" />
                        {section.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-full">
                      {secSelected.length}/{secDevices.length}
                    </span>
                  </div>

                  {/* Devices in this group */}
                  {!isCollapsed && (
                    <div className="p-1 space-y-0.5">
                      {secDevices.map(device => {
                        const isSelected = value.deviceIds.includes(device.id)
                        return (
                          <label
                            key={device.id}
                            className={`flex cursor-pointer items-center gap-3 rounded px-2.5 py-1.5 text-xs transition-colors ${
                              isSelected ? 'bg-blue-500/10 text-slate-100 font-medium' : 'text-slate-400 hover:bg-white/[0.03]'
                            }`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleDevice(device.id)}
                              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-blue-500"
                            />
                            <span className="font-mono text-blue-400">{device.ip}</span>
                            <span className="min-w-0 flex-1 truncate text-slate-300">
                              {device.hostname || <span className="text-slate-600 italic">Sans nom</span>}
                            </span>
                            {device.vendor && (
                              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">
                                {device.vendor}
                              </span>
                            )}
                          </label>
                        )
                      })}
                      {secDevices.length === 0 && (
                        <p className="px-3 py-1.5 text-[11px] text-slate-600 italic">Aucun équipement</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {sourceFetched && visibleDevices.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Aucun équipement correspondant à la recherche.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
