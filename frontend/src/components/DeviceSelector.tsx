import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Input from './Input'
import { getBackend } from '../lib/backend'

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
}

const sourceLabels: Record<DeviceSource, string> = {
  inventory: 'Inventaire',
  last_scan: 'Dernier scan',
  manual: 'Saisie manuelle',
}

function parseIPs(value: string) {
  return [...new Set(value.split(/[\n,;]+/).map(ip => ip.trim()).filter(Boolean))]
}

export default function DeviceSelector({ value, onChange, manualDescription }: DeviceSelectorProps) {
  const [search, setSearch] = useState('')
  const [manualText, setManualText] = useState(value.manualIPs.join('\n'))
  const { data: inventory = [], isFetched: inventoryFetched } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const backend = await getBackend(); return backend.GetDevices() },
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
    return sourceDevices.filter(device => [device.ip, device.hostname, device.vendor, device.model]
      .some(field => field?.toLowerCase().includes(query)))
  }, [search, sourceDevices])

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
            <Input label="Rechercher" value={search} onChange={event => setSearch(event.target.value)} placeholder="IP, hostname, constructeur..." className="w-64" />
            <button type="button" onClick={toggleVisible} disabled={visibleDevices.length === 0}
              className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300 disabled:cursor-not-allowed disabled:text-slate-600">
              {everyVisibleSelected ? 'Désélectionner les résultats' : 'Sélectionner les résultats'}
            </button>
          </div>
          <p className="text-xs font-semibold tracking-wide text-slate-300" aria-live="polite">
            {selectedCount} équipement{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.04] bg-slate-950/30 p-2 custom-scrollbar">
            {visibleDevices.map(device => (
              <label key={device.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${value.deviceIds.includes(device.id) ? 'bg-blue-500/10 text-slate-100' : 'text-slate-400 hover:bg-white/[0.03]'}`}>
                <input type="checkbox" checked={value.deviceIds.includes(device.id)} onChange={() => toggleDevice(device.id)} className="h-4 w-4 accent-blue-500" />
                <span className="min-w-0 flex-1 truncate">{device.hostname || device.ip}</span>
                {device.hostname && <span className="font-mono text-xs text-slate-500">{device.ip}</span>}
                {device.vendor && <span className="text-xs text-slate-500">{device.vendor}</span>}
              </label>
            ))}
            {sourceFetched && visibleDevices.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">Aucun équipement correspondant.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
