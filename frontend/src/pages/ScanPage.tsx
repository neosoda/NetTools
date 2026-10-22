import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Radio, Play, Square, FileSpreadsheet, Network, Layers, Cpu, Upload, Search, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useGlobalCredential } from '../context/CredentialContext'
import { callBackend } from '../lib/api'
import { getBackend } from '../lib/backend'
import { Device } from '../types/models'


function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}j ${hours}h${String(minutes).padStart(2,'0')}m`
  return `${hours}h${String(minutes).padStart(2,'0')}m`
}

const MAX_SCAN_TARGETS = 1024

function parseIPv4(value: string): number[] | null {
  const parts = value.trim().split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null
  const octets = parts.map(Number)
  return octets.every(octet => octet >= 0 && octet <= 255) ? octets : null
}

function ipv4ToNumber(ip: string) {
  const octets = parseIPv4(ip)
  if (!octets) return null
  return octets.reduce((value, octet) => value * 256 + octet, 0)
}

function numberToIPv4(value: number) {
  return [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join('.')
}

function validatePrefix(value: string) {
  const octets = value.trim().split('.')
  return octets.length === 3 && octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
}

function validateCIDR(value: string): { count: number } | null {
  const [ip, prefixRaw, ...rest] = value.trim().split('/')
  const prefix = Number(prefixRaw)
  if (rest.length > 0 || !parseIPv4(ip) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
  const addresses = 2 ** (32 - prefix)
  return { count: prefix >= 31 ? addresses : addresses - 2 }
}

function parseManualTargets(value: string): { targets: string[]; error?: string } {
  const targets = new Set<string>()
  const tokens = value.split(/[\s,;]+/).map(token => token.trim()).filter(Boolean)
  if (tokens.length === 0) return { targets: [], error: 'Ajoutez au moins une adresse IP ou une plage.' }

  for (const token of tokens) {
    const range = token.split('-').map(part => part.trim())
    if (range.length === 1) {
      const numeric = ipv4ToNumber(range[0])
      if (numeric === null) return { targets: [], error: `Adresse IPv4 invalide : ${token}` }
      targets.add(numberToIPv4(numeric))
    } else if (range.length === 2) {
      const start = ipv4ToNumber(range[0])
      const end = ipv4ToNumber(range[1])
      if (start === null || end === null || start > end) return { targets: [], error: `Plage IPv4 invalide : ${token}` }
      if (end - start + 1 > MAX_SCAN_TARGETS) return { targets: [], error: `La plage ${token} dépasse ${MAX_SCAN_TARGETS} cibles.` }
      for (let current = start; current <= end; current++) targets.add(numberToIPv4(current))
    } else {
      return { targets: [], error: `Cible invalide : ${token}` }
    }
    if (targets.size > MAX_SCAN_TARGETS) return { targets: [], error: `Un scan est limité à ${MAX_SCAN_TARGETS} cibles.` }
  }
  return { targets: [...targets] }
}

// Build IP list for switch range: x.1-95 + x.254
function buildSwitchIPs(prefix: string): string[] {
  const ips: string[] = []
  for (let i = 1; i <= 95; i++) ips.push(`${prefix}.${i}`)
  ips.push(`${prefix}.254`)
  return ips
}

type ScanMode = 'switches' | 'full' | 'cidr' | 'targets'
type ScanSummary = { found: number; responded: number; no_response: number; processed: number }

export default function ScanPage() {
  const { globalCredId } = useGlobalCredential()
  const navigate = useNavigate()
  const [scanMode, setScanMode] = useState<ScanMode>('switches')
  const [prefix, setPrefix] = useState('192.168.1')  // base prefix for switches/full modes
  const [cidr, setCidr] = useState('192.168.1.0/24')
  const [manualTargets, setManualTargets] = useState('')
  const [community, setCommunity] = useState('public')
  const [workers, setWorkers] = useState('10')
  const [timeout, setTimeoutVal] = useState('3')
  const [scanning, setScanning] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isCancelled, setIsCancelled] = useState(false)
  const [progress, setProgress] = useState<{ ip: string; done: number; total: number; percent: number } | null>(null)
  const [results, setResults] = useState<Device[]>([])
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null)
  const [scanDone, setScanDone] = useState(false)
  const [error, setError] = useState('')
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [resultSearch, setResultSearch] = useState('')
  const [resultSort, setResultSort] = useState<'ip' | 'hostname' | 'vendor'>('ip')
  const resultDeviceIds = useRef<string[]>([])
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub1 = EventsOn('scan:progress', (data: any) => setProgress(data))
    const unsub2 = EventsOn('scan:complete', (data: ScanSummary) => { setScanSummary(data); setScanning(false); setProgress(null) })
    const unsub3 = EventsOn('tasks:stopped', () => { setScanning(false); setProgress(null) })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  const visibleResults = useMemo(() => {
    const query = resultSearch.trim().toLowerCase()
    const filtered = query
      ? results.filter(device => [device.ip, device.hostname, device.vendor, device.model, device.location, device.contact, device.os_version].some(value => value?.toLowerCase().includes(query)))
      : results
    return [...filtered].sort((left, right) => {
      if (resultSort === 'ip') return (ipv4ToNumber(left.ip) ?? 0) - (ipv4ToNumber(right.ip) ?? 0)
      return (left[resultSort] || '').localeCompare(right[resultSort] || '', 'fr')
    })
  }, [results, resultSearch, resultSort])

  const handleScan = async () => {
    setError('')
    const safeWorkers = Number(workers)
    const safeTimeout = Number(timeout)
    let scanCidr = ''
    let ipList: string[] = []

    if (scanMode === 'switches') {
      if (!validatePrefix(prefix)) { setError('Préfixe IPv4 requis (ex. 192.168.1).'); return }
      ipList = buildSwitchIPs(prefix.trim())
    } else if (scanMode === 'full') {
      if (!validatePrefix(prefix)) { setError('Préfixe IPv4 requis (ex. 192.168.1).'); return }
      scanCidr = `${prefix.trim()}.0/24`
    } else if (scanMode === 'cidr') {
      const cidrInfo = validateCIDR(cidr)
      if (!cidrInfo) { setError('CIDR IPv4 invalide (ex. 10.0.0.0/24).'); return }
      if (cidrInfo.count > MAX_SCAN_TARGETS) { setError(`Le CIDR contient ${cidrInfo.count} cibles. Limite : ${MAX_SCAN_TARGETS}.`); return }
      scanCidr = cidr.trim()
    } else {
      const parsed = parseManualTargets(manualTargets)
      if (parsed.error) { setError(parsed.error); return }
      ipList = parsed.targets
    }
    if (!Number.isInteger(safeWorkers) || safeWorkers < 1 || safeWorkers > 50) { setError('Le nombre de workers doit être compris entre 1 et 50.'); return }
    if (!Number.isInteger(safeTimeout) || safeTimeout < 1 || safeTimeout > 30) { setError('Le timeout doit être compris entre 1 et 30 secondes.'); return }

    setScanning(true)
    setScanDone(false)
    setResults([])
    setScanSummary(null)
    resultDeviceIds.current = []

    try {
      const m = await getBackend()
      const discovered = await callBackend(() => m.ScanNetwork({
        cidr: scanCidr,
        ip_list: ipList,
        community: globalCredId ? '' : (community.trim() || 'public'),
        credential_id: globalCredId,
        workers: safeWorkers,
        timeout_sec: safeTimeout,
      }))
      const devs = (discovered || []) as Device[];
      setResults(devs)
      resultDeviceIds.current = devs.map(d => d.id)
      setScanDone(true)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const handleTargetImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const content = await file.text()
      setManualTargets(previous => [previous, content].filter(Boolean).join('\n'))
    } catch {
      setError('Impossible de lire le fichier de cibles.')
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    const m = await getBackend()
    await callBackend(() => m.CancelScan())
  }

  const handleTest = async () => {
    if (!testIp.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const m = await getBackend()
      const r = globalCredId
        ? await callBackend(() => m.TestSNMPHostWithCredential(testIp.trim(), globalCredId, parseInt(timeout)))
        : await callBackend(() => m.TestSNMPHost(testIp.trim(), community.trim() || 'public', 'v2c', parseInt(timeout)))
      setTestResult(r)
    } catch (e: any) {
      setTestResult({ reachable: false, error: e?.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const m = await getBackend()
      await callBackend(() => m.ExportScanToExcel(resultDeviceIds.current))
    } catch (e: any) {
      setError('Export Excel : ' + (e?.message || String(e)))
    } finally {
      setExporting(false)
    }
  }

  const scanModeDesc: Record<ScanMode, string> = {
    switches: `Switches : ${prefix}.1-95 + ${prefix}.254 (${96} IPs)`,
    full: `Complet : ${prefix}.0/24 (254 cibles)`,
    cidr: 'Plage CIDR personnalisée',
    targets: 'Adresses IPv4, plages et import de liste',
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Découverte réseau" description="Scan SNMP v2c/v3 de plages IP" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Config */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Configuration du scan
            </h2>
            {/* Mode selector */}
            <div className="flex bg-slate-950/50 rounded-xl p-1 border border-white/[0.02]">
              <button onClick={() => setScanMode('switches')}
                title="Espace switches : x.1-95 + x.254"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'switches' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Cpu className="w-3.5 h-3.5" /> Switches
              </button>
              <button onClick={() => setScanMode('full')}
                title="Scan complet /24"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'full' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Layers className="w-3.5 h-3.5" /> Complet
              </button>
              <button onClick={() => setScanMode('cidr')}
                title="CIDR personnalisé"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'cidr' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Network className="w-3.5 h-3.5" /> CIDR
              </button>
              <button onClick={() => setScanMode('targets')}
                title="Liste ou plage d'adresses IPv4"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'targets' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Upload className="w-3.5 h-3.5" /> Liste
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-end relative z-10 w-full">
            {scanMode === 'cidr' ? (
              <Input label="CIDR / Plage IP" value={cidr} onChange={e => setCidr(e.target.value)}
                placeholder="10.0.0.0/24" className="w-full" />
            ) : scanMode === 'targets' ? (
              <div className="md:col-span-2 xl:col-span-2">
                <label htmlFor="manual-targets" className="block text-xs font-semibold text-slate-300 tracking-wide mb-1.5">Adresses et plages IPv4</label>
                <textarea id="manual-targets" value={manualTargets} onChange={event => setManualTargets(event.target.value)} rows={3}
                  placeholder={'192.168.1.10\n192.168.1.20-192.168.1.30'}
                  className="w-full resize-y bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                <div className="mt-2 flex items-center gap-3">
                  <input ref={importRef} type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleTargetImport} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Importer un fichier
                  </Button>
                  <p className="text-[11px] text-slate-500">Une adresse ou plage par ligne ; doublons retirés. Maximum {MAX_SCAN_TARGETS} cibles.</p>
                </div>
              </div>
            ) : (
              <div className="w-full">
                <Input label="Préfixe réseau (3 octets)" value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="192.168.1" className="w-full" />
                <p className="text-[11px] font-medium text-slate-500 mt-1.5 ml-1">{scanModeDesc[scanMode]}</p>
              </div>
            )}
            <Input label={globalCredId ? 'Communauté gérée par le credential' : 'Communauté SNMP'} type="password"
              value={community} onChange={e => setCommunity(e.target.value)} disabled={!!globalCredId}
              placeholder="public" className="w-full" />
            <Input label="Timeout (s)" type="number" min="1" max="30"
              value={timeout} onChange={e => setTimeoutVal(e.target.value)} className="w-full" />
            <Input label="Workers" type="number" min="1" max="50"
              value={workers} onChange={e => setWorkers(e.target.value)} className="w-full" />
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/[0.04] relative z-10">
            <div>
              {globalCredId ? (
                <p className="text-xs font-medium text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  Credential actif utilisé pour l'authentification
                </p>
              ) : <div />}
              {error && <p className="text-sm font-medium text-red-400 mt-2 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />{error}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              {scanning && (
                <Button variant="danger" disabled={isStopping} onClick={handleStop}>
                  <Square className="w-4 h-4 fill-current" /> {isStopping ? 'Arrêt demandé…' : 'Arrêter'}
                </Button>
              )}
              <Button variant="primary" loading={scanning} onClick={handleScan} className="px-8 shadow-blue-500/25">
                <Play className="w-4 h-4" /> {scanning ? 'Scan en cours...' : 'Lancer le scan'}
              </Button>
            </div>
          </div>
        </div>

        {isCancelled && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Scan interrompu par l'utilisateur. Les équipements découverts jusqu'à l'arrêt sont conservés ci-dessous.</span>
          </div>
        )}

        {/* Progress */}
        {scanning && progress && (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/[0.02]" />
            <div className="flex items-center justify-between text-sm mb-3 relative z-10">
              <span className="text-slate-300 font-medium flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                Dernière cible : <span className="text-blue-400 font-mono tracking-wider">{progress.ip}</span>
              </span>
              <span className="text-slate-400 font-mono text-xs">{progress.done} / {progress.total} <span className="text-blue-400 ml-2 font-bold">{progress.percent}%</span></span>
            </div>
            <div className="h-1.5 bg-slate-950/50 rounded-full overflow-hidden shadow-inner relative z-10">
              <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-300 relative"
                style={{ width: `${progress.percent}%` }}>
                <div className="absolute inset-0 bg-white/20" />
              </div>
            </div>
          </div>
        )}

        {/* Single IP test */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-lg">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Test unitaire & Diagnostic
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end max-w-2xl">
            <div className="flex-1">
              <Input label="Tester une IP spécifique" value={testIp} onChange={e => setTestIp(e.target.value)}
                placeholder="192.168.1.1" />
            </div>
            <Button variant="outline" loading={testing} onClick={handleTest} className="px-6 sm:mb-1">
              Test ciblé
            </Button>
          </div>
          {testResult && (
            <div className={`mt-4 rounded-xl p-4 text-xs font-mono space-y-1.5 shadow-inner ${testResult.reachable ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-red-950/20 border border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${testResult.reachable ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                <p className={`font-bold tracking-wide ${testResult.reachable ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResult.reachable ? 'RÉPONSE SNMP REÇUE' : 'ÉCHEC DE RÉPONSE SNMP'}
                </p>
              </div>
              {testResult.error && <p className="text-red-300 pl-4 border-l-2 border-red-500/30">Détails : {testResult.error}</p>}
              {testResult.reachable && Object.entries(testResult.data || {}).map(([k, v]: any) => (
                <div key={k} className="flex flex-col pl-4 border-l border-emerald-500/10">
                  <span className="text-slate-500 uppercase tracking-wider text-[10px]">{k}</span>
                  <span className="text-slate-200">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* No results */}
        {scanDone && results.length === 0 && (
          <div className="bg-slate-900/60 backdrop-blur-md border border-amber-500/20 rounded-2xl p-8 text-center text-slate-400 shadow-lg flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Network className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-lg font-semibold text-slate-200 mb-2">Aucun équipement SNMP découvert</p>
            <p className="text-sm text-slate-500 max-w-md">{scanSummary?.no_response
              ? `${scanSummary.no_response} cible${scanSummary.no_response > 1 ? 's' : ''} n’a${scanSummary.no_response > 1 ? 'nt' : ''} donné aucune réponse SNMP.`
              : 'Vérifiez la communauté, le port UDP/161 et l’activation de SNMP sur les cibles.'}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[600px]">
            <div className="px-6 py-4 border-b border-white/[0.04] flex flex-col gap-4 bg-slate-950/40 sticky top-0">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
                    {results.length} SYSTÈMES
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Découverts et analysés</h2>
                    {scanSummary && <p className="text-xs text-slate-500 mt-0.5">{scanSummary.responded} réponse{scanSummary.responded > 1 ? 's' : ''} SNMP ; {scanSummary.no_response} sans réponse SNMP</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => navigate('/backup', { state: { source: 'last_scan', deviceIds: results.map(device => device.id) } })} className="h-8">Sauvegarder les résultats</Button>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/audit', { state: { source: 'last_scan', deviceIds: results.map(device => device.id) } })} className="h-8">Auditer les résultats</Button>
                  <Button variant="outline" size="sm" loading={exporting} onClick={handleExportExcel} className="h-8">
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Exporter le rapport
                  </Button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input value={resultSearch} onChange={event => setResultSearch(event.target.value)} placeholder="Rechercher IP, nom, modèle, localisation…"
                    className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                </div>
                <select aria-label="Trier les résultats" value={resultSort} onChange={event => setResultSort(event.target.value as typeof resultSort)}
                  className="bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                  <option value="ip">Trier par IP</option>
                  <option value="hostname">Trier par nom</option>
                  <option value="vendor">Trier par constructeur</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="text-left py-3 px-5 font-bold">Adresse IP</th>
                    <th className="text-left py-3 px-5 font-bold">Hostname</th>
                    <th className="text-left py-3 px-5 font-bold">Info Matériel</th>
                    <th className="text-left py-3 px-5 font-bold">OS / Firmware</th>
                    <th className="text-left py-3 px-5 font-bold">Uptime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {visibleResults.map((d: Device) => (
                    <tr key={d.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 px-5">
                        <span className="font-mono text-blue-400 font-medium bg-blue-500/5 px-2 py-1 rounded-md border border-blue-500/10 group-hover:border-blue-500/30 transition-colors">
                          {d.ip}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-200">
                        {d.hostname || <span className="text-slate-600 italic">Non défini</span>}
                        {(d.location || d.contact) && <div className="text-[11px] text-slate-500 font-normal mt-0.5 max-w-[240px] truncate" title={[d.location, d.contact].filter(Boolean).join(' · ')}>{[d.location, d.contact].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs tracking-wide bg-slate-800 text-slate-300 border border-slate-700 w-max px-2 py-0.5 rounded shadow-sm">
                            {d.vendor || 'Unknown'} <span className="opacity-50 mx-1">/</span> {d.model || 'N/A'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">{d.mac_address || 'Pas de MAC'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-400 font-mono tracking-tight max-w-[250px] truncate" title={d.os_version}>
                        {d.os_version || '—'}
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/10">
                          {formatUptime(d.uptime_seconds)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleResults.length === 0 && <p className="p-6 text-sm text-slate-500">Aucun équipement ne correspond au filtre.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
