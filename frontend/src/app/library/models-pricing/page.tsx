'use client'
import { useEffect, useState } from 'react'
import { ModelPricingTable } from '@/components/library/ModelPricingTable'
import type { ModelPricingRow } from '@/components/library/ModelPricingTable'

type Tab = 'all' | 'active' | 'inactive'

export default function ModelsPricingPage() {
  const [rows, setRows] = useState<ModelPricingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  const [showAdd, setShowAdd] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newEndpoint, setNewEndpoint] = useState('')
  const [newUnit, setNewUnit] = useState('per_second')
  const [newPrice, setNewPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/model-pricing')
      const data = (await res.json()) as ModelPricingRow[] | { data?: ModelPricingRow[] }
      const list = Array.isArray(data) ? data : (data as { data?: ModelPricingRow[] }).data ?? []
      setRows(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleUpdate(id: string, price: number) {
    await fetch(`/api/model-pricing/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricePerUnit: price }),
    })
    await load()
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/model-pricing/${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newRole.trim() || !newModel.trim() || !newEndpoint.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/model-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: newRole.trim(),
          model: newModel.trim(),
          endpoint: newEndpoint.trim(),
          unit: newUnit.trim(),
          pricePerUnit: newPrice !== '' ? parseFloat(newPrice) : null,
        }),
      })
      setNewRole('')
      setNewModel('')
      setNewEndpoint('')
      setNewUnit('per_second')
      setNewPrice('')
      setShowAdd(false)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = rows.filter((r) =>
    tab === 'all' ? true : tab === 'active' ? r.isActive : !r.isActive,
  )

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.isActive).length,
    inactive: rows.filter((r) => !r.isActive).length,
  }

  return (
    <div className="vf-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.01em' }}>
          Modele i ceny
        </h1>
        <button
          className="vf-btn vf-btn-primary"
          onClick={() => setShowAdd((v) => !v)}
        >
          + Dodaj model
        </button>
      </div>

      {/* Add row form */}
      {showAdd && (
        <div className="vf-card">
          <div className="vf-card-body">
            <form onSubmit={(e) => { void handleAdd(e) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                <div className="vf-field">
                  <label className="vf-label">Rola</label>
                  <div className="vf-control">
                    <input
                      className="vf-input"
                      placeholder="np. tts"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="vf-field">
                  <label className="vf-label">Model</label>
                  <div className="vf-control">
                    <input
                      className="vf-input"
                      placeholder="np. eleven_turbo_v2"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="vf-field">
                  <label className="vf-label">Endpoint</label>
                  <div className="vf-control">
                    <input
                      className="vf-input"
                      placeholder="np. /v1/text-to-speech"
                      value={newEndpoint}
                      onChange={(e) => setNewEndpoint(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="vf-field">
                  <label className="vf-label">Jednostka</label>
                  <div className="vf-control">
                    <input
                      className="vf-input"
                      placeholder="np. per_second"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="vf-field">
                  <label className="vf-label">
                    Cena
                    <span className="vf-opt">opcjonalna</span>
                  </label>
                  <div className="vf-control">
                    <input
                      className="vf-input"
                      type="number"
                      placeholder="0.0000"
                      step="0.0001"
                      min="0"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="vf-btn vf-btn-ghost"
                  onClick={() => setShowAdd(false)}
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="vf-btn vf-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? <span className="vf-spin" /> : 'Dodaj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="vf-seg" style={{ alignSelf: 'flex-start' }}>
        {(['all', 'active', 'inactive'] as const).map((t) => {
          const labels: Record<Tab, string> = { all: 'Wszystkie', active: 'Aktywne', inactive: 'Nieaktywne' }
          return (
            <button
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {labels[t]}
              {' '}
              <small>{counts[t]}</small>
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--ink-faint)' }}>
          Ładowanie…
        </p>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '64px 0' }}>
          <p style={{ color: 'var(--ink-faint)' }}>Brak modeli</p>
        </div>
      ) : (
        <div className="vf-card">
          <div className="vf-card-body" style={{ padding: 0 }}>
            <ModelPricingTable
              rows={filtered}
              onUpdate={(id, price) => { void handleUpdate(id, price) }}
              onDeactivate={(id) => { void handleDeactivate(id) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
