import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import {
  Plus, Play, Trash2, FileCode, BookOpen, ChevronDown, ChevronRight, Copy, Terminal, Code,
  Square, AlertTriangle, CheckCircle2, XCircle, Clock, CheckSquare, Folder, RotateCcw,
  Maximize2, ArrowDown
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import StatusBadge from '../components/StatusBadge'
import { getBackend } from '../lib/backend'
import { useGlobalCredential } from '../context/CredentialContext'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import { DeviceGroup } from '../types/models'

// ── Exemples de playbooks prêts à l'emploi ──────────────────────────────────
const PLAYBOOK_TEMPLATES = [
  {
    name: 'Inventaire rapide',
    description: 'Collecte version, uptime et interfaces',
    content: `name: Inventaire rapide
description: Collecte les informations de base de l'équipement
timeout: 60s
steps:
  - name: Version du système
    command: show version
    on_error: continue

  - name: Uptime
    command: show uptime
    on_error: continue

  - name: Interfaces
    command: show interfaces brief
    on_error: continue
`,
  },
  {
    name: 'Vérification sécurité',
    description: 'Contrôle SSH, Telnet, banner, NTP',
    content: `name: Vérification sécurité
description: Vérifie la configuration de sécurité
timeout: 90s
steps:
  - name: Version SSH
    command: show ip ssh
    on_error: continue

  - name: Lignes VTY
    command: show line vty 0 4
    on_error: continue

  - name: Banner
    command: show banner login
    on_error: continue

  - name: NTP
    command: show ntp status
    on_error: continue

  - name: Journalisation
    command: show logging
    on_error: continue
`,
  },
  {
    name: 'Sauvegarde VLAN',
    description: 'Exporte la configuration VLAN',
    content: `name: Sauvegarde VLAN
description: Collecte la configuration VLAN de l'équipement
timeout: 60s
steps:
  - name: Liste des VLANs
    command: show vlan brief
    on_error: continue

  - name: Détail VLANs
    command: show vlan
    on_error: continue

  - name: Interfaces trunk
    command: show interfaces trunk
    on_error: continue
`,
  },
  {
    name: 'Diagnostic réseau',
    description: 'Table ARP, routes, voisins',
    content: `name: Diagnostic réseau
description: Collecte les tables de routage et voisinage
timeout: 90s
steps:
  - name: Collecte ARP
    command: show arp
    on_error: continue

  - name: Table de routage
    command: show ip route
    on_error: continue

  - name: Voisins CDP/LLDP
    command: show cdp neighbors
    on_error: continue

  - name: Statistiques interfaces
    command: show interfaces counters errors
    on_error: continue
`,
  },
]

const GUIDE_SECTIONS = [
  {
    title: "Qu'est-ce qu'un playbook ?",
    content: `Un playbook est une séquence de commandes SSH à exécuter automatiquement sur un ou plusieurs équipements réseau. Il permet d'automatiser des tâches répétitives comme :

• La collecte d'informations (versions, configurations, statistiques)
• Les vérifications de conformité
• L'application de modifications de configuration
• La génération de rapports

Le playbook est défini en YAML, un format texte simple et lisible.`,
  },
  {
    title: "Structure d'un playbook",
    content: `Un playbook YAML contient :

name: Nom du playbook (obligatoire)
description: Description optionnelle
timeout: Délai maximum (ex: 60s, 2m)
steps:
  - name: Nom de l'étape
    command: commande SSH à exécuter
    expect: texte attendu dans la réponse (optionnel)
    on_error: continue | abort

• on_error: continue → passe à l'étape suivante en cas d'échec
• on_error: abort → stoppe le playbook en cas d'échec
• expect → vérifie que la sortie contient un texte précis`,
  },
  {
    title: 'Bonnes pratiques',
    content: `✓ Commencer par "show version" pour confirmer la connexion
✓ Utiliser on_error: continue pour les playbooks de collecte
✓ Utiliser on_error: abort pour les playbooks de configuration
✓ Tester sur un seul équipement avant de lancer en masse
✓ Nommer clairement chaque étape pour faciliter la lecture des résultats
✓ Fixer un timeout adapté (60s pour collecte, 120s pour config)`,
  },
]

// Convert simple commands to YAML playbook format
function commandsToYaml(name: string, description: string, commands: string): string {
  const cmds = commands.split('\n').map(s => s.trim()).filter(Boolean)
  if (cmds.length === 0) return ''
  const steps = cmds.map((cmd, i) => `  - name: Commande ${i + 1}
    command: ${cmd}
    on_error: continue`).join('\n\n')
  return `name: ${name || 'Playbook'}
description: ${description || ''}
timeout: 60s
steps:
${steps}
`
}

function yamlToCommands(yamlContent: string): string {
  const lines = yamlContent.split('\n')
  const commands: string[] = []
  for (const line of lines) {
    const match = line.match(/^\s+command:\s*(.+)$/)
    if (match) commands.push(match[1].trim())
  }
  return commands.join('\n')
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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

type TermLine =
  | { type: 'device'; label: string; ip: string; index: number; total: number }
  | { type: 'step_start'; name: string; command: string; index: number; total: number }
  | { type: 'output'; text: string }
  | { type: 'step_ok'; name: string }
  | { type: 'step_err'; name: string; error: string }
  | { type: 'device_done'; label: string; status: string }
  | { type: 'system'; message: string }

interface DeviceProgressState {
  id: string
  ip: string
  label: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  durationMs?: number
  stepIndex?: number
  totalSteps?: number
  currentStepName?: string
  currentCommand?: string
  error?: string
}

export default function PlaybookPage() {
  const qc = useQueryClient()
  const location = useLocation()
  const { globalCredId } = useGlobalCredential()
  const [showModal, setShowModal] = useState(false)
  const [editPb, setEditPb] = useState<any>(null)
  const [runModal, setRunModal] = useState<any>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [results, setResults] = useState<any[]>([])
  const [termLines, setTermLines] = useState<TermLine[]>([])
  const [activeTab, setActiveTab] = useState<'playbooks' | 'guide'>('playbooks')
  const [openSection, setOpenSection] = useState<number | null>(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [runViewTab, setRunViewTab] = useState<'terminal' | 'recap'>('terminal')
  const [deviceSearch, setDeviceSearch] = useState('')
  const [targetCollapsedGroups, setTargetCollapsedGroups] = useState<Record<string, boolean>>({})
  const [expandedRecapDevice, setExpandedRecapDevice] = useState<string | null>(null)

  // Real-time execution tracking
  const [isStopping, setIsStopping] = useState(false)
  const [isCancelled, setIsCancelled] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentDevice, setCurrentDevice] = useState<{ id: string; ip: string; label: string; index: number; total: number } | null>(null)
  const [currentStep, setCurrentStep] = useState<{ name: string; command: string; index: number; total: number } | null>(null)
  const [deviceStatusMap, setDeviceStatusMap] = useState<Record<string, DeviceProgressState>>({})
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const [progressStats, setProgressStats] = useState({
    total: 0,
    processed: 0,
    success_count: 0,
    failed_count: 0,
    cancelled_count: 0,
    remaining_count: 0,
    percent: 0,
  })

  const termRef = useRef<HTMLDivElement>(null)

  // Simple vs Advanced mode for the editor
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple')
  const [simpleCommands, setSimpleCommands] = useState('')

  // Queries
  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => { const m = await getBackend(); return m.GetPlaybooks() },
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['device-groups'],
    queryFn: async () => { const m = await getBackend(); return m.GetDeviceGroups() },
  })

  // Handle incoming selection from navigation state (e.g. from InventoryPage)
  useEffect(() => {
    if (location.state?.deviceIds && Array.isArray(location.state.deviceIds)) {
      setSelectedDevices(location.state.deviceIds)
    }
  }, [location.state])

  // Timer for elapsed execution time
  useEffect(() => {
    let interval: any = null
    if (runMutation.isPending) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  // Auto-scroll terminal unless user manually scrolled up
  useEffect(() => {
    if (termRef.current && !userScrolledUp) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }, [termLines, userScrolledUp])

  const handleTerminalScroll = () => {
    if (!termRef.current) return
    const { scrollTop, clientHeight, scrollHeight } = termRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30
    setUserScrolledUp(!isAtBottom)
  }

  const resumeAutoScroll = () => {
    setUserScrolledUp(false)
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }

  // Wails Event Listeners
  useEffect(() => {
    const stepHandler = (data: any) => {
      if (data.type === 'device_start') {
        const label = data.device_label || data.device_ip
        setCurrentDevice({
          id: data.device_id,
          ip: data.device_ip,
          label: label,
          index: data.device_index || 0,
          total: data.total_devices || 0,
        })
        setCurrentStep(null)
        setDeviceStatusMap(prev => ({
          ...prev,
          [data.device_id]: {
            ...prev[data.device_id],
            id: data.device_id,
            ip: data.device_ip,
            label: label,
            status: 'running',
          },
        }))
        setTermLines(prev => [
          ...prev,
          {
            type: 'device',
            label: label,
            ip: data.device_ip,
            index: data.device_index || 0,
            total: data.total_devices || 0,
          },
        ])
        return
      }

      if (data.type === 'step_update') {
        if (!data.done) {
          // Step starting
          setCurrentStep({
            name: data.step_name,
            command: data.command,
            index: (data.step_index ?? 0) + 1,
            total: data.total_steps ?? 0,
          })
          setTermLines(prev => [
            ...prev,
            {
              type: 'step_start',
              name: data.step_name,
              command: data.command,
              index: (data.step_index ?? 0) + 1,
              total: data.total_steps ?? 0,
            },
          ])
        } else {
          // Step finished
          if (data.output?.trim()) {
            setTermLines(prev => [...prev, { type: 'output', text: data.output.trim() }])
          }
          if (data.passed) {
            setTermLines(prev => [...prev, { type: 'step_ok', name: data.step_name }])
          } else {
            setTermLines(prev => [
              ...prev,
              { type: 'step_err', name: data.step_name, error: data.error || 'Échec' },
            ])
          }
        }
      }
    }

    const progressHandler = (data: any) => {
      setProgressStats({
        total: data.total ?? 0,
        processed: data.processed ?? 0,
        success_count: data.success_count ?? 0,
        failed_count: data.failed_count ?? 0,
        cancelled_count: data.cancelled_count ?? 0,
        remaining_count: data.remaining_count ?? 0,
        percent: data.percent ?? 0,
      })

      if (data.device_id) {
        setDeviceStatusMap(prev => ({
          ...prev,
          [data.device_id]: {
            ...prev[data.device_id],
            id: data.device_id,
            ip: data.device_ip,
            label: data.device_label || data.device_ip,
            status: data.status,
          },
        }))

        setTermLines(prev => [
          ...prev,
          {
            type: 'device_done',
            label: data.device_label || data.device_ip,
            status: data.status,
          },
        ])
      }
    }

    const stopHandler = (data: any) => {
      setIsStopping(false)
      setIsCancelled(true)
      setTermLines(prev => [
        ...prev,
        {
          type: 'system',
          message: data.message || 'Exécution interrompue par l’utilisateur',
        },
      ])
    }

    EventsOn('playbook:step', stepHandler)
    EventsOn('playbook:progress', progressHandler)
    EventsOn('playbook:stopped', stopHandler)

    return () => {
      EventsOff('playbook:step')
      EventsOff('playbook:progress')
      EventsOff('playbook:stopped')
    }
  }, [])

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (pb: any) => {
      let content = pb.content
      if (editorMode === 'simple' && simpleCommands.trim()) {
        content = commandsToYaml(pb.name, pb.description, simpleCommands)
      }
      const m = await getBackend()
      return m.SavePlaybook({ ...pb, content })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] })
      setShowModal(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const m = await getBackend()
      return m.DeletePlaybook(id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })

  const runMutation = useMutation({
    mutationFn: async () => {
      setTermLines([])
      setResults([])
      setIsStopping(false)
      setIsCancelled(false)
      setElapsedSeconds(0)
      setCurrentDevice(null)
      setCurrentStep(null)
      setUserScrolledUp(false)
      setRunViewTab('terminal')

      // Initialize device status map
      const initialMap: Record<string, DeviceProgressState> = {}
      for (const id of selectedDevices) {
        const d = (devices as any[]).find(x => x.id === id)
        initialMap[id] = {
          id,
          ip: d?.ip || id,
          label: d?.hostname || d?.ip || id,
          status: 'pending',
        }
      }
      setDeviceStatusMap(initialMap)
      setProgressStats({
        total: selectedDevices.length,
        processed: 0,
        success_count: 0,
        failed_count: 0,
        cancelled_count: 0,
        remaining_count: selectedDevices.length,
        percent: 0,
      })

      const m = await getBackend()
      return m.RunPlaybook({
        playbook_id: runModal.id,
        device_ids: selectedDevices,
        credential_id: globalCredId,
      })
    },
    onSuccess: (data: any) => {
      setResults(data || [])
      setIsStopping(false)
      setCurrentDevice(null)
      setCurrentStep(null)
    },
    onError: () => {
      setIsStopping(false)
    },
  })

  const handleStopExecution = async () => {
    setIsStopping(true)
    try {
      const m = await getBackend()
      m.CancelPlaybook()
    } catch (e) {
      console.error('Failed to cancel playbook:', e)
    }
  }

  const handleCopyTemplate = (template: typeof PLAYBOOK_TEMPLATES[0]) => {
    setCopied(template.name)
    setEditPb({ name: template.name, description: template.description, content: template.content })
    setEditorMode('advanced')
    setShowModal(true)
    setTimeout(() => setCopied(null), 2000)
  }

  const openNewSimple = () => {
    setEditorMode('simple')
    setSimpleCommands('')
    setEditPb({ name: '', description: '', content: '' })
    setShowModal(true)
  }

  const openNewAdvanced = () => {
    setEditorMode('advanced')
    setSimpleCommands('')
    setEditPb({ content: PLAYBOOK_TEMPLATES[0].content })
    setShowModal(true)
  }

  const openEdit = (pb: any) => {
    const cmds = yamlToCommands(pb.content || '')
    setSimpleCommands(cmds)
    const hasExpect = (pb.content || '').includes('expect:')
    setEditorMode(hasExpect ? 'advanced' : 'simple')
    setEditPb(pb)
    setShowModal(true)
  }

  const openRunModal = (pb: any) => {
    setRunModal(pb)
    setResults([])
    setTermLines([])
    setIsStopping(false)
    setIsCancelled(false)
    setElapsedSeconds(0)
    setRunViewTab('terminal')
  }

  // Grouped devices for selection inside Run Modal
  const groupedTargetSections = useMemo(() => {
    const query = deviceSearch.trim().toLowerCase()
    const allDevs = devices as any[]
    const matching = query
      ? allDevs.filter(d => [d.ip, d.hostname, d.vendor, d.model, d.group_name].some(f => f?.toLowerCase().includes(query)))
      : allDevs

    const map = new Map<string, { id: string; name: string; devices: any[] }>()
    for (const g of (groups as DeviceGroup[])) {
      map.set(g.id, { id: g.id, name: g.name, devices: [] })
    }
    map.set('__unassigned__', { id: '__unassigned__', name: 'Non classés', devices: [] })

    for (const dev of matching) {
      const gid = dev.group_id && map.has(dev.group_id) ? dev.group_id : '__unassigned__'
      map.get(gid)!.devices.push(dev)
    }

    const res: { id: string; name: string; devices: any[] }[] = []
    for (const g of (groups as DeviceGroup[])) {
      const sec = map.get(g.id)!
      if (sec.devices.length > 0 || !query) res.push(sec)
    }
    const unassigned = map.get('__unassigned__')!
    if (unassigned.devices.length > 0 || !query) res.push(unassigned)

    return res
  }, [devices, groups, deviceSearch])

  const toggleTargetDevice = (id: string) => {
    setSelectedDevices(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleTargetGroup = (groupDevices: any[]) => {
    const gIds = groupDevices.map(d => d.id)
    const allSelected = gIds.length > 0 && gIds.every(id => selectedDevices.includes(id))
    if (allSelected) {
      setSelectedDevices(prev => prev.filter(id => !gIds.includes(id)))
    } else {
      setSelectedDevices(prev => [...new Set([...prev, ...gIds])])
    }
  }

  const selectAllTargets = () => {
    setSelectedDevices((devices as any[]).map(d => d.id))
  }

  const deselectAllTargets = () => {
    setSelectedDevices([])
  }

  const isExecutionActive = runMutation.isPending

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Playbooks SSH"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant={activeTab === 'playbooks' ? 'primary' : 'secondary'} onClick={() => setActiveTab('playbooks')}>
              <FileCode className="w-3.5 h-3.5" /> Mes playbooks
            </Button>
            <Button size="sm" variant={activeTab === 'guide' ? 'primary' : 'secondary'} onClick={() => setActiveTab('guide')}>
              <BookOpen className="w-3.5 h-3.5" /> Guide & Exemples
            </Button>
            {activeTab === 'playbooks' && (
              <div className="flex gap-1">
                <Button variant="primary" onClick={openNewSimple}>
                  <Terminal className="w-4 h-4" /> Commandes rapides
                </Button>
                <Button variant="secondary" onClick={openNewAdvanced}>
                  <Code className="w-4 h-4" /> YAML avancé
                </Button>
              </div>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'playbooks' ? (
          <div className="space-y-4">
            {/* Playbook grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 content-start">
              {(playbooks as any[]).map((pb: any) => (
                <div key={pb.id} className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:bg-slate-900/60 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />

                  <div className="relative z-10">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <h3 className="font-bold text-slate-200 truncate">{pb.name}</h3>
                        {pb.description && <p className="text-xs text-slate-500 truncate mt-0.5" title={pb.description}>{pb.description}</p>}
                      </div>
                    </div>

                    <pre className="text-[10px] text-slate-400 bg-slate-950/60 border border-slate-800/60 p-3 rounded-xl overflow-hidden max-h-28 font-mono shadow-inner custom-scrollbar mb-5 relative">
                      <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-800/80 rounded-bl-lg text-[9px] uppercase tracking-wider font-bold text-slate-500">YAML</div>
                      {pb.content}
                    </pre>

                    <div className="flex justify-between items-center pt-4 border-t border-white/[0.04]">
                      <Button size="sm" variant="primary" onClick={() => openRunModal(pb)} className="shadow-indigo-500/20 px-4">
                        <Play className="w-3.5 h-3.5" /> Exécuter
                      </Button>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(pb)} className="hover:bg-blue-500/10 hover:text-blue-400 w-8 h-8 rounded-lg" title="Éditer">
                          <Code className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(pb.id)} className="hover:bg-red-500/10 hover:text-red-400 w-8 h-8 rounded-lg" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(playbooks as any[]).length === 0 && (
                <div className="col-span-full md:col-span-2 lg:col-span-3">
                  <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl py-16 text-center shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                    <FileCode className="w-16 h-16 mx-auto mb-4 text-slate-600 drop-shadow-md" />
                    <p className="text-lg font-bold text-slate-300 mb-1">Aucun playbook trouvé</p>
                    <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">Automatisez vos tâches réseau en créant des playbooks. Utilisez le mode simple ou écrivez directement en YAML.</p>
                    <div className="flex justify-center gap-3 relative z-10">
                      <Button variant="primary" onClick={openNewSimple} className="shadow-blue-500/25">
                        <Terminal className="w-4 h-4" /> Créer en mode Simple
                      </Button>
                      <Button variant="secondary" onClick={openNewAdvanced}>
                        <Code className="w-4 h-4" /> Créer en mode Avancé
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Guide sections */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-1 shadow-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04] bg-slate-950/40">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Guide des playbooks
                </h2>
              </div>
              <div className="divide-y divide-white/[0.02]">
                {GUIDE_SECTIONS.map((section, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setOpenSection(openSection === i ? null : i)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors group">
                      <span className={`text-sm font-medium transition-colors ${openSection === i ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>{section.title}</span>
                      {openSection === i ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
                    </button>
                    {openSection === i && (
                      <div className="px-6 pb-5 pt-1">
                        <pre className="text-sm text-slate-400 whitespace-pre-wrap font-sans leading-relaxed bg-slate-950/30 p-4 rounded-xl border border-white/[0.02]">
                          {section.content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-lg h-max">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Exemple Commenté
                </h3>
                <pre className="text-[11px] text-slate-400 bg-slate-950/80 p-4 rounded-xl font-mono leading-relaxed border border-white/[0.02] custom-scrollbar overflow-x-auto shadow-inner">{`name: Mon playbook
description: Description de ce que fait ce playbook
timeout: 120s        # Délai max total
executor: netmiko    # Exécution CLI stateful
netmiko_device_type: cisco_ios  # optionnel

steps:
  - name: Vérification connexion
    command: show version
    on_error: abort  # Arrête si pas de connexion

  - name: Création VLAN
    commands:
      - configure terminal
      - vlan 10
      - name USERS
      - end
    on_error: abort

  - name: Vérification NTP
    command: show ntp status
    expect: Clock is synchronized
    on_error: continue`}
                </pre>
              </div>

              {/* Templates */}
              <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-1 shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/[0.04] bg-slate-950/40 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Modèles prêts à l'emploi
                  </h2>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Créer à partir d'un modèle</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
                  {PLAYBOOK_TEMPLATES.map(t => (
                    <div key={t.name} className="bg-slate-950/30 border border-white/[0.04] rounded-xl p-5 hover:border-slate-700 transition-colors group">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{t.name}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.description}</p>
                        </div>
                        <Button size="icon" variant="secondary" onClick={() => handleCopyTemplate(t)} className="w-8 h-8 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Utiliser ce modèle">
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <pre className="text-[10px] text-slate-500 bg-slate-950/80 p-3 rounded-lg font-mono overflow-y-auto max-h-32 custom-scrollbar shadow-inner">
                        {t.content}
                      </pre>
                      {copied === t.name && (
                        <p className="text-xs text-emerald-400 font-bold tracking-wide mt-2 animate-in fade-in">Copié dans l'éditeur !</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Playbook" size="lg">
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editPb) }} className="space-y-3">
          <Input label="Nom *" value={editPb?.name || ''} required
            onChange={e => setEditPb((p: any) => ({ ...p, name: e.target.value }))} />
          <Input label="Description" value={editPb?.description || ''}
            onChange={e => setEditPb((p: any) => ({ ...p, description: e.target.value }))} />

          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            <button type="button" onClick={() => {
              if (editorMode === 'advanced' && editPb?.content) {
                setSimpleCommands(yamlToCommands(editPb.content))
              }
              setEditorMode('simple')
            }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${editorMode === 'simple' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Terminal className="w-3.5 h-3.5" /> Mode simple
            </button>
            <button type="button" onClick={() => {
              if (editorMode === 'simple' && simpleCommands.trim()) {
                setEditPb((p: any) => ({ ...p, content: commandsToYaml(p?.name || '', p?.description || '', simpleCommands) }))
              }
              setEditorMode('advanced')
            }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${editorMode === 'advanced' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Code className="w-3.5 h-3.5" /> Mode avancé (YAML)
            </button>
          </div>

          {editorMode === 'simple' ? (
            <div>
              <label className="text-xs font-medium text-slate-400">
                Commandes SSH (une par ligne) *
              </label>
              <p className="text-xs text-slate-500 mb-1">
                Saisissez les commandes à exécuter, une par ligne. Le playbook YAML sera généré automatiquement.
              </p>
              <textarea value={simpleCommands} onChange={e => setSimpleCommands(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                rows={8} required={!editPb?.content}
                placeholder={"show version\nshow running-config\nshow interfaces brief\nshow vlan brief"} />
              {simpleCommands.trim() && (
                <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-500">
                  {simpleCommands.split('\n').filter(s => s.trim()).length} commande(s) configurée(s)
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-400">Contenu YAML *</label>
              <textarea value={editPb?.content || ''} onChange={e => setEditPb((p: any) => ({ ...p, content: e.target.value }))}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                rows={14} required />
            </div>
          )}

          {saveMutation.error && (
            <p className="text-xs text-red-400">Erreur : {(saveMutation.error as any)?.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>

      {/* Real-time Execution Modal */}
      <Modal
        open={!!runModal}
        onClose={() => {
          if (!isExecutionActive) {
            setRunModal(null)
            setTermLines([])
            setResults([])
          }
        }}
        title={`Exécuter : ${runModal?.name}`}
        size="lg">
        <div className="space-y-4">
          {/* Target Equipment Selector — only shown before launching execution */}
          {!isExecutionActive && termLines.length === 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  placeholder="Filtrer équipements ou groupes..."
                  value={deviceSearch}
                  onChange={e => setDeviceSearch(e.target.value)}
                  className="w-64 py-1.5"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={selectAllTargets}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
                    Tout sélectionner ({(devices as any[]).length})
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={deselectAllTargets}
                    disabled={selectedDevices.length === 0}
                    className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40">
                    Tout désélectionner
                  </button>
                </div>
              </div>

              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900/40 border border-white/[0.04] text-slate-300">
                <span className="text-blue-400 font-bold">{selectedDevices.length}</span> équipement{selectedDevices.length > 1 ? 's' : ''} sélectionné{selectedDevices.length > 1 ? 's' : ''} sur {(devices as any[]).length}
              </div>

              {/* Collapsible groups of devices */}
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-white/[0.04] bg-slate-950/40 p-2 custom-scrollbar">
                {groupedTargetSections.map(section => {
                  const secDevices = section.devices
                  const secSelected = secDevices.filter(d => selectedDevices.includes(d.id))
                  const isAllSecSelected = secDevices.length > 0 && secSelected.length === secDevices.length
                  const isIndeterminate = secSelected.length > 0 && secSelected.length < secDevices.length
                  const isCollapsed = Boolean(targetCollapsedGroups[section.id])

                  return (
                    <div key={section.id} className="rounded-lg border border-white/[0.04] bg-slate-900/30 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/60 hover:bg-slate-900/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTargetCollapsedGroups(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                            className="text-slate-400 hover:text-slate-200 p-0.5">
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <IndeterminateCheckbox
                            checked={isAllSecSelected}
                            indeterminate={isIndeterminate}
                            onChange={() => toggleTargetGroup(secDevices)}
                            title={`Sélectionner tout ${section.name}`}
                            aria-label={`Sélectionner le groupe ${section.name}`}
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

                      {!isCollapsed && (
                        <div className="p-1 space-y-0.5">
                          {secDevices.map(device => {
                            const isSelected = selectedDevices.includes(device.id)
                            return (
                              <label
                                key={device.id}
                                className={`flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1 text-xs transition-colors ${
                                  isSelected ? 'bg-blue-500/10 text-slate-100 font-medium' : 'text-slate-400 hover:bg-white/[0.03]'
                                }`}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleTargetDevice(device.id)}
                                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-blue-500"
                                />
                                <span className="font-mono text-blue-400 text-[11px]">{device.ip}</span>
                                <span className="min-w-0 flex-1 truncate text-slate-300">
                                  {device.hostname || <span className="text-slate-600 italic">Sans nom</span>}
                                </span>
                                {device.vendor && (
                                  <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-800/60 px-1 py-0.2 rounded">
                                    {device.vendor}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Launch Button */}
              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.04]">
                <Button onClick={() => setRunModal(null)}>Annuler</Button>
                <Button
                  variant="primary"
                  disabled={selectedDevices.length === 0}
                  onClick={() => runMutation.mutate()}>
                  <Play className="w-4 h-4" />
                  Lancer l'exécution ({selectedDevices.length} équipement{selectedDevices.length > 1 ? 's' : ''})
                </Button>
              </div>
            </div>
          )}

          {/* Real-time Execution Dashboard (during and after execution) */}
          {(isExecutionActive || termLines.length > 0) && (
            <div className="space-y-3">
              {/* Progress Bar & Header Counters */}
              <div className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-mono text-blue-400">
                      {progressStats.percent}%
                    </span>
                    <div className="text-xs text-slate-400">
                      <span className="text-slate-200 font-bold">{progressStats.processed}</span> sur{' '}
                      <span className="text-slate-200 font-bold">{progressStats.total}</span> traités
                    </div>
                  </div>

                  {/* Badges Counters */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {progressStats.success_count} réussi{progressStats.success_count > 1 ? 's' : ''}
                    </span>

                    {progressStats.failed_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                        <XCircle className="w-3.5 h-3.5" />
                        {progressStats.failed_count} échec{progressStats.failed_count > 1 ? 's' : ''}
                      </span>
                    )}

                    {progressStats.cancelled_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {progressStats.cancelled_count} annulé{progressStats.cancelled_count > 1 ? 's' : ''}
                      </span>
                    )}

                    {progressStats.remaining_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        {progressStats.remaining_count} restant{progressStats.remaining_count > 1 ? 's' : ''}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/60 text-slate-300 border border-white/[0.05] font-mono text-[11px]">
                      <Clock className="w-3 h-3 text-blue-400" />
                      {formatDuration(elapsedSeconds)}
                    </span>
                  </div>

                  {/* Stop / Cancel Action Button */}
                  <div>
                    {isExecutionActive ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isStopping}
                        onClick={handleStopExecution}
                        className="shadow-red-500/30">
                        <Square className="w-3.5 h-3.5 fill-current" />
                        {isStopping ? 'Arrêt demandé…' : 'Arrêter'}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setTermLines([])
                            setResults([])
                            setIsCancelled(false)
                          }}>
                          <RotateCcw className="w-3.5 h-3.5" /> Nouvelle exécution
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRunModal(null)}>
                          Fermer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/[0.05]">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isCancelled
                        ? 'bg-amber-500'
                        : progressStats.failed_count > 0
                        ? 'bg-gradient-to-r from-blue-500 via-amber-500 to-emerald-500'
                        : 'bg-gradient-to-r from-blue-600 to-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, progressStats.percent))}%` }}
                  />
                </div>

                {/* Current Active Target & Step Banner */}
                {isExecutionActive && currentDevice && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-950/60 border border-blue-500/20 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                      <span className="text-slate-400">Équipement en cours :</span>
                      <span className="font-bold text-slate-100">{currentDevice.label}</span>
                      <span className="font-mono text-blue-400 text-[11px]">({currentDevice.ip})</span>
                      <span className="text-slate-500 font-mono">[{currentDevice.index}/{currentDevice.total}]</span>
                    </div>

                    {currentStep && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="text-slate-500">Étape {currentStep.index}/{currentStep.total} :</span>
                        <span className="font-medium text-slate-200">{currentStep.name}</span>
                        <code className="bg-slate-900 border border-slate-700/60 text-blue-400 px-1.5 py-0.5 rounded text-[11px]">
                          $ {currentStep.command}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {/* Cancellation Alert Banner */}
                {isCancelled && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="font-bold">Annulé par l'utilisateur.</span> L'opération a été interrompue proprement. Les résultats partiels obtenus sont conservés ci-dessous.
                    </div>
                  </div>
                )}
              </div>

              {/* View Switcher Tabs (Terminal vs Detailed Recap) */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRunViewTab('terminal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      runViewTab === 'terminal'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}>
                    <Terminal className="w-3.5 h-3.5" />
                    Terminal en direct
                  </button>
                  <button
                    type="button"
                    onClick={() => setRunViewTab('recap')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      runViewTab === 'recap'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}>
                    <CheckSquare className="w-3.5 h-3.5" />
                    Récapitulatif par équipement ({Object.keys(deviceStatusMap).length})
                  </button>
                </div>

                {runViewTab === 'terminal' && userScrolledUp && (
                  <button
                    type="button"
                    onClick={resumeAutoScroll}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1 animate-pulse">
                    <ArrowDown className="w-3 h-3" /> Reprendre défilement
                  </button>
                )}
              </div>

              {/* Tab 1: Terminal output */}
              {runViewTab === 'terminal' && (
                <div className="relative">
                  <div
                    ref={termRef}
                    onScroll={handleTerminalScroll}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 h-84 overflow-y-auto font-mono text-xs space-y-1 shadow-inner custom-scrollbar">
                    {termLines.map((line, i) => {
                      if (line.type === 'device') {
                        return (
                          <div key={i} className="text-cyan-400 font-bold mt-3 first:mt-0 pb-0.5 border-b border-cyan-500/20">
                            ── {line.label} ({line.ip}) [{line.index}/{line.total}] ──
                          </div>
                        )
                      }
                      if (line.type === 'step_start') {
                        return (
                          <div key={i} className="text-slate-400 mt-1">
                            <span className="text-slate-600">[{line.index}/{line.total}]</span>{' '}
                            <span className="text-slate-200 font-semibold">{line.name}</span>
                            <span className="text-blue-400 ml-2">$ {line.command}</span>
                          </div>
                        )
                      }
                      if (line.type === 'output') {
                        return (
                          <pre key={i} className="text-slate-400 pl-4 py-1 whitespace-pre-wrap break-all leading-relaxed bg-slate-900/40 rounded border-l-2 border-slate-700 my-1">
                            {line.text}
                          </pre>
                        )
                      }
                      if (line.type === 'step_ok') {
                        return (
                          <div key={i} className="text-emerald-400 pl-4 font-semibold">
                            ✓ {line.name} (Validé)
                          </div>
                        )
                      }
                      if (line.type === 'step_err') {
                        return (
                          <div key={i} className="text-red-400 pl-4 font-semibold">
                            ✗ {line.name} — {line.error}
                          </div>
                        )
                      }
                      if (line.type === 'device_done') {
                        const ok = line.status === 'success'
                        const isCanc = line.status === 'cancelled'
                        return (
                          <div
                            key={i}
                            className={`mt-1 font-bold pt-1 border-t border-white/[0.04] ${
                              ok ? 'text-emerald-400' : isCanc ? 'text-amber-400' : 'text-red-400'
                            }`}>
                            {ok ? '✓' : isCanc ? '⚠' : '✗'} {line.label} terminé avec statut : {line.status}
                          </div>
                        )
                      }
                      if (line.type === 'system') {
                        return (
                          <div key={i} className="text-amber-400 font-bold p-2 rounded bg-amber-500/10 border border-amber-500/20 my-2">
                            [SYSTÈME] {line.message}
                          </div>
                        )
                      }
                      return null
                    })}
                    {isExecutionActive && (
                      <div className="text-blue-400 animate-pulse font-bold mt-2">▌ Exécution en cours...</div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Detailed Recap Per Equipment */}
              {runViewTab === 'recap' && (
                <div className="space-y-2 max-h-84 overflow-y-auto pr-1 custom-scrollbar">
                  {Object.values(deviceStatusMap).map(dev => {
                    const isExpanded = expandedRecapDevice === dev.id
                    // Look up corresponding result if available
                    const execResult = results.find((r: any) => r.DeviceID === dev.id || r.DeviceIP === dev.ip)

                    return (
                      <div
                        key={dev.id}
                        className="rounded-xl border border-white/[0.05] bg-slate-900/40 overflow-hidden transition-all">
                        <div
                          onClick={() => setExpandedRecapDevice(isExpanded ? null : dev.id)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-slate-400 p-0.5">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <div>
                              <div className="text-sm font-bold text-slate-200">{dev.label}</div>
                              <div className="font-mono text-xs text-blue-400">{dev.ip}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {execResult?.TotalMs != null && (
                              <span className="text-xs text-slate-500 font-mono">
                                {(execResult.TotalMs / 1000).toFixed(2)}s
                              </span>
                            )}
                            <StatusBadge status={dev.status} />
                          </div>
                        </div>

                        {/* Expanded details of steps for this device */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] bg-slate-950/40 space-y-3">
                            {execResult?.Steps && execResult.Steps.length > 0 ? (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                  Étapes exécutées ({execResult.Steps.length})
                                </h4>
                                {execResult.Steps.map((st: any, sIdx: number) => (
                                  <div key={sIdx} className="rounded-lg bg-slate-900/60 border border-white/[0.04] p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-slate-200">
                                        Étape {sIdx + 1} : {st.name}
                                      </span>
                                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                        st.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                      }`}>
                                        {st.passed ? 'Réussi' : 'Échec'}
                                      </span>
                                    </div>
                                    <div className="text-xs font-mono text-blue-400">$ {st.command}</div>
                                    {st.output && (
                                      <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded border border-white/[0.02] max-h-40 overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar">
                                        {st.output}
                                      </pre>
                                    )}
                                    {st.error && (
                                      <div className="text-xs text-red-400 font-semibold mt-1">
                                        Erreur : {st.error}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic py-2">
                                {dev.status === 'pending'
                                  ? 'En attente de traitement...'
                                  : dev.status === 'running'
                                  ? 'Équipement en cours d’exécution...'
                                  : 'Aucun détail d’étape enregistré pour cet équipement.'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
