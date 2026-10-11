'use client'
import { useState } from 'react'

export interface ModelPricingRow {
  id: string
  role: string
  model: string
  endpoint: string
  pricePerUnit: number | null
  unit: string
  license: 'commercial' | 'check'
  tag?: string
  isActive: boolean
  updatedAt: string
}

interface ModelPricingTableProps {
  rows: ModelPricingRow[]
  onUpdate: (id: string, price: number) => void
  onDeactivate: (id: string) => void
}

function InlineEditPrice({
  row,
  onUpdate,
}: {
  row: ModelPricingRow
  onUpdate: (id: string, price: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.pricePerUnit?.toString() ?? '')

  if (row.pricePerUnit === null && !editing) {
    return (
      <span
        className="text-ink-muted text-sm cursor-pointer"
        style={{ color: 'var(--ink-muted)' }}
        onClick={() => setEditing(true)}
      >
        Zmierz w PoC
      </span>
    )
  }

  if (editing) {
    return (
      <input
        type="number"
        className="vf-input w-28 font-mono text-sm"
        style={{ width: '7rem', fontFamily: 'var(--font-mono)', fontSize: '13px', height: '32px' }}
        autoFocus
        value={value}
        step="0.0001"
        min="0"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          onUpdate(row.id, parseFloat(value))
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onUpdate(row.id, parseFloat(value))
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className="font-mono text-sm cursor-pointer"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLSpanElement).style.color = 'var(--accent-text)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLSpanElement).style.color = ''
      }}
      onClick={() => setEditing(true)}
    >
      ${row.pricePerUnit!.toFixed(4)} / {row.unit}
    </span>
  )
}

export function ModelPricingTable({ rows, onUpdate, onDeactivate }: ModelPricingTableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="vf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            <th className="text-left" style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Rola
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Model
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Endpoint
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Cena / jednostka
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Licencja
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontWeight: 500, textAlign: 'left' }}>
              Akcje
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              style={{
                borderBottom: '1px solid var(--line)',
                opacity: row.isActive ? 1 : 0.4,
                transition: 'opacity 0.15s',
              }}
            >
              <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                <span className="vf-badge vf-badge-neutral">{row.role}</span>
                {row.tag && (
                  <span className="vf-badge vf-badge-neutral vf-badge-mono" style={{ marginLeft: '4px' }}>
                    {row.tag}
                  </span>
                )}
              </td>
              <td style={{ padding: '8px 12px', fontSize: '13px', verticalAlign: 'middle' }}>
                {row.model}
              </td>
              <td
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--ink-muted)',
                  verticalAlign: 'middle',
                }}
              >
                {row.endpoint}
              </td>
              <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                <InlineEditPrice row={row} onUpdate={onUpdate} />
              </td>
              <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                <span
                  className={`vf-badge ${row.license === 'commercial' ? 'vf-badge-accent' : 'vf-badge-warn'}`}
                >
                  {row.license === 'commercial' ? 'OK' : 'Sprawdź'}
                </span>
              </td>
              <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                <button
                  className="vf-btn vf-btn-ghost vf-btn-sm"
                  style={{ fontSize: '12px', height: '28px', padding: '0 8px' }}
                  onClick={() => onDeactivate(row.id)}
                  disabled={!row.isActive}
                >
                  Dezaktywuj
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
