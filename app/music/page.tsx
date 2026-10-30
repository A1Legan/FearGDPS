'use client'

import { useState, useEffect, useRef } from 'react'

interface Song { id: string; gdId: number; name: string; artistName: string; source: string; createdAt: string }
type View = 'url' | 'upload' | 'rules'

// ДД/ММ/ГГГГ из ISO-даты загрузки трека
function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export default function MusicPage() {
  const [view, setView]           = useState<View>('url')
  const [name, setName]           = useState('')
  const [artistName, setArtist]   = useState('')
  const [directUrl, setDirectUrl] = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<{ gdId: number; name: string } | null>(null)
  const [recent, setRecent] = useState<Song[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => { loadRecent() }, [])
  async function loadRecent() {
    try {
      const r = await fetch('/api/music/list'); const d = await r.json()
      const sorted = (d.songs ?? []).slice().sort((a: Song, b: Song) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRecent(sorted.slice(0, 100))
    } catch {}
  }

  function switchView(v: View) { setView(v); setError(''); setResult(null); setCopied(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setResult(null); setCopied(false)
    const source = view // 'url' | 'upload'
    if (source === 'upload' && !file)             { setError('Выбери аудио-файл'); return }
    if (source === 'upload' && file && file.size > 12 * 1024 * 1024) { setError('Файл больше 12 МБ — выбери поменьше'); return }
    if (source === 'url'    && !directUrl.trim()) { setError('Вставь ссылку');     return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('name', name.trim()); form.append('artistName', artistName.trim() || 'Unknown'); form.append('source', source)
      if (source === 'upload' && file) form.append('file', file)
      if (source === 'url') form.append('directUrl', directUrl.trim())
      const r = await fetch('/api/music/upload', { method: 'POST', body: form })
      const d = await r.json()
      if (!r.ok) setError(d.error ?? 'Не получилось добавить песню')
      else {
        setResult({ gdId: d.song.gdId, name: d.song.name })
        setName(''); setArtist(''); setDirectUrl(''); setFile(null)
        if (fileRef.current) fileRef.current.value = ''
        loadRecent()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка сети') }
    setBusy(false)
  }

  function copyId() {
    if (!result) return
    navigator.clipboard?.writeText(String(result.gdId)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  return (
    <div className='relative flex flex-col items-center justify-center gap-6 md:gap-10 min-h-screen md:h-screen py-8 md:py-0 text-white' style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;900&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
        @media (min-width: 768px) {
          .fade-bottom {
            -webkit-mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
            mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
          }
        }
      `}</style>

      {/* Фон страницы — фиксированная картинка на весь экран */}
      <div className='fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat' style={{ backgroundImage: "url('/music-bg.jpg')" }} />

      <div className='flex flex-col items-center gap-2 px-4'>
        <h1 className='text-4xl md:text-7xl font-bold text-white text-center md:whitespace-nowrap'>Загрузка музыки</h1>
        <p className='text-center opacity-50 text-white font-normal max-w-150'>Тут ты можешь загрузить любой трек на великий FearGDPS через ссылку или загрузив файл с компьютера!</p>
      </div>

      {/* Мобайл: колонка (кнопки → форма → список). Десктоп: три колонки (список → форма → кнопки). */}
      <div className='flex flex-col md:flex-row gap-5 md:items-stretch w-full px-4 md:px-0 md:w-auto'>

        {/* ── ЛЕВЫЙ блок: список треков / чейнджлог. На мобайле — внизу (order-3) ── */}
        {view === 'rules' ? (
          <div className='order-3 md:order-1 w-full md:w-101 flex flex-col gap-2 p-5 bg-white/5 backdrop-blur-[50px] border-2 rounded-xl border-white/50'>
            <div className='relative md:flex-1 md:min-h-0'>
              <div className='md:absolute md:inset-0 overflow-y-auto no-scrollbar flex flex-col gap-2 fade-bottom'>
                <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
                  <div className='flex flex-row justify-between items-baseline'>
                    <h3 className='text-xl font-bold'>Beta 2.2</h3>
                    <span className='opacity-50 text-md'>Система банов</span>
                  </div>
                  <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                    <div>
                      <h4 className='text-lg font-bold'>Новое</h4>
                      <li>У элдер-модерации появилась возможность выдавать блокировки на аккаунты на GDPS. Теперь в профиле каждого игрока есть две кнопки с разной степенью бана в игре. Первая - бан в лидерборде, вторая - полная блокировка на сервере</li>
                    </div>
                    <div>
                      <h4 className='text-lg font-bold'>Исправления</h4>
                      <li>Исправлен баг, из-за которого при оценке уровня в 10 звёзд не проставлялась метка демона</li>
                      <li>Исправлен баг с некорректным отображением Featured/Epic при оценке уровня</li>
                      <li>Исправлен баг со сбросом сложности и статуса Auto при оценке демона</li>
                    </div>
                    <div>
                      <h4 className='text-lg font-bold'>В процессе</h4>
                      <li>Дискорд-бот, фиксирующий логи выложенных уровней и оценки их на звёзды, а так же система наказаний для модерации Discord-сервера</li>
                      <li>Продолжаем активно подготавливать сервер к переносу на новый хостинг и домен. Потерпите ещё немного</li>
                    </div>
                  </ul>
                </div>
                <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
                  <div className='flex flex-row justify-between items-baseline'>
                    <h3 className='text-xl font-bold'>Beta 2.1.1</h3>
                    <span className='opacity-50 text-md'>Фиксы</span>
                  </div>
                  <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                    <li>Исправлен баг, позволявший бесконечно отправлять запросы на оценку уровня</li>
                    <li>Исправлен баг, сломавший оценку уровней у элдер-модераторов</li>
                    <li>Исправлен баг, который не давал обычным игрокам ставить сложность от Easy Demon до Extreme Demon</li>
                    <li>Исправлен баг, который при наличии у уровня пароля не позволял его скачать с сервера</li>
                    <li>Выяснена причина, по которой сервер не отвечал из некоторых регионов (в процессе исправления)</li>
                  </ul>
                </div>
                <div className='flex flex-col gap-2 px-2 py-3 bg-white/5 rounded-lg'>
                  <div className='flex flex-row justify-between items-baseline'>
                    <h3 className='text-xl font-bold'>Beta 2.1</h3>
                    <span className='opacity-50 text-md'>Фиксы</span>
                  </div>
                  <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                    <li>Исправлено множество ошибок в самой игре, а так же в запросах на сервер</li>
                    <li>Повышена защита от спама и DDoS-атак</li>
                    <li>Для Элдер-модераторов появился новый функционал (оценка монет, степени сложности и т.д.)</li>
                  </ul>
                </div>
                <div className='flex flex-col gap-2 px-2 py-3 bg-white/5 rounded-lg'>
                  <div className='flex flex-row justify-between items-baseline'>
                    <h3 className='text-xl font-bold'>Beta 2.0</h3>
                    <span className='opacity-50 text-md'>Релиз</span>
                  </div>
                  <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                    <li>Проект запускает свой первый бета-тест</li>
                    <li>Улучшение функционала для модерации</li>
                    <li>Исправление ошибок RobTop`а (не создавать GD)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className='order-3 md:order-1 w-full md:w-101 flex flex-col gap-2 p-5 bg-white/5 backdrop-blur-[50px] border-2 rounded-xl border-white/50'>
            <h2 className='text-2xl font-bold pb-3'>Последние треки:</h2>
            <div className='relative md:flex-1 md:min-h-0'>
              <div className='md:absolute md:inset-0 overflow-y-auto no-scrollbar fade-bottom flex flex-col gap-2'>
                {recent.length === 0 && <p className='opacity-40'>Пока пусто</p>}
                {recent.map(s => (
                  <div key={s.id} className='flex flex-row justify-between tracking-wider'>
                    <div className='flex flex-col text-white'>
                      <p className='font-bold text-lg'>{s.name}</p>
                      <p className='font-normal text-md opacity-50'>{s.artistName}</p>
                    </div>
                    <div className='text-[#9387FF]'>
                      <p className='font-bold text-end'>ID: {s.gdId}</p>
                      <p className='font-normal text-end opacity-50'>{fmtDate(s.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── СРЕДНИЙ блок: форма / правила. Мобайл — по центру (order-2) ── */}
        {view === 'rules' ? (
          <div className='order-2 w-full md:w-101 flex flex-col gap-2 p-5 bg-white/5 backdrop-blur-[50px] border-2 rounded-xl border-white/50'>
            <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
              <h3 className='text-2xl font-bold'>MP3/OGG-файлы</h3>
              <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                <li>Файл до 12 Мб</li>
                <li>Формат поддерживаемых файлов: MP3 и OGG</li>
              </ul>
            </div>
            <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
              <h3 className='text-2xl font-bold'>Любая ссылка</h3>
              <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                <li>Ссылка должна вести на открытый источник</li>
                <li>В ссылке не должно присутствовать русских символов</li>
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='order-2 w-full md:w-101 flex flex-col gap-5 p-5 bg-white/5 backdrop-blur-[50px] border-2 rounded-xl border-white/50'>
            <Field label="Название трека" placeholder='Например: appetite' value={name} onChange={setName} />
            <Field label="Автор трека" placeholder='Например: STIM' value={artistName} onChange={setArtist} />
            {view === 'url' ? (
              <Field label="Ссылка *" placeholder='https://youtu.be/H2nAZZjJ5eM?si' value={directUrl} onChange={setDirectUrl} />
            ) : (
              <div className='flex flex-col gap-1'>
                <label className='font-medium text-xl'>MP3-файл <span className='text-[#ff5a5a]'>*</span></label>
                <button type='button' onClick={() => fileRef.current?.click()}
                  className='border-2 border-dashed border-[#7c6fff] rounded-xl p-3 w-full text-center opacity-90 hover:opacity-100 transition'>
                  {file ? file.name : 'Выбрать файл с компьютера'}
                </button>
                <input ref={fileRef} type='file' accept='audio/*,.mp3,.ogg,.wav,.m4a' className='hidden'
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>
            )}
            <button type="submit" disabled={busy}
              style={{ marginTop: '1.25rem', width: '100%', padding: '0.7rem 1.5rem', borderRadius: 8, border: 'none', background: busy ? '#4c1d95' : '#7c3aed', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: '1rem' }}>
              {busy ? '⏳ Загружаю…' : 'Загрузить'}
            </button>
            {error && <p className='text-[#ff6b6b] text-md'>{error}</p>}
            {result && (
              <p className='text-md'>
                <span className='opacity-70'>Готово! ID трека: </span>
                <button type='button' onClick={copyId} className='text-[#9387FF] font-bold underline'>
                  {result.gdId}{copied ? ' — скопировано' : ' (копировать)'}
                </button>
              </p>
            )}
          </form>
        )}

        {/* ── ПРАВЫЙ блок: кнопки-вкладки. Мобайл — сверху (order-1) ── */}
        <div className='order-1 md:order-3 w-full md:w-101 md:self-start flex flex-col gap-5'>
          <TabButton active={view === 'url'} onClick={() => switchView('url')}
            title="Любая ссылка" desc="Загружай трек почти с любой площадки. Нужна только ссылка на музыку!" />
          <TabButton active={view === 'upload'} onClick={() => switchView('upload')}
            title="MP3/OGG-файл" desc="Можно попробовать и свой файл с компьютера, главное, чтобы он подходил по формату!" />
          <TabButton active={view === 'rules'} onClick={() => switchView('rules')}
            title="Правила" desc="Здесь можно почитать правила загрузки треков и историю обновлений сервера!"/>
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc?: string }) {
  return (
    <button type='button' onClick={onClick}
      className={`text-left p-5 w-full rounded-xl border-2 backdrop-blur-[50px] transition ${active ? 'border-white/50 bg-white/5' : 'border-white/15 bg-white/3 hover:border-white/30'}`}>
      <h3 className={`text-2xl font-bold ${active ? 'text-white' : 'text-white/40'}`}>{title}</h3>
      {desc && <p className={`text-md font-normal mt-2 text-white ${active ? 'opacity-50' : 'opacity-25'}`}>{desc}</p>}
    </button>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className='flex flex-col gap-2'>
      <label className='font-medium text-xl'>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className='bg-white/5 p-3 rounded-xl w-full' />
    </div>
  )
}
