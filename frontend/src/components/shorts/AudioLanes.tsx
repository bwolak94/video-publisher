export interface AudioSegment {
  start: number
  end: number
  label: string
  speaker?: string
}

export interface AudioTrack {
  kind: 'vo' | 'dialog' | 'sfx' | 'music'
  label?: string
  segments: AudioSegment[]
  ducks?: [number, number][]
}

export interface AudioLanesProps {
  duration: number
  title?: string
  tracks: AudioTrack[]
}

const KIND_CLASS: Record<AudioTrack['kind'], string> = {
  vo: 'vf-seg-vo',
  dialog: 'vf-seg-dialog',
  sfx: 'vf-seg-sfx',
  music: 'vf-seg-music',
}

function pct(value: number, total: number): string {
  if (total <= 0) return '0%'
  return `${(value / total) * 100}%`
}

function rulerTicks(duration: number): number[] {
  const count = Math.ceil(duration / 5)
  return Array.from({ length: count + 1 }, (_, i) => i * 5)
}

export function AudioLanes({ duration, title, tracks }: AudioLanesProps) {
  const ticks = rulerTicks(duration)

  return (
    <div className="vf-card">
      {title != null && (
        <div className="vf-card-head">
          <h3 className="vf-card-title">{title}</h3>
        </div>
      )}

      <div className="vf-card-body">
        {/* Time ruler */}
        <div className="vf-ruler" style={{ marginBottom: 8 }}>
          <div />
          <div>
            {ticks.map((tick) => (
              <span key={tick}>{tick}s</span>
            ))}
          </div>
        </div>

        {/* Track lanes */}
        <div className="vf-lanes">
          {tracks.map((track, trackIndex) => (
            <div key={trackIndex} className="vf-lane">
              <span className="vf-lane-name">{track.label ?? track.kind}</span>

              <div className="vf-lane-track">
                {/* Audio segments */}
                {track.segments.map((seg, segIndex) => {
                  const displayLabel =
                    track.kind === 'dialog' && seg.speaker != null
                      ? `${seg.speaker}: ${seg.label}`
                      : seg.label

                  return (
                    <div
                      key={segIndex}
                      className={`vf-seg-a ${KIND_CLASS[track.kind]}`}
                      style={{
                        left: pct(seg.start, duration),
                        width: pct(seg.end - seg.start, duration),
                      }}
                      title={displayLabel}
                    >
                      {displayLabel}
                    </div>
                  )
                })}

                {/* Ducking zones (music track only) */}
                {track.kind === 'music' &&
                  track.ducks?.map(([start, end], duckIndex) => (
                    <div
                      key={duckIndex}
                      className="vf-duck"
                      style={{
                        left: pct(start, duration),
                        width: pct(end - start, duration),
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
