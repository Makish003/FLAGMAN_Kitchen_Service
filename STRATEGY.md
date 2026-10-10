---
name: "Флагман — контроль кухни"
description: "Business strategy answers exported from the initium.sh app for AI agents building the website."
---

# Strategy

## Your business

Fill the form in before you start working with the AI agent. The more concrete you are, the less AI have to guess, and guessing is where conversion gets lost. Short, specific answers beat long vague ones. If something doesn't apply, select "Does not apply" rather than leaving it blank, so the agent knows you didn't skip it by accident.

### What is the business name?

Флагман — контроль кухни

### Give a short summary of your business. (1 to 2 sentences)

Операционный веб-кабинет управляющего рестораном для контроля поставок, партий, сроков годности и доступности меню. Связывает склад и рецептуры с заказами, горячими предложениями, закупками и аналитикой.

### What problem are you solving for your customer?

Разрозненный учёт остатков и сроков приводит к списаниям, неожиданному стоп-листу и заказам, которые кухня не может выполнить. Управляющему нужен единый актуальный обзор с причинами дефицита, FEFO и понятными действиями.

### Do you have a mission statement or tagline? (If not, that's fine, the AI agent will help you shape one later.)

Флагман — контроль кухни. Склад, сроки и меню в одном кабинете.

## Offer

This is what you actually sell on the page, so be concrete.

### What exactly do you sell? List your services or products.

Веб-приложение для одного ресторана: поставки и партии, рецептуры, FEFO, атомарные заказы, стоп-лист, сроки годности, горячие предложения, закупки, прогноз и аналитика. Интерфейс на русском, обновления через SSE.

### How is it packaged? (e.g. one-off project, monthly retainer, tiered packages, single product.) Name the tiers if you have them.

Единый локальный продукт: ASP.NET Core 8 + SQLite WAL, React 19 + TypeScript + SCSS. Одна роль управляющего. Есть воспроизводимый демо-режим и Release-сборка. Коммерческие тарифы не определены.

### What are the price points? And should prices show on the site, or is it "enquire for a quote"?

Цена и модель оплаты в проекте не определены. Не добавлять вымышленные тарифы, оплату или коммерческие обещания. Бесплатный вариант относится к экспорту Initium, а не к стоимости Флагмана.

### Do you offer any guarantee, refund, trial, or free first step? (Big lever for reducing hesitation.)

Демо-режим с загрузкой демонстрационных данных и управляемым временем для проверки сценариев. Включается явно при запуске. Гарантии возврата и коммерческий пробный период не заявлены.

## Audience

If you serve a few different types of client, pick the ONE you most want this website to win, and answer for them. Speaking to one person converts better than speaking to everyone.

### Describe your single ideal client. (Who are they, what's their situation?)

Управляющий одного ресторана, который контролирует кухонный склад, доступность блюд и ежедневные закупки. Работает за компьютером и проверяет данные с телефона.

### What is this customer typing into Google when they look for a service like yours?

Гипотезы, без исследования поискового спроса: контроль сроков годности ресторан, учёт партий продуктов, стоп-лист кухни, FEFO склад, закупки для ресторана. SEO вторично: основной продукт — закрытый рабочий кабинет.

### What feelings are they having because they don't yet have a solution?

Неуверенность в остатках, тревога из-за просрочки, усталость от ручных проверок и неожиданных отказов кухни.

### What's stopping them from achieving the result they want? (Usually time, money, mindset, or lack of knowledge.)

Разрозненные записи, нехватка времени, неполные рецептуры и история продаж, сложность сопоставления единиц и сроков.

### What are the specific doubts running through their head right before they buy? (e.g. "is it worth the price," "will it work for someone like me," "how long will it take.") These become the FAQ.

Почему блюдо в стоп-листе? Из какой партии списан ингредиент? Что случится при двух одновременных заказах? Как повтор заказа защищён от двойного списания? Насколько точен прогноз без истории? Как сохранить данные после перезапуска?

### List the positive outcomes or transformation they'll experience after working with you. Focus on results, not features.

Быстро видеть пригодный склад и причины дефицита, принимать выполнимые заказы, вовремя использовать партии с ближайшим сроком и получать объяснимый список закупок. Финансовый эффект пока не измерен.

## How it works

One of the highest-converting sections for a service business. People stall because they can't picture what working with you looks like.

### Walk me through your client journey in 3 to 5 steps, from first contact to final result.

1. Войти с паролем управляющего; для демонстрации явно включить демо-режим и загрузить данные.
2. Добавить ингредиенты, поставки с партиями и сроками, настроить рецептуры блюд.
3. Проверить обзор, ближайшие сроки и стоп-лист; создать заказ с атомарным FEFO-списанием.
4. Использовать горячие предложения и совместный план, проверить дефициты, закупки и прогноз.
5. Просмотреть журнал и аналитику; следить за обновлением данных и состоянием соединения.

## Proof

A converting site runs on real proof, not stock and placeholders. This is where most projects stall, so it helps to be honest about what you actually have ready.

### How can you show you understand and can solve this problem? (Your relevant background, experience, credentials.)

В репозитории реализованы доменная модель кухни, SQLite-персистентность, FEFO и транзакции. Основания: README.md, DEVELOPMENT_PLAN.md, docs/API.md, docs/DECISIONS.md, docs/VERIFICATION.md, tests/Program.cs и frontend/e2e/app.spec.ts. Биографии и квалификации команды не предоставлены.

### What proof do you have? List testimonials, case studies, reviews, portfolio pieces, notable clients, press, or awards.

Доступны исходный код, Release-сборка, сценарий демонстрации docs/DEMO.md и существующие доменные, интеграционные и E2E-проверки. Отзывы клиентов, внедрения, награды и подтверждённые результаты экономии не предоставлены. В этом задании тесты приложения повторно не запускались.

### Any trust numbers worth featuring? (e.g. years in business, clients served, projects completed.)

Подтверждённых бизнес-метрик нет. Не публиковать число клиентов, процент экономии или скорость операций как измеренные факты.

## Competitors



### List 3 competitors to watch. Name plus website and/or social.

Конкретные конкуренты и ссылки не заданы, конкурентное исследование не выполнялось. Альтернативные процессы для сравнения: таблицы, бумажный журнал, раздельные учётные системы; это категории, не утверждения о конкретных продуктах.

### What do you like or admire about each?

У таблиц знакомый ввод и гибкость; у бумажного журнала низкий порог входа; у специализированного учёта полезна связность операций. Это рабочие гипотезы для дальнейшего исследования.

### What do you dislike?

Для разрозненного ручного процесса характерны задержки обновления, повторный ввод и трудность совместной проверки сроков, рецептур и остатков. Недостатки конкретных поставщиков не исследованы.

### Why will your ideal client choose you over them? What makes you different?

Фокус проекта: понятный кабинет одного ресторана, контроль партий и сроков, FEFO, объяснимые причины стоп-листа, атомарные заказы и воспроизводимая демонстрация. Не заявлять уникальность на рынке без проверки.

## Your Website



### What is the ONE main action you want a visitor to take? (e.g. book a call, submit an enquiry, buy, subscribe.)

Главное действие в рабочем кабинете: создать выполнимый заказ. На обзоре показывать контекстные действия Добавить поставку и Создать заказ. Это операционный интерфейс, не маркетинговый лендинг.

### What happens immediately after they take it? (Instant booking? A form, then you reply within 24h? A discovery call?)

Открывается форма заказа с выбором блюд и количеством. После подтверждения сервер атомарно проверяет пригодный склад и списывает партии по FEFO либо возвращает отказ с причиной. Показывать фактический результат и обновлять остатки; повтор не должен списывать дважды.

### Is there a lower-commitment secondary action for people not ready to buy yet? (e.g. download a guide, join a newsletter, take a quiz.) Most visitors aren't ready on day one, so this catches them.

Изучить обзор склада и меню; в отдельном явно обозначенном демо-режиме — Загрузить демо и пройти воспроизводимый сценарий. Не создавать рассылку или форму заявки без требований.

### Do you have tools it must connect to? (e.g. Calendly, Stripe, Mailchimp, a CRM, an existing booking system.)

Использовать существующий REST API и SSE backend ASP.NET Core 8. React 19, TypeScript, SCSS, lucide-react; SQLite WAL. Внешние POS, платежи, CRM и сервисы бронирования не реализованы и не требуются в текущем объёме.

### Does location matter for getting found? (i.e. do you serve a specific city or area, or work fully remote/global?)

Русский интерфейс, один ресторан. Формы даты/времени используют явно подписанный часовой пояс компьютера; данные API хранятся в UTC, часовой пояс ресторана настраивается. Географический SEO не является задачей кабинета.

### What does success look like 90 days after launch? Put a number on it if you can. (e.g. "10 enquiries a month," "5 bookings a week.")

Предлагаемые критерии приёмки, не фактические показатели: 100% критических сценариев заказа, FEFO, повторов и истечения проходят проверки; все основные экраны доступны на desktop/mobile; ноль потерь данных при повторном запуске в проверяемом сценарии. Бизнес-метрики на 90 дней ещё не согласованы.

### Anything else the agent should know?

Сохранить тёмно-зелёную навигацию #193f35, primary #245d4c, светлый фон #f6f8f5, текст #23382f и границы #e7ece7. Белые карточки, янтарные предупреждения, красные ошибки с текстом; никаких декоративных hero в кабинете. Initium задаёт базовые токены, детали приложения важнее маркетинговых шаблонов. Существующий Segoe UI/Arial допустим; Inter — выбранный шрифт экспорта. Основной текст 14–16px, заголовок страницы около 31px, карточки 18–20px; кнопки 7px, панели 10px. Сохранить клавиатурный фокус и адаптивную навигацию. Единицы g/ml/шт не суммировать. При now >= expiresAt партия непригодна. Рецептуры проданных блюд неизменяемы. Прогноз — модель равномерного спроса, не обещание продаж; без истории явно сообщать об этом. Снимок ограничен 500 партиями и 100 записями журналов; полный журнал с пагинацией. Не заявлять раздельные роли, несколько ресторанов или внешние интеграции. Не мигрировать на Tailwind/shadcn ради экспорта.

## Voice



### 2 to 8 words for how the writing should make a visitor feel.

- Clear
- Calm
- Professional
- Practical

### If you already have a brand voice, provide an example of how you want the writing to sound.

Clear, Calm, Professional, Practical. Русский язык, короткие конкретные подписи: Блюдо в стоп-листе — не хватает 200 г томатов. Партия истекает через 2 часа. Заказ принят, остатки обновлены. Прогноз недоступен — нет истории продаж. Не использовать вымышленные цифры, обещания экономии и технические подробности без пользы для управляющего.

## Sitemap



### What pages should the website include?

What pages should the website include? If you're unsure, list what you think and the agent will refine it later.

- Обзор
- Склад и партии
- Меню и рецептуры
- Стоп-лист
- Сроки годности
- Горячие предложения
- Закупки
- Прогноз
- Аналитика
- Демо (только демо-режим)