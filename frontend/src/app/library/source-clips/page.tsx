'use client'

import { InlineAlert } from '@/components/ui/InlineAlert'

export default function SourceClipsPage() {
  return (
    <div className="vf-content">
      <div className="vf-top" style={{ paddingLeft: 0, paddingRight: 0, border: 'none', height: 'auto', marginBottom: 'var(--space-4)' }}>
        <h1 className="vf-top-title">Klipy źródłowe</h1>
      </div>

      {/* Upload area */}
      <label
        htmlFor="clip-upload"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-8)',
          border: '2px dashed var(--line-strong)',
          borderRadius: 'var(--radius-lg)',
          cursor: 'not-allowed',
          background: 'var(--surface-sunken)',
          opacity: 0.7,
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          style={{ color: 'var(--ink-muted)' }}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span style={{ fontSize: 14, color: 'var(--ink-muted)', textAlign: 'center' }}>
          Przeciągnij klip lub kliknij aby wgrać
        </span>
        <input
          id="clip-upload"
          type="file"
          accept="video/*"
          disabled
          style={{ display: 'none' }}
        />
      </label>

      {/* Empty state */}
      <InlineAlert tone="info" title="Brak klipów">
        Nie wgrano jeszcze żadnych klipów źródłowych. Wgraj plik wideo, aby rozpocząć
        przycinanie i generowanie scen V2V.
      </InlineAlert>
    </div>
  )
}
