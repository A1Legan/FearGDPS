Ассеты для карточек оценки уровней (rate.png).

Пути (относительно корня проекта бота):

  assets/
    rate_card_bg.png        — (опц.) фон карточки 2284x578. Если файла нет —
                              рисуется коричневый градиент из кода.
    fonts/
      Pusab.ttf             — шрифт GD. Любой .ttf/.otf в этой папке подхватится.
                              Имя семейства должно совпадать с FONT в card.ts
                              (сейчас "Pusab").
    icons/
      diff/                 — спрайты сложности (PNG с прозрачным фоном):
        auto.png  easy.png  normal.png  hard.png  harder.png  insane.png
        easy_demon.png  medium_demon.png  hard_demon.png
        insane_demon.png  extreme_demon.png  na.png
      quality/              — спрайты качества (нижний слой, под сложностью):
        featured.png  epic.png  legendary.png  mythic.png

Слои снизу вверх: фон -> quality -> difficulty -> текст.
Геометрия иконок настраивается объектом ICON в src/event/rates/card.ts.
