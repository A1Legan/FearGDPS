'use client'

import { useState, useEffect, useRef } from 'react'

interface Song {
  id: string
  gdId: number
  name: string
  artistName: string
  downloadUrl: string
  fileSize: string
  source: string
  createdAt: string
}

type SourceType = 'upload' | 'url'

export default function MusicAdminPage() {
  const [songs, setSongs]         = useState<Song[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [source, setSource]       = useState<SourceType>('upload')
  const [name, setName]           = useState('')
  const [artistName, setArtist]   = useState('')
  const [gdId, setGdId]           = useState('')
  const [directUrl, setDirectUrl] = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSongs() }, [])

  async function loadSongs() {
    setLoading(true)
    try {
      const r = await fetch('/api/music/list')
      const d = await r.json()
      setSongs(d.songs ?? [])
    } catch { setSongs([]) }
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!name.trim())  { setMessage({ type: 'err', text: 'Введи название песни' }); return }
    if (!gdId.trim())  { setMessage({ type: 'err', text: 'Введи GD Song ID' }); return }
    if (source === 'upload' && !file) { setMessage({ type: 'err', text: 'Выбери аудио файл' }); return }
    if (source === 'url' && !directUrl.trim()) { setMessage({ type: 'err', text: 'Введи ссылку' }); return }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('name',       name.trim())
      form.append('artistName', artistName.trim() || 'Unknown')
      form.append('gdId',       gdId.trim())
      form.append('source',     source)
      if (source === 'upload' && file) form.append('file', file)
      if (source === 'url') form.append('directUrl', directUrl.trim())

      const r = await fetch('/api/music/upload', { method: 'POST', body: form })
      const d = await r.json()

      if (!r.ok) {
        setMessage({ type: 'err', text: d.error ?? 'Ошибка загрузки' })
      } else {
        setMessage({ type: 'ok', text: `Песня добавлена. GD Song ID: ${d.song.gdId}` })
        setName(''); setArtist(''); setGdId(''); setDirectUrl(''); setFile(null)
        if (fileRef.current) fileRef.current.value = ''
        loadSongs()
      }
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Ошибка' })
    }
    setUploading(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0d0d1a', color: '#e0e0f0', fontFamily: 'monospace', padding: '2rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Заголовок */}
        <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: 2, marginBottom: '0.25rem', color: '#a78bfa' }}>
          Justland Music
        </h1>
        <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Добавляй кастомные песни для GDPS. После добавления игрок вводит <b style={{ color: '#c4b5fd' }}>GD Song ID</b> в редакторе уровней.
        </p>

        {/* Форма */}
        <form onSubmit={handleSubmit} style={{
          background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 12,
          padding: '1.5rem', marginBottom: '2rem',
        }}>
          <h2 style={{ color: '#c4b5fd', marginBottom: '1rem', fontSize: '1.1rem' }}>Добавить песню</h2>

          {/* Выбор источника */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {(['upload', 'url'] as SourceType[]).map(s => (
              <button key={s} type="button" onClick={() => setSource(s)} style={{
                padding: '0.4rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem',
                background: source === s ? '#7c3aed' : '#2d2d4e',
                color: source === s ? '#fff' : '#aaa',
                transition: 'all 0.15s',
              }}>
                {s === 'upload' ? 'Файл' : 'Ссылка'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Название песни *" value={name} onChange={setName} placeholder="например: Megalovania" />
            <Field label="Исполнитель"      value={artistName} onChange={setArtist} placeholder="например: Toby Fox" />
            <Field label="GD Song ID *"     value={gdId} onChange={setGdId} placeholder="например: 1000001" type="number" />
          </div>

          <div style={{ marginTop: '1rem' }}>
            {source === 'upload' ? (
              <div>
                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                  Аудио файл (MP3 / OGG) *
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  style={{ color: '#e0e0f0', width: '100%', fontFamily: 'monospace' }}
                />
                <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  Файл сохраняется в public/music на диске сервера. Лимит на трек — 12 МБ.
                </p>
              </div>
            ) : (
              <div>
                <Field
                  label="Ссылка (YouTube / Newgrounds / SoundCloud / прямой mp3) *"
                  value={directUrl}
                  onChange={setDirectUrl}
                  placeholder="https://youtube.com/watch?v=… или https://…/song.mp3"
                />
                <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  Сервер скачает аудио и сконвертирует в mp3. Может занять несколько секунд.
                </p>
              </div>
            )}
          </div>

          {message && (
            <div style={{
              marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 8,
              background: message.type === 'ok' ? '#14532d44' : '#7f1d1d44',
              border: `1px solid ${message.type === 'ok' ? '#22c55e44' : '#ef444444'}`,
              color: message.type === 'ok' ? '#86efac' : '#fca5a5',
              fontSize: '0.9rem',
            }}>
              {message.text}
            </div>
          )}

          <button type="submit" disabled={uploading} style={{
            marginTop: '1.25rem', padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
            background: uploading ? '#4c1d95' : '#7c3aed', color: '#fff',
            fontFamily: 'monospace', fontWeight: 700, cursor: uploading ? 'wait' : 'pointer',
            fontSize: '1rem', transition: 'background 0.15s',
          }}>
            {uploading ? 'Загружаю...' : 'Добавить песню'}
          </button>
        </form>

        {/* Таблица песен */}
        <div style={{ background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #2d2d4e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: '#c4b5fd', fontSize: '1.1rem', margin: 0 }}>Библиотека ({songs.length})</h2>
            <button onClick={loadSongs} style={{
              background: 'transparent', border: '1px solid #4c1d95', color: '#a78bfa',
              borderRadius: 6, padding: '0.3rem 0.8rem', cursor: 'pointer', fontFamily: 'monospace',
            }}>Обновить</button>
          </div>

          {loading ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Загрузка...</p>
          ) : songs.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              Пока нет песен — добавь первую в форме выше.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#12122b' }}>
                  {['ID', 'Название', 'Исполнитель', 'Размер', 'Источник', 'Ссылка'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#7c3aed', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {songs.map((s, i) => (
                  <tr key={s.id} style={{ borderTop: '1px solid #2d2d4e', background: i % 2 ? '#1a1a2e' : '#161626' }}>
                    <td style={{ padding: '0.6rem 1rem', color: '#a78bfa', fontWeight: 700 }}>{s.gdId}</td>
                    <td style={{ padding: '0.6rem 1rem', color: '#e0e0f0' }}>{s.name}</td>
                    <td style={{ padding: '0.6rem 1rem', color: '#9ca3af' }}>{s.artistName}</td>
                    <td style={{ padding: '0.6rem 1rem', color: '#6b7280' }}>{s.fileSize} MB</td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem',
                        background: s.source === 'upload' ? '#4c1d9544' : '#064e3b44',
                        color: s.source === 'upload' ? '#c4b5fd' : '#6ee7b7',
                      }}>{s.source}</span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <a href={s.downloadUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.8rem' }}>
                        скачать
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Инструкция */}
        <div style={{ marginTop: '1.5rem', padding: '1rem 1.5rem', background: '#12122b', borderRadius: 10, border: '1px solid #2d2d4e', fontSize: '0.85rem', color: '#9ca3af', lineHeight: 1.7 }}>
          <b style={{ color: '#a78bfa' }}>Как использовать:</b>
          <ol style={{ margin: '0.5rem 0 0 1rem', paddingLeft: 0 }}>
            <li>Добавь песню, задай уникальный GD Song ID (например, начиная с 1000001)</li>
            <li>В редакторе уровня в GD нажми на иконку музыки → введи этот ID</li>
            <li>GD запросит инфо о песне у GDPS — сервер вернёт метаданные и ссылку для скачивания</li>
          </ol>
          <p style={{ marginTop: '0.75rem', color: '#6b7280', fontSize: '0.8rem' }}>
            Для загрузки файлов в Google Drive нужно настроить переменные <code style={{ color: '#a78bfa' }}>GDRIVE_CLIENT_EMAIL</code>, <code style={{ color: '#a78bfa' }}>GDRIVE_PRIVATE_KEY</code>, <code style={{ color: '#a78bfa' }}>GDRIVE_FOLDER_ID</code> в файле <code>.env.local</code>
          </p>
        </div>
      </div>
    </main>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.4rem' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
          background: '#0d0d1a', border: '1px solid #3d3d5e', color: '#e0e0f0',
          fontFamily: 'monospace', fontSize: '0.9rem', boxSizing: 'border-box',
          outline: 'none',
        }}
      />
    </div>
  )
}
