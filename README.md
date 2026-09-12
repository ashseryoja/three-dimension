# Three Dimension — сайт 3D-студии

Статичный сайт без сборки: `index.html` + `assets/`. Mobile-first, живая 3D-сцена на Three.js
(лежит локально в `assets/vendor/three`, интернет для 3D не нужен), параллакс, кастомный курсор,
слайдер «сетка / рендер», мини-конфигуратор материалов.

## Запуск локально

Двойной клик по `start.command` (поднимает `python3 -m http.server 8099` и открывает браузер),
либо в терминале:

```bash
python3 -m http.server 8099
```

Открывать нужно именно через сервер (`http://localhost:8099`), а не двойным кликом по `index.html`:
браузер не разрешает ES-модули с `file://`.

## Продакшн

- Сайт: <https://three-dimension-iota.vercel.app>
- Vercel: проект `three-dimension` в команде «welcome-9510's projects», привязан к GitHub-репозиторию
  `ashseryoja/three-dimension`.
- Деплой: любой push в ветку `main` автоматически выкатывается в production (около 30 секунд).
  Вручную из папки проекта: `npx vercel deploy --prod --scope welcome-9510s-projects`.
- Доступ: Vercel Authentication отключена для production (осталась только для preview-деплоев), сайт публичный.
- OG-превью для мессенджеров: `assets/img/og.jpg` (1200×630). Пересоздать: открыть `/?og=1` в окне 1200×630
  и сделать скриншот — этот режим прячет лоадер, курсор и анимации.
- Свой домен: Vercel → проект → Settings → Domains. После этого заменить абсолютные адреса в `og:url`,
  `og:image` и `twitter:image` в `index.html`.

## Что заменить перед отправкой клиентам

- **Контакты** — кнопки в секции CTA (`index.html`): Telegram `https://t.me/ashseryoja`,
  WhatsApp `https://api.whatsapp.com/send?phone=37494351626`.
- **Название** — «three dimension» в шапке, подвале, `<title>` и meta-описании.
- **Тексты** — все секции на русском, редактируются прямо в `index.html`.

## Структура

```
index.html               разметка и тексты
assets/css/styles.css    стили (mobile-first, брейкпоинты 720 / 1024)
assets/js/main.js        интерфейс: лоадер, меню, курсор, параллакс, слайдер, конфигуратор
assets/js/scene.js       3D-сцена: кресло, ключевые кадры по скроллу, split-рендер, материалы
assets/vendor/three      Three.js r170 (MIT) + GLTFLoader, meshopt-декодер, RoomEnvironment
assets/models/chair.glb  лаунж-кресло, 2k-текстуры WebP + meshopt (720 КБ) — для десктопа
assets/models/chair-1k.glb  то же с 1k-текстурами (295 КБ) — для телефонов
assets/img/favicon.svg   иконка
assets/img/og.jpg        превью ссылки 1200×630
```

## 3D-модель

«Mid Century Lounge Chair» (Kuutti Siitonen, Poly Haven, лицензия CC0 — атрибуция не требуется).
Исходник: <https://polyhaven.com/a/mid_century_lounge_chair>. Пересобрать из GLTF:

```bash
npx @gltf-transform/cli webp in.gltf tmp.glb --quality 78
npx @gltf-transform/cli meshopt tmp.glb assets/models/chair.glb --level high
```

Чтобы подставить другую модель, достаточно положить GLB с одним мешем: `scene.js` сам разбивает его
на связные детали для «взрыва», а роли (кожа / дерево / металл) определяет по цвету и положению деталей —
правила в функции загрузки (`role = …`).

## Как устроена 3D-сцена

Один фиксированный `<canvas>` на всю страницу. Кресло загружается из GLB и «путешествует» по разделам
(на телефонах первый экран без 3D — модель появляется с раздела «Процесс»): у каждого раздела есть невидимый элемент-якорь
(`.why__stage`, `.process__stage`, `#compareStage`, `.config__stage`, `.cta__stage`), к центру которого
кресло привязывается. Ключевые кадры описаны в массиве `KF` в `scene.js` — там же меняются
взрыв на детали, сетка, высота «скана» материала и масштаб.
