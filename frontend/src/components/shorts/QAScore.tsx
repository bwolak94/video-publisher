'use client'
import { InlineAlert } from '@/components/ui'

export type QACheck = {
  label: string
  value: number    // 0.0–1.0
  threshold?: number
}

export type QAScoreProps = {
  score: number          // 0.0–1.0
  threshold?: number     // default 0.75
  checks?: QACheck[]
  attempt?: number
  maxAttempts?: number   // default 3
  note?: string          // shown when score < threshold
}

export function QAScore({
  score,
  threshold = 0.75,
  checks = [],
  attempt = 1,
  maxAttempts = 3,
  note,
}: QAScoreProps) {
  const passed = score >= threshold
  const r = 40
  const circumference = 2 * Math.PI * r  // ~251.3
  const offset = circumference * (1 - score)
  const strokeColor = passed ? 'var(--accent)' : 'var(--danger)'

  return (
    <div className="flex flex-col gap-3">
      {/* Ring chart */}
      <div className="flex items-center gap-4">
        <svg width={100} height={100} viewBox="0 0 100 100">
          {/* Background ring */}
          <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={8} />
          {/* Threshold marker */}
          <circle
            cx={50} cy={50} r={r}
            fill="none"
            stroke="var(--line, #2a2b2f)"
            strokeWidth={2}
            strokeDasharray={`2 ${circumference - 2}`}
            strokeDashoffset={-(circumference * (1 - threshold) - circumference)}
            transform="rotate(-90 50 50)"
          />
          {/* Score arc */}
          <circle
            cx={50} cy={50} r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
          {/* Score label */}
          <text x={50} y={50} textAnchor="middle" dominantBaseline="central" className="text-sm font-mono font-bold" fill={strokeColor} fontSize={16}>
            {score.toFixed(2)}
          </text>
        </svg>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-[var(--ink-faint)]">Próba {attempt}/{maxAttempts}</span>
          <span className="text-xs font-mono text-[var(--ink-faint)]">próg {threshold.toFixed(2)}</span>
        </div>
      </div>

      {/* Checks breakdown */}
      {checks.length > 0 && (
        <div className="flex flex-col gap-2">
          {checks.map((check, i) => {
            const checkPassed = check.threshold ? check.value >= check.threshold : check.value >= threshold
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-[var(--ink-faint)] w-28 shrink-0">{check.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${check.value * 100}%`,
                      backgroundColor: checkPassed ? 'var(--accent)' : 'var(--danger)',
                    }}
                  />
                </div>
                <span className="text-xs font-mono w-8 text-right" style={{ color: checkPassed ? 'var(--accent)' : 'var(--danger)' }}>
                  {check.value.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Fail alert */}
      {!passed && (
        <InlineAlert tone="danger">
          {note ?? 'Scena wymaga ręcznej interwencji — wynik poniżej progu jakości.'}
        </InlineAlert>
      )}
    </div>
  )
}
