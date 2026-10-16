import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import { Play, Plus, Trash2, CheckCircle, ChevronDown, ChevronRight, CircleX, CircleHelp, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import DeviceSelector, { DeviceSelection, DeviceSource } from '../components/DeviceSelector'
import { getBackend } from '../lib/backend'

export default function AuditPage() {
  const qc = useQueryClient()
  const location = useLocation()
  const handoff = location.state as { deviceIds?: string[], source?: DeviceSource } | null
  const [selection, setSelection] = useState<DeviceSelection>(() => ({
    source: handoff?.source || 'last_scan',
    deviceIds: [...new Set(handoff?.deviceIds || [])],
    manualIPs: [],
  }))
  const [selectedRules, setSelectedRules] = useState<string[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [auditError, setAuditError] = useState('')
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editRule, setEditRule] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'run' | 'rules'>('run')
  const [showRuleFilter, setShowRuleFilter] = useState(true)
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})
  const [resultStatus, setResultStatus] = useState('all')
  const [resultSeverity, setResultSeverity] = useState('all')
  const [resultCategory, setResultCategory] = useState('all')

  const { data: rules = [] } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => { const m = await getBackend(); return m.GetAuditRules() },
  } as any)

  useEffect(() => {
    const ruleList = rules as any[]
    if (ruleList.length > 0 && selectedRules.length === 0) {
      setSelectedRules(ruleList.filter((r: any) => r.enabled).map((r: any) => r.id))
    }
  }, [rules])

  const auditMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      const allRuleIDs = (rules as any[]).filter((r: any) => r.enabled).map((r: any) => r.id)
      const useFiltered = selectedRules.length < allRuleIDs.length

      let deviceIDs = selection.deviceIds
      if (selection.source === 'manual') {
        const found = await m.GetDevicesByIPs(selection.manualIPs)
        deviceIDs = (found || []).map((d: any) => d.id)
      }

      if (deviceIDs.length === 0) {
        throw new Error('Aucun équipement saisi ne correspond à l’inventaire. Ajoutez-le ou lancez une découverte avant l’audit.')
      }

      if (useFiltered) return m.RunAuditFiltered(deviceIDs, selectedRules)
      return m.RunAudit(deviceIDs)
    },
    onMutate: () => setAuditError(''),
    onSuccess: (data: any) => setReports(data || []),
    onError: (error: Error) => setAuditError(error.message),
  })

  const saveRuleMutation = useMutation({
    mutationFn: async (rule: any) => { const m = await getBackend(); return m.SaveAuditRule(rule) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-rules'] }); setShowRuleModal(false) },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeleteAuditRule(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-rules'] }),
  })

  const severityOpts = [
    { value: 'critical', label: 'Critique' }, { value: 'high', label: 'Eleve' },
    { value: 'medium', label: 'Moyen' }, { value: 'low', label: 'Faible' },
  ]
  const vendorOpts = [
    { value: '', label: 'Tous' }, { value: 'cisco', label: 'Cisco' },
    { value: 'aruba', label: 'Aruba' }, { value: 'hp', label: 'HP' },
    { value: 'hpe', label: 'HPE' }, { value: 'allied', label: 'Allied Telesis' },
    { value: 'huawei', label: 'Huawei' }, { value: 'fortinet', label: 'Fortinet' },
  ]

  const enabledRules = (rules as any[]).filter((rule: any) => rule.enabled)
  const allRulesSelected = selectedRules.length === enabledRules.length
  const canAudit = selection.source === 'manual' ? selection.manualIPs.length > 0 : selection.deviceIds.length > 0

  const toggleReport = (id: string) => setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }))

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-900/30 border-red-800 text-red-400'
      case 'high': return 'bg-orange-900/30 border-orange-800 text-orange-400'
      case 'medium': return 'bg-yellow-900/30 border-yellow-800 text-yellow-400'
      default: return 'bg-slate-800 border-slate-700 text-slate-400'
    }
  }

  const statusLabel = (status: string) => ({
    compliant: 'Conforme', non_compliant: 'Non conforme', not_applicable: 'Non applicable',
    indeterminate: 'Indéterminé', error: 'Erreur',
  }[status] || 'Inconnu')

  const statusColor = (status: string) => ({
    compliant: 'text-emerald-300 bg-emerald-950/30 border-emerald-800/70',
    non_compliant: 'text-red-300 bg-red-950/30 border-red-800/70',
    not_applicable: 'text-slate-400 bg-slate-800/60 border-slate-700',
    indeterminate: 'text-amber-300 bg-amber-950/30 border-amber-800/70',
    error: 'text-red-300 bg-red-950/30 border-red-800/70',
  }[status] || 'text-slate-400 bg-slate-800 border-slate-700')

  const resultCategories = [...new Set(reports.flatMap(report => (report.results || []).map((result: any) => result.category).filter(Boolean)))]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit de conformite"
        actions={<div className="flex gap-2">
          <Button size="sm" variant={activeTab === 'run' ? 'primary' : 'secondary'} onClick={() => setActiveTab('run')}>Audit</Button>
          <Button size="sm" variant={activeTab === 'rules' ? 'primary' : 'secondary'} onClick={() => setActiveTab('rules')}>Regles</Button>
        </div>}
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {activeTab === 'run' ? (
          <>
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="flex items-center justify-between mb-6 relative z-10">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Equipements a auditer
                </h2>
              </div>

              <div className="relative z-10 mb-5 border-b border-white/[0.04] pb-4">
                <DeviceSelector value={selection} onChange={setSelection}
                  manualDescription="Seuls les équipements disposant d’une sauvegarde validée seront audités." />
              </div>

              {/* Rule filter */}
              <div className="border-t border-white/[0.04] pt-4 relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setShowRuleFilter(v => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors tracking-wide">
                    <span className={`transition-transform duration-200 ${showRuleFilter ? 'rotate-90' : ''}`}>&#9654;</span>
                    Règles appliquées <span className="text-slate-500">({selectedRules.length}/{enabledRules.length})</span>
                    {!allRulesSelected && (
                      <span className="ml-2 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-400 text-[10px] uppercase font-bold tracking-wider">
                        Filtrees
                      </span>
                    )}
                  </button>
                  {showRuleFilter && (
                    <button onClick={() => setSelectedRules(allRulesSelected ? [] : enabledRules.map((r: any) => r.id))}
                      className="text-xs text-blue-400 font-medium hover:text-blue-300 transition-colors uppercase tracking-wider">
                      {allRulesSelected ? 'Tout deselectionner' : 'Tout selectionner'}
                    </button>
                  )}
                </div>
                {showRuleFilter && (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1 mb-5">
                    {enabledRules.map((rule: any) => (
                      <label key={rule.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all duration-200 shadow-sm ${
                          selectedRules.includes(rule.id)
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:bg-slate-800'}`}>
                        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-500 rounded border-slate-700 bg-slate-900"
                          checked={selectedRules.includes(rule.id)}
                          onChange={e => setSelectedRules(prev =>
                            e.target.checked ? [...prev, rule.id] : prev.filter(id => id !== rule.id)
                          )} />
                        <span className={`w-2 h-2 rounded-full shadow-sm ${
                          rule.severity === 'critical' ? 'bg-red-500 shadow-red-500/50' :
                          rule.severity === 'high' ? 'bg-orange-500 shadow-orange-500/50' :
                          rule.severity === 'medium' ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-slate-500'}`} />
                        {rule.name}
                      </label>
                    ))}
                    {(rules as any[]).length === 0 && (
                      <p className="text-xs font-medium text-slate-500 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700/50">Aucune regle configuree. Creez des regles dans l'onglet "Regles".</p>
                    )}
                  </div>
                )}
              </div>

              <div className="relative z-10 pt-2">
                <Button variant="primary" loading={auditMutation.isPending} className="shadow-emerald-500/25 px-8"
                  disabled={!canAudit || selectedRules.length === 0}
                  onClick={() => auditMutation.mutate()}>
                  <Play className="w-4 h-4" /> Démarrer l'Audit
                  {!allRulesSelected && ` (${selectedRules.length} ${selectedRules.length > 1 ? 'règles' : 'règle'})`}
                </Button>
                {auditError && <p className="mt-3 text-sm text-red-300" role="alert">{auditError}</p>}
              </div>
            </div>

            {reports.length > 0 && (
              <fieldset className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <legend className="px-1 text-sm font-semibold text-slate-200">Filtrer les résultats</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <Select label="Statut" value={resultStatus} options={[{ value: 'all', label: 'Tous les statuts' }, { value: 'non_compliant', label: 'Non conforme' }, { value: 'indeterminate', label: 'Indéterminé' }, { value: 'compliant', label: 'Conforme' }, { value: 'not_applicable', label: 'Non applicable' }, { value: 'error', label: 'Erreur' }]} onChange={event => setResultStatus(event.target.value)} />
                  <Select label="Gravité" value={resultSeverity} options={[{ value: 'all', label: 'Toutes les gravités' }, ...severityOpts]} onChange={event => setResultSeverity(event.target.value)} />
                  <Select label="Catégorie" value={resultCategory} options={[{ value: 'all', label: 'Toutes les catégories' }, ...resultCategories.map(category => ({ value: category, label: category }))]} onChange={event => setResultCategory(event.target.value)} />
                </div>
              </fieldset>
            )}

            {/* Audit reports */}
            {reports.map((report: any) => {
              const isExpanded = expandedReports[report.device_id] !== false
              const visibleResults = (report.results || []).filter((result: any) =>
                (resultStatus === 'all' || result.status === resultStatus) &&
                (resultSeverity === 'all' || result.severity === resultSeverity) &&
                (resultCategory === 'all' || result.category === resultCategory)
              )

              return (
                <div key={report.device_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <button type="button" className="w-full px-5 py-3 border-b border-slate-800 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center text-left hover:bg-slate-800/30 transition-colors"
                    onClick={() => toggleReport(report.device_id)} aria-expanded={isExpanded}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      <div>
                        <span className="font-medium text-white">{report.device_hostname || report.device_ip}</span>
                        <span className="text-xs text-slate-500 ml-2">{report.device_ip}</span>
                        {report.status === 'error'
                          ? <span className="ml-3 text-sm text-red-300">Audit non exécuté</span>
                          : <span className="ml-3 text-sm text-slate-400">{report.compliant} conforme{report.compliant > 1 ? 's' : ''} · {report.non_compliant} écart{report.non_compliant > 1 ? 's' : ''} · {report.indeterminate} indéterminé{report.indeterminate > 1 ? 's' : ''}</span>}
                        {report.backup_at && <p className="text-xs text-slate-500 mt-1">Sauvegarde utilisée : {new Date(report.backup_at).toLocaleString('fr-FR')} ({report.backup_status})</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {report.assessed > 0 && (
                        <>
                          <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${report.score >= 80 ? 'bg-green-500' : report.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${report.score}%` }} />
                          </div>
                          <span className={`text-lg font-bold tabular-nums ${report.score >= 80 ? 'text-green-400' : report.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {Math.round(report.score)}%
                          </span>
                        </>
                      )}
                      {report.assessed === 0 && report.status !== 'error' && <span className="text-sm text-amber-300">Score non calculé</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <>
                      {report.status === 'error' ? (
                        <div className="p-4 text-sm text-amber-200 flex items-start gap-2" role="alert">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div><p>{report.error_message || 'Audit impossible.'}</p><p className="text-xs text-slate-400 mt-1">Aucune conclusion de conformité n’a été produite.</p></div>
                        </div>
                      ) : (
                        <div className="p-4 space-y-2">
                          {visibleResults.map((r: any) => (
                            <div key={r.id} className={`flex items-start gap-3 p-3 rounded-lg border ${statusColor(r.status)}`}>
                              <span className="mt-0.5" aria-hidden="true">
                                {r.status === 'compliant' ? <CheckCircle className="w-4 h-4" /> : r.status === 'non_compliant' ? <CircleX className="w-4 h-4" /> : <CircleHelp className="w-4 h-4" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-100">{r.rule_name}</p>
                                {r.expected && <p className="text-xs text-slate-300 mt-1">Attendu : {r.expected}</p>}
                                {r.risk && <p className="text-xs text-slate-300 mt-1">Risque : {r.risk}</p>}
                                {r.details && <p className="text-xs text-slate-300 mt-1">Conclusion : {r.details}</p>}
                                {r.evidence && <p className="text-xs text-slate-400 mt-1 font-mono whitespace-pre-wrap">Preuve : {r.evidence}</p>}
                                {r.remediation && <p className="text-xs text-amber-200 mt-2">Recommandation à valider : {r.remediation}</p>}
                              </div>
                              <div className="flex flex-col gap-1 items-end shrink-0"><span className={`text-xs px-1.5 py-0.5 rounded border ${statusColor(r.status)}`}>{statusLabel(r.status)}</span><span className={`text-xs px-1.5 py-0.5 rounded border ${severityColor(r.severity)}`}>{r.severity}</span></div>
                            </div>
                          ))}
                          {visibleResults.length === 0 && <p className="text-sm text-slate-400">Aucun résultat ne correspond aux filtres actifs.</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

          </>
        ) : (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col items-stretch">
            <div className="px-6 py-4 border-b border-white/[0.04] bg-slate-950/40 flex justify-between items-center z-10 sticky top-0">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Règles de conformité <span className="text-slate-500 ml-1">({(rules as any[]).length})</span>
              </h2>
              <Button size="sm" variant="primary" onClick={() => { setEditRule({ must_match: true, severity: 'high', enabled: true, remediation: '' }); setShowRuleModal(true) }}>
                <Plus className="w-3.5 h-3.5" /> Nouvelle Règle
              </Button>
            </div>
            <div className="overflow-x-auto relative">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="text-left py-3 px-5 font-bold">Nom de la Règle</th>
                    <th className="text-left py-3 px-5 font-bold">Catégorie</th>
                    <th className="text-left py-3 px-5 font-bold">Pattern / Regex</th>
                    <th className="text-left py-3 px-5 font-bold">Type</th>
                    <th className="text-left py-3 px-5 font-bold">Sévérité</th>
                    <th className="text-left py-3 px-5 font-bold">Recommandation</th>
                    <th className="text-right py-3 px-5 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {(rules as any[]).map((rule: any) => (
                    <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 px-5 font-bold text-slate-200 tracking-wide">{rule.name}</td>
                      <td className="py-3 px-5 text-xs text-slate-400">{rule.category || 'Personnalisée'}</td>
                      <td className="py-3 px-5 font-mono text-[11px] text-slate-400 max-w-[200px] truncate" title={rule.pattern}>{rule.pattern}</td>
                      <td className="py-3 px-5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border text-slate-300 ${rule.must_match ? 'bg-blue-500/10 border-blue-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                          {rule.must_match ? 'Doit contenir' : 'Interdit'}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${severityColor(rule.severity)}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        {rule.remediation
                          ? <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Oui</span>
                          : <span className="text-[11px] text-slate-500 italic px-2 py-0.5">—</span>}
                      </td>
                      <td className="py-3 px-5 flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="bg-white/[0.02]" onClick={() => { setEditRule(rule); setShowRuleModal(true) }}>Éditer</Button>
                        <Button size="icon" variant="ghost" className="bg-white/[0.02] w-8 h-8 rounded hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteRuleMutation.mutate(rule.id)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(rules as any[]).length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                           <span className="font-medium text-slate-300 mb-1">Aucune règle définie</span>
                           <span className="text-sm">Ajoutez des règles pour lancer des audits de conformité réseau.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Rule edit modal with remediation field */}
      <Modal open={showRuleModal} onClose={() => setShowRuleModal(false)} title="Regle d'audit">
        <form onSubmit={e => { e.preventDefault(); saveRuleMutation.mutate(editRule) }} className="space-y-3">
          <Input label="Nom *" value={editRule?.name || ''} required
            onChange={e => setEditRule((r: any) => ({ ...r, name: e.target.value }))} />
          <div>
            <Input label="Pattern (regex) *" value={editRule?.pattern || ''} required
              onChange={e => setEditRule((r: any) => ({ ...r, pattern: e.target.value }))} />
            <p className="text-xs text-slate-500 mt-1">
              Supporte "pattern1 AND pattern2" pour verification multi-blocs (ex: "ntp server AND ntp authenticate")
            </p>
          </div>
          <Input label="Description" value={editRule?.description || ''}
            onChange={e => setEditRule((r: any) => ({ ...r, description: e.target.value }))} />
          <Input label="Catégorie" value={editRule?.category || ''} placeholder="Ex. Sécurité des accès"
            onChange={e => setEditRule((r: any) => ({ ...r, category: e.target.value }))} />
          <Input label="Risque" value={editRule?.risk || ''}
            onChange={e => setEditRule((r: any) => ({ ...r, risk: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Severite" value={editRule?.severity || 'high'} options={severityOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, severity: e.target.value }))} />
            <Select label="Vendor" value={editRule?.vendor || ''} options={vendorOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, vendor: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="must_match" checked={editRule?.must_match ?? true}
              onChange={e => setEditRule((r: any) => ({ ...r, must_match: e.target.checked }))} />
            <label htmlFor="must_match" className="text-sm text-slate-300">La configuration doit contenir ce pattern</label>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Recommandation à valider
            </label>
            <textarea value={editRule?.remediation || ''}
              onChange={e => setEditRule((r: any) => ({ ...r, remediation: e.target.value }))}
              placeholder="Décrire la vérification ou la correction à valider avant toute modification."
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
              rows={4} />
            <p className="text-xs text-slate-500 mt-1">
              Cette recommandation est informative ; elle n’est jamais exécutée automatiquement.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setShowRuleModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveRuleMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
