import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Save, CheckCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import Select from '../components/Select'
import Modal from '../components/Modal'
import backend from '../lib/backend'
import { useToast } from '../components/Toast'
import { useGlobalCredential } from '../context/CredentialContext'

export default function SettingsPage() {
  const { toast } = useToast()
  const { globalCredId, setGlobalCredId } = useGlobalCredential()
  const [settings, setSettings] = useState<any>(null)
  const [showCredModal, setShowCredModal] = useState(false)
  const [editCred, setEditCred] = useState<any>(null)
  const [confirmDeleteCredId, setConfirmDeleteCredId] = useState<string | null>(null)

  const { data: fetchedSettings } = useQuery({ queryKey: ['settings'], queryFn: () => backend.GetSettings() })
  const { data: credentials = [], refetch: refetchCreds } = useQuery({ queryKey: ['credentials'], queryFn: () => backend.GetCredentials() })

  useEffect(() => {
    if (fetchedSettings && !settings) setSettings(fetchedSettings)
  }, [fetchedSettings, settings])

  const saveMutation = useMutation({
    mutationFn: (s: any) => backend.SaveSettings(s),
    onSuccess: () => toast('Paramètres sauvegardés', 'success'),
  })
  const saveCredMutation = useMutation({
    mutationFn: (cred: any) => backend.SaveCredential(cred),
    onSuccess: (result: any, variables: any) => {
      refetchCreds()
      setShowCredModal(false)
      // Auto-activate only for new credentials that have at least one auth method
      const isNew = !variables.id
      if (isNew && result?.id && (result.has_password || result.has_private_key || result.has_snmp_community || result.snmp_version === 'v3')) {
        setGlobalCredId(result.id)
        toast(`Credential "${result.name}" activé automatiquement`, 'success')
      }
    },
  })
  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteCredential(id),
    onSuccess: (_: any, deletedId: string) => {
      refetchCreds()
      // Clear active credential if it was deleted
      if (globalCredId === deletedId) setGlobalCredId('')
    },
  })

  const themeOpts = [{ value: 'dark', label: 'Sombre' }, { value: 'light', label: 'Clair' }]
  const langOpts = [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]
  const snmpOpts = [{ value: 'v2c', label: 'SNMPv2c' }, { value: 'v3', label: 'SNMPv3' }]
  const securityOpts = [
    { value: 'authPriv', label: 'authPriv (authentification + chiffrement)' },
    { value: 'authNoPriv', label: 'authNoPriv (authentification seule)' },
    { value: 'noAuthNoPriv', label: 'noAuthNoPriv (utilisateur seul)' },
  ]
  const authOpts = [
    { value: 'SHA256', label: 'SHA-256 (recommandé)' },
    { value: 'SHA384', label: 'SHA-384' },
    { value: 'SHA512', label: 'SHA-512' },
    { value: 'SHA224', label: 'SHA-224' },
    { value: 'SHA', label: 'SHA-1 (ancien)' },
    { value: 'MD5', label: 'MD5 (ancien)' },
  ]
  const privOpts = [
    { value: 'AES', label: 'AES-128 (recommandé)' },
    { value: 'AES192C', label: 'AES-192 Reeder' },
    { value: 'AES256C', label: 'AES-256 Reeder' },
    { value: 'AES192', label: 'AES-192 Blumenthal' },
    { value: 'AES256', label: 'AES-256 Blumenthal' },
    { value: 'DES', label: 'DES (ancien)' },
  ]

  const securityLevel = !editCred?.snmp_auth_protocol || editCred.snmp_auth_protocol === 'NONE'
    ? 'noAuthNoPriv'
    : (!editCred?.snmp_priv_protocol || editCred.snmp_priv_protocol === 'NONE' ? 'authNoPriv' : 'authPriv')

  const setSecurityLevel = (level: string) => {
    setEditCred((current: any) => ({
      ...current,
      snmp_auth_protocol: level === 'noAuthNoPriv'
        ? 'NONE'
        : (current?.snmp_auth_protocol && current.snmp_auth_protocol !== 'NONE' ? current.snmp_auth_protocol : 'SHA256'),
      snmp_priv_protocol: level === 'authPriv'
        ? (current?.snmp_priv_protocol && current.snmp_priv_protocol !== 'NONE' ? current.snmp_priv_protocol : 'AES')
        : 'NONE',
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Paramètres" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {settings && (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Général
            </h2>
            <div className="grid grid-cols-2 gap-5 mb-5 relative z-10">
              <Select label="Thème" value={settings.theme} options={themeOpts} onChange={e => setSettings((s: any) => ({ ...s, theme: e.target.value }))} />
              <Select label="Langue" value={settings.language} options={langOpts} onChange={e => setSettings((s: any) => ({ ...s, language: e.target.value }))} />
              <Input label="Workers max" type="number" value={settings.max_workers} onChange={e => setSettings((s: any) => ({ ...s, max_workers: parseInt(e.target.value, 10) || 0 }))} />
              <Input label="Rétention logs (jours)" type="number" value={settings.log_retention_days} onChange={e => setSettings((s: any) => ({ ...s, log_retention_days: parseInt(e.target.value, 10) || 0 }))} />
            </div>
            <div className="relative z-10 space-y-5">
              <Input label="Répertoire de backups" value={settings.backup_dir} onChange={e => setSettings((s: any) => ({ ...s, backup_dir: e.target.value }))} />
              <div className="pt-2">
                <Button variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(settings)} className="px-6 shadow-blue-500/25">
                  <Save className="w-4 h-4" /> Sauvegarder les paramètres
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.04] flex justify-between items-center bg-slate-950/40">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Credentials <span className="text-slate-500 ml-1">({(credentials as any[]).length})</span>
            </h2>
            <Button size="sm" variant="primary" onClick={() => { setEditCred({ snmp_version: 'v2c', snmp_auth_protocol: 'SHA256', snmp_priv_protocol: 'AES' }); setShowCredModal(true) }}>+ Nouveau Credential</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider">
                <th className="text-left py-3 px-5 font-bold">Nom</th><th className="text-left py-3 px-5 font-bold">Utilisateur</th>
                <th className="text-left py-3 px-5 font-bold">SSH Auth</th><th className="text-left py-3 px-5 font-bold">SNMP Auth</th><th className="text-right py-3 px-5 font-bold">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-white/[0.02]">
                {(credentials as any[]).map((c: any) => (
                  <tr key={c.id} className={`hover:bg-white/[0.02] transition-colors ${globalCredId === c.id ? 'bg-blue-600/5' : ''}`}>
                    <td className="py-3 px-5 font-bold text-slate-200 tracking-wide">
                      <div className="flex items-center gap-2">
                        {c.name}
                        {globalCredId === c.id && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 rounded">
                            <CheckCircle className="w-3 h-3" /> ACTIF
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-slate-400 font-mono text-xs">{c.username || '—'}</td>
                    <td className="py-3 px-5 text-[11px] font-medium tracking-wide">
                      <div className="flex gap-2">
                        {c.has_password && <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Password</span>}
                        {c.has_private_key && <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Key</span>}
                        {!c.has_password && !c.has_private_key && <span className="text-slate-500 italic">—</span>}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-[11px] font-medium tracking-wide">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400 font-bold">{c.snmp_version || 'v2c'}</span>
                        {c.has_snmp_community && <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Community</span>}
                        {c.snmp_username && <span className="text-blue-300 font-mono text-xs opacity-80">{c.snmp_username}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-5 flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="bg-white/[0.02]" onClick={() => { setEditCred(c); setShowCredModal(true) }}>Éditer</Button>
                      {confirmDeleteCredId === c.id ? (
                        <div className="flex items-center bg-red-500/10 rounded border border-red-500/20 px-1">
                          <Button size="sm" variant="ghost" onClick={() => { deleteCredMutation.mutate(c.id); setConfirmDeleteCredId(null) }} className="text-red-400 hover:text-red-300 p-1 text-xs font-bold">OK</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteCredId(null)} className="text-slate-400 hover:text-slate-300 p-1 text-xs">X</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="bg-white/[0.02] hover:bg-red-500/10 hover:text-red-400" onClick={() => setConfirmDeleteCredId(c.id)}><span className="text-xs">Suppr.</span></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={showCredModal} onClose={() => setShowCredModal(false)} title="Configurer un Credential" size="lg">
        <form onSubmit={e => { e.preventDefault(); saveCredMutation.mutate(editCred) }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nom du credential *" value={editCred?.name || ''} required onChange={e => setEditCred((c: any) => ({ ...c, name: e.target.value }))} />
            <Input label="Utilisateur SSH" value={editCred?.username || ''} onChange={e => setEditCred((c: any) => ({ ...c, username: e.target.value }))} />
          </div>
          <div className="pb-2 border-b border-white/[0.04]">
            <Input label="Mot de passe SSH" type="password" value={editCred?.password || ''} placeholder={editCred?.has_password ? '•••••••• (inchangé)' : ''} onChange={e => setEditCred((c: any) => ({ ...c, password: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Select label="Version SNMP" value={editCred?.snmp_version || 'v2c'} options={snmpOpts} onChange={e => setEditCred((c: any) => ({ ...c, snmp_version: e.target.value }))} />
            {(editCred?.snmp_version || 'v2c') !== 'v3' && (
              <Input label="Communauté SNMP" type="password" value={editCred?.snmp_community || ''} placeholder={editCred?.has_snmp_community ? '•••••••• (inchangée)' : ''} onChange={e => setEditCred((c: any) => ({ ...c, snmp_community: e.target.value }))} />
            )}
          </div>
          {(editCred?.snmp_version || 'v2c') === 'v3' && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-white/[0.02] grid grid-cols-2 gap-4 mt-2">
              <div className="col-span-2">
                <Input label="Utilisateur SNMPv3 *" value={editCred?.snmp_username || ''} required onChange={e => setEditCred((c: any) => ({ ...c, snmp_username: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Select label="Niveau de sécurité USM" value={securityLevel} options={securityOpts} onChange={e => setSecurityLevel(e.target.value)} />
              </div>
              {securityLevel !== 'noAuthNoPriv' && (
                <>
                  <Select label="Protocole d'authentification" value={editCred?.snmp_auth_protocol || 'SHA256'} options={authOpts} onChange={e => setEditCred((c: any) => ({ ...c, snmp_auth_protocol: e.target.value }))} />
                  <Input label="Phrase secrète d'authentification" type="password" minLength={8} value={editCred?.snmp_auth_key || ''} placeholder={editCred?.id ? 'Laisser vide pour conserver' : '8 caractères minimum'} onChange={e => setEditCred((c: any) => ({ ...c, snmp_auth_key: e.target.value }))} />
                </>
              )}
              {securityLevel === 'authPriv' && (
                <>
                  <Select label="Protocole de chiffrement" value={editCred?.snmp_priv_protocol || 'AES'} options={privOpts} onChange={e => setEditCred((c: any) => ({ ...c, snmp_priv_protocol: e.target.value }))} />
                  <Input label="Phrase secrète de chiffrement" type="password" minLength={8} value={editCred?.snmp_priv_key || ''} placeholder={editCred?.id ? 'Laisser vide pour conserver' : '8 caractères minimum'} onChange={e => setEditCred((c: any) => ({ ...c, snmp_priv_key: e.target.value }))} />
                </>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <Button type="button" variant="ghost" onClick={() => setShowCredModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveCredMutation.isPending} className="px-6 shadow-blue-500/25">Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
