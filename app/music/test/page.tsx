'use client'

import { useState, useRef } from 'react'

export default function MusicTestPage() {
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile]               = useState<File | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; gdId?: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function filenameToTitle(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    if (!file) { setResult({ ok: false, text: 'Выбери MP3 файл' }); return }

    const finalTitle       = title.trim()       || filenameToTitle(file.name)
    const finalDescription = description.trim() || filenameToTitle(file.name)

    setUploading(true)
    try {
      const form = new FormData()
      form.append('name',        finalTitle)
      form.append('description', finalDescription)
      form.append('source',      'upload')
      form.append('file',        file)
      // gdId не передаём — сервер сгенерирует автоматически

      const r = await fetch('/api/music/upload', { method: 'POST', body: form })
      const d = await r.json()

      if (!r.ok) {
        setResult({ ok: false, text: d.error ?? 'Ошибка загрузки' })
      } else {
        setResult({ ok: true, text: `Загружено: "${d.song.name}"`, gdId: d.song.gdId })
        setTitle(''); setDescription(''); setFile(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Ошибка' })
    }
    setUploading(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0d0d1a', color: '#e0e0f0', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.25rem', color: '#a78bfa' }}>
          Тест загрузки музыки
        </h1>
        <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Загрузи MP3 — ID назначится автоматически. Название и описание необязательны: если пусто, возьмутся из имени файла.
        </p>

        <form onSubmit={handleSubmit} style={{
          background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 12, padding: '1.5rem',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
              MP3 файл *
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,.mp3"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              style={{ color: '#e0e0f0', width: '100%', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
              Название (необязательно — иначе из имени файла)
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={file ? filenameToTitle(file.name) : 'например: Megalovania'}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                background: '#0d0d1a', border: '1px solid #3d3d5e', color: '#e0e0f0',
                fontFamily: 'monospace', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
              Описание (необязательно — иначе из имени файла)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={file ? filenameToTitle(file.name) : 'короткое описание'}
              rows={3}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                background: '#0d0d1a', border: '1px solid #3d3d5e', color: '#e0e0f0',
                fontFamily: 'monospace', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          {result && (
            <div style={{
              marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: 8,
              background: result.ok ? '#14532d44' : '#7f1d1d44',
              border: `1px solid ${result.ok ? '#22c55e44' : '#ef444444'}`,
              color: result.ok ? '#86efac' : '#fca5a5', fontSize: '0.9rem',
            }}>
              {result.text}
              {result.ok && result.gdId !== undefined && (
                <div style={{ marginTop: '0.4rem', fontSize: '1.1rem', fontWeight: 900, color: '#c4b5fd' }}>
                  GD Song ID: {result.gdId}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={uploading} style={{
            padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
            background: uploading ? '#4c1d95' : '#7c3aed', color: '#fff',
            fontFamily: 'monospace', fontWeight: 700, cursor: uploading ? 'wait' : 'pointer',
            fontSize: '1rem',
          }}>
            {uploading ? 'Загружаю...' : 'Загрузить и получить ID'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', color: '#666', fontSize: '0.8rem' }}>
          Полный список и ручное управление: <a href="/music" style={{ color: '#60a5fa' }}>/music</a>
        </p>
      </div>
    </main>
  )
}
