'use client'
import { useEffect, useState } from 'react'
import { Button, InlineAlert } from '@/components/ui'
import { ConsentPanel, type LikenessConsent } from '@/components/library/ConsentPanel'

type FilterTab = 'all' | 'active' | 'pending' | 'revoked'

export default function LikenessVaultPage() {
  const [consents, setConsents] = useState<LikenessConsent[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const [inviteLink, setInviteLink] = useState<string>()
  const [inviting, setInviting] = useState(false)

  async function load() {
    const res = await fetch('/api/likeness')
    const data = await res.json()
    setConsents(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleInvite() {
    setInviting(true)
    const res = await fetch('/api/likeness/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays: 7 }),
    })
    const data = await res.json()
    setInviteLink(`${window.location.origin}/consent/${data.token}`)
    setInviting(false)
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/likeness/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    load()
  }

  const filtered = consents.filter(c => {
    if (filter === 'all') return true
    if (filter === 'revoked') return !!c.revoked_at
    if (filter === 'active') return !c.revoked_at && (!c.period_until || new Date(c.period_until) > new Date())
    if (filter === 'pending') return !c.revoked_at
    return true
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Likeness Vault</h1>
        <Button variant="primary" loading={inviting} onClick={handleInvite}>+ Zaproś osobę</Button>
      </div>

      {inviteLink && (
        <InlineAlert tone="info" title="Link zaproszenia">
          <span className="font-mono text-xs break-all">{inviteLink}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => navigator.clipboard.writeText(inviteLink!)}
          >
            Kopiuj
          </Button>
        </InlineAlert>
      )}

      <div className="flex gap-2">
        {(['all', 'active', 'pending', 'revoked'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              filter === tab
                ? 'bg-[var(--accent)] text-black border-transparent'
                : 'border-[var(--line,#2a2b2f)] text-[var(--ink-faint)]'
            }`}
          >
            {tab === 'all' ? 'Wszystkie' : tab === 'active' ? 'Aktywne' : tab === 'pending' ? 'Oczekujące' : 'Odwołane'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-center font-mono text-[var(--ink-faint)]">Ładowanie&hellip;</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[var(--ink-faint)] py-12">Brak zgód</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map(c => (
            <ConsentPanel key={c.id} consent={c} onRevoke={() => handleRevoke(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
