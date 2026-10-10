'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { CharacterCard } from '@/components/library/CharacterCard'
import { CharacterModal } from '@/components/library/CharacterModal'
import type { Character } from '@/types/api'

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Character | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/characters')
      const data = (await res.json()) as { data?: Character[] } | Character[]
      const list = Array.isArray(data) ? data : (data as { data?: Character[] }).data ?? []
      setCharacters(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Czy na pewno usunąć tę postać?')) return
    setDeleting(id)
    await fetch(`/api/characters/${id}`, { method: 'DELETE' })
    await load()
    setDeleting(null)
  }

  function handleSave(_char: Character) {
    setModal(null)
    void load()
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Postacie</h1>
        <Button variant="primary" onClick={() => setModal('new')}>
          + Nowa postać
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-center font-mono text-[var(--ink-faint)]">Ładowanie…</p>
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-[var(--ink-faint)]">Brak postaci</p>
          <Button variant="primary" onClick={() => setModal('new')}>
            Dodaj pierwszą postać
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {characters.map(char => (
            <CharacterCard
              key={char.id}
              character={char}
              onEdit={c => setModal(c)}
              onDelete={id => {
                void handleDelete(id)
              }}
            />
          ))}
        </div>
      )}

      {/* suppress unused variable warning for deleting state */}
      {deleting && null}

      {modal !== null && (
        <CharacterModal
          character={modal === 'new' ? undefined : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
