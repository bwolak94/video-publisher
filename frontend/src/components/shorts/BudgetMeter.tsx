'use client'

import { Badge } from '@/components/ui'
import { InlineAlert } from '@/components/ui'

export type BudgetMeterProps = {
  spent: number       // USD already used
  reserved: number    // USD locked by in-flight API calls
  limit: number       // hard budget cap (default 4)
  regenerations?: number
  eyebrow?: string    // label above bar, e.g. "Budżet odcinka"
}

export function BudgetMeter({
  spent,
  reserved,
  limit = 4,
  regenerations = 0,
  eyebrow,
}: BudgetMeterProps) {
  const spentPct = Math.min((spent / limit) * 100, 100)
  const reservedPct = Math.min((reserved / limit) * 100, 100 - spentPct)
  const isStopped = spent + reserved >= limit
  const isWarn = !isStopped && spent / limit > 0.8

  return (
    <div className="flex flex-col gap-1 w-full">
      {eyebrow && (
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-faint)]">
          {eyebrow}
        </p>
      )}

      {/* Bar */}
      <div
        className="relative h-2 overflow-hidden"
        style={{ borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--surface-sunken)' }}
      >
        {/* Spent segment */}
        <div
          className="absolute top-0 left-0 h-full transition-all duration-300"
          style={{
            width: `${spentPct}%`,
            backgroundColor: isStopped ? 'var(--danger)' : isWarn ? 'var(--warn)' : 'var(--accent)',
          }}
        />
        {/* Reserved segment (striped overlay) */}
        {reservedPct > 0 && (
          <div
            className="absolute top-0 h-full transition-all duration-300"
            style={{
              left: `${spentPct}%`,
              width: `${reservedPct}%`,
              backgroundColor: 'var(--warn)',
              opacity: 0.5,
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 6px)',
            }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isStopped && (
            <Badge tone="danger">Stop przed przekroczeniem</Badge>
          )}
          <span className="text-xs font-mono text-[var(--ink-faint)]">
            Wydano ${spent.toFixed(2)} / ${limit.toFixed(2)}
          </span>
        </div>
        {regenerations > 0 && (
          <span className="text-xs font-mono text-[var(--ink-muted)]">
            {regenerations} regeneracji
          </span>
        )}
      </div>

      {/* Stop alert */}
      {isStopped && (
        <InlineAlert tone="danger" title="Limit budżetu osiągnięty">
          Kolejne wywołanie przekroczyłoby limit. Podnieś budżet albo przełącz pozostałe sceny na tańszy model.
        </InlineAlert>
      )}
    </div>
  )
}
