'use client'

export default function ChangeLogPage() {

    return (
        <div className='relative flex flex-col items-center justify-center gap-6 md:gap-10 py-8 md:py-0 text-white my-[20vh]' style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;900&display=swap');
            `}</style>

            <div className='flex flex-col gap-10'>
                <div className='fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat' style={{ backgroundImage: "url('/music-bg.jpg')" }} />

                <div className='flex flex-col items-center gap-2 px-4'>
                    <h1 className='text-4xl md:text-7xl font-bold text-white text-center md:whitespace-nowrap'>История обновлений</h1>
                    <p className='text-center opacity-50 text-white font-normal max-w-150'>Интересно почитать, как меняется наш сервер с течением времени? Отлично подойдёт эта страничка</p>
                </div>
                <div className='w-full flex flex-col gap-2 p-5 bg-white/5 backdrop-blur-[50px] border-2 rounded-xl border-white/50'>
                    <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
                        <div className='flex flex-row justify-between items-baseline'>
                            <h3 className='text-xl font-bold'>Beta 2.1.1</h3>
                            <span className='opacity-50 text-md'>Фиксы (12.07.26)</span>
                        </div>
                        <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                            <li>Исправлено множество ошибок в самой игре, а так же в запросах на сервер</li>
                            <li>Повышена защита от спама и DDoS-атак</li>
                            <li>Для Элдер-модераторов появился новый функционал (оценка монет, степени сложности и т.д.)</li>
                        </ul>
                    </div>
                    <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
                        <div className='flex flex-row justify-between items-baseline'>
                            <h3 className='text-xl font-bold'>Beta 2.1</h3>
                            <span className='opacity-50 text-md'>Фиксы (06.07.26)</span>
                        </div>
                        <ul className='list-disc pl-5 opacity-80 flex flex-col gap-1'>
                            <li>Исправлено множество ошибок в самой игре, а так же в запросах на сервер</li>
                            <li>Повышена защита от спама и DDoS-атак</li>
                            <li>Для Элдер-модераторов появился новый функционал (оценка монет, степени сложности и т.д.)</li>
                        </ul>
                    </div>
                    <div className='flex flex-col gap-2 px-3 py-3 bg-white/5 rounded-lg'>
                        <div className='flex flex-row justify-between items-baseline'>
                            <h3 className='text-xl font-bold'>Beta 2.0</h3>
                            <span className='opacity-50 text-md'>Релиз (29.06.26)</span>
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
    )
}