'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button, TextField, Switch, Checkbox, InlineAlert } from '@/components/ui'

type Step = 1 | 2 | 3 | 4

const CHANNELS = ['youtube', 'tiktok', 'instagram', 'facebook', 'other']
const TOPICS = ['cooking', 'technology', 'fitness', 'entertainment', 'education', 'lifestyle']

type InvitationData = {
  token: string
  [key: string]: unknown
}

type FormState = {
  name: string
  email: string
  purpose: string
  channels: string[]
  topics: string[]
  voiceConsent: boolean
}

export default function ConsentPage() {
  const { token } = useParams<{ token: string }>()
  const [step, setStep] = useState<Step>(1)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string>()
  const [photos, setPhotos] = useState<File[]>([])
  const [liveness, setLiveness] = useState<File | null>(null)
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    purpose: '',
    channels: [],
    topics: [],
    voiceConsent: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/likeness/invitations/${token}`)
      .then(r => r.json())
      .then((data: { statusCode?: number; message?: string } & InvitationData) => {
        if (data.statusCode !== undefined && data.statusCode >= 400) {
          setError(data.message ?? 'Nieprawidłowe zaproszenie')
        } else {
          setInvitation(data)
        }
      })
      .catch(() => setError('Nie udało się załadować zaproszenia'))
  }, [token])

  async function handleSubmit() {
    if (photos.length < 3) { setError('Wymagane minimum 3 zdjęcia'); return }
    if (!liveness) { setError('Wymagane nagranie weryfikacyjne'); return }
    setSubmitting(true)
    setError(undefined)
    try {
      const photoKeys = photos.map((_: File, i: number) => `likeness/${token}/photo_${i}.jpg`)
      const livenessKey = `likeness/${token}/liveness.mp4`

      const res = await fetch(`/api/likeness/invitations/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dto: {
            subjectName: form.name,
            subjectEmail: form.email,
            purpose: form.purpose || 'Video content creation',
            channels: form.channels,
            topicsAllowed: form.topics,
            voiceConsent: form.voiceConsent,
          },
          photoS3Keys: photoKeys,
          livenessS3Key: livenessKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Błąd wysyłania')
      setStep(4)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nieznany błąd')
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !invitation) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <InlineAlert tone="danger" title="Błąd">{error}</InlineAlert>
    </div>
  )

  if (!invitation) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="font-mono text-[var(--ink-faint)]">Ładowanie&hellip;</p>
    </div>
  )

  return (
    <div className="min-h-screen max-w-lg mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Formularz zgody na wizerunek</h1>

      {/* Step indicator */}
      <div className="flex gap-2">
        {([1, 2, 3, 4] as const).map(s => (
          <div
            key={s}
            className="flex-1 h-1 rounded-full"
            style={{ backgroundColor: s <= step ? 'var(--accent)' : 'var(--surface-sunken)' }}
          />
        ))}
      </div>

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {/* Step 1: Photos */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Krok 1: Zdjęcia referencyjne</h2>
          <p className="text-sm text-[var(--ink-faint)]">Prześlij 3–10 zdjęć twarzy w dobrym oświetleniu.</p>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => setPhotos(Array.from(e.target.files ?? []).slice(0, 10))}
          />
          <div className="grid grid-cols-4 gap-2">
            {photos.map((f: File, i: number) => (
              <div
                key={i}
                className="aspect-square rounded bg-[var(--surface-sunken)] flex items-center justify-center text-xs text-[var(--ink-faint)]"
              >
                {f.name.slice(0, 6)}
              </div>
            ))}
          </div>
          <Button variant="ghost" onClick={() => photoRef.current?.click()}>+ Dodaj zdjęcia</Button>
          <Button variant="primary" disabled={photos.length < 3} onClick={() => setStep(2)}>
            Dalej ({photos.length}/3+)
          </Button>
        </div>
      )}

      {/* Step 2: Liveness */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Krok 2: Weryfikacja tożsamości</h2>
          <InlineAlert tone="info" title="Nagranie weryfikacyjne">
            Nagraj 5-sekundowy film, wypowiadając: &quot;Wyrażam zgodę na przetwarzanie mojego wizerunku.&quot;
          </InlineAlert>
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => setLiveness(e.target.files?.[0] ?? null)}
          />
          <Button variant="ghost" onClick={() => videoRef.current?.click()}>
            {liveness ? `Wybrano: ${liveness.name}` : '+ Wybierz nagranie'}
          </Button>
          <Button variant="primary" disabled={!liveness} onClick={() => setStep(3)}>Dalej</Button>
        </div>
      )}

      {/* Step 3: Consent form */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Krok 3: Formularz zgody</h2>
          <TextField
            label="Imię i nazwisko"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="E-mail"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <div>
            <p className="text-xs text-[var(--ink-faint)] mb-2">Kanały dystrybucji</p>
            {CHANNELS.map(ch => (
              <Checkbox
                key={ch}
                label={ch}
                checked={form.channels.includes(ch)}
                onChange={(checked: boolean) =>
                  setForm(f => ({
                    ...f,
                    channels: checked ? [...f.channels, ch] : f.channels.filter(c => c !== ch),
                  }))
                }
              />
            ))}
          </div>
          <div>
            <p className="text-xs text-[var(--ink-faint)] mb-2">Tematy treści</p>
            {TOPICS.map(t => (
              <Checkbox
                key={t}
                label={t}
                checked={form.topics.includes(t)}
                onChange={(checked: boolean) =>
                  setForm(f => ({
                    ...f,
                    topics: checked ? [...f.topics, t] : f.topics.filter(x => x !== t),
                  }))
                }
              />
            ))}
          </div>
          <Switch
            label="Zgoda na głos (opcjonalnie)"
            checked={form.voiceConsent}
            onChange={(v: boolean) => setForm(f => ({ ...f, voiceConsent: v }))}
          />
          <Button
            variant="primary"
            loading={submitting}
            disabled={!form.name || !form.email || form.channels.length === 0}
            onClick={handleSubmit}
          >
            Wyślij zgodę
          </Button>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: 'var(--accent)', color: 'black' }}
          >
            ✓
          </div>
          <h2 className="text-lg font-semibold">Zgoda zarejestrowana</h2>
          <p className="text-sm text-center text-[var(--ink-faint)]">
            Dziękujemy. Twoja zgoda została zarejestrowana z dowodem kryptograficznym. Możesz ją odwołać w dowolnym momencie.
          </p>
        </div>
      )}
    </div>
  )
}
