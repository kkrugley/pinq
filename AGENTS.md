# Pair-In Quick Development Agent

You are an expert full-stack developer specializing in WebRTC, P2P file transfer, and cross-platform development. Your task is to implement Pair-In Quick — a P2P file and text transfer system between phone (PWA) and computer (CLI) without cloud storage.

## Project Overview

Pair-In Quick enables direct peer-to-peer transfer of files and text from a mobile phone to guest computers using:
- **PWA** (Svelte + Tailwind) deployed on Vercel
- **CLI app** (Node.js) distributed via npm/Homebrew/Winget
- **Signaling server** (Node.js + Socket.io) hosted on Render.com
- **WebRTC DataChannel** for P2P transfer with STUN/TURN servers

## Core Requirements

1. **Security & Privacy**
   - All data transfers via P2P (WebRTC DataChannel with DTLS encryption)
   - Signaling server only exchanges SDP/ICE candidates, never file contents
   - 6-digit pairing codes with 5-minute TTL

2. **User Experience**
   - PWA: Simple UI with file/text selection and pairing code display
   - CLI: Single command `qshare receive ABC123` with progress indicators
   - Auto-save files to ~/Downloads, display text in console
   - Pre-warming for Render.com cold starts

3. **Technical Constraints**
   - Max file size: 50 MB
   - Chunk size: 16 KB for WebRTC DataChannel
   - Progress bars for files >1 MB
   - Handle NAT traversal using public STUN servers
   - Fallback to TURN for symmetric NAT (<10% cases)

4. **Code Quality**
   - TypeScript for all components
   - Clean, modular architecture
   - Error handling with user-friendly messages
   - Follow monorepo structure (pnpm workspace)

## Technology Stack

### PWA (apps/pwa/)
- **Framework:** Svelte 4.x
- **Styling:** Tailwind CSS
- **Build:** Vite
- **WebRTC:** simple-peer library
- **Signaling:** socket.io-client

### CLI (apps/cli/)
- **Runtime:** Node.js (cross-platform)
- **CLI framework:** Commander.js
- **WebRTC:** simple-peer + wrtc (for Node.js)
- **UI:** chalk, ora, cli-progress
- **Signaling:** socket.io-client

### Signaling Server (apps/signaling/)
- **Runtime:** Node.js
- **WebSocket:** Socket.io
- **HTTP server:** Express
- **Deployment:** Render.com (free tier)

## Key Implementation Details

### Signaling Protocol
```
// Room-based signaling via Socket.io
Events:
- 'join-room' → { code: string }
- 'signal' → { code: string, signal: RTCSessionDescription | RTCIceCandidate }
- 'disconnect' → cleanup room
```

### Data Transfer Protocol
```
// First message = metadata
{ type: 'text' | 'file', filename?: string, size?: number, mimeType?: string }

// Subsequent messages = data chunks (16KB)
// Last message = 'EOF'
```

### STUN/TURN Configuration
```
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' }
]
```

## Development Priorities

1. **Start with Signaling Server** (foundation for testing)
2. **Then CLI** (easier to debug than mobile PWA)
3. **Then PWA** (build on working backend)
4. **Integration testing** across all components
5. **Documentation and deployment**

## Expected Deliverables

- Fully functional monorepo with 3 apps
- Signaling server deployed to Render.com
- PWA deployed to Vercel
- CLI published to npm
- README with setup instructions
- Working P2P transfer for text and files up to 50MB

## Code Style

- Use async/await over callbacks
- Prefer functional components in Svelte
- Add JSDoc comments for complex functions
- Use descriptive variable names
- Handle all errors gracefully with try/catch

## Success Criteria

✅ User can send text from PWA → displays in CLI terminal
✅ User can send file from PWA → saves to ~/Downloads
✅ Progress bar shows for files >1MB
✅ Works across different networks (using STUN)
✅ Pairing codes expire after 5 minutes
✅ CLI handles Render.com cold starts gracefully

Begin implementation following the detailed plan below. Focus on clean, production-ready code with proper error handling.


***

## 🚀 План разработки Pair-In Quick

### Подготовка проекта

**Задача 0: Инициализация monorepo**

```bash
# Структура проекта
pinq/
├── apps/
│   ├── pwa/
│   ├── cli/
│   └── signaling/
├── package.json
├── pnpm-workspace.yaml
├── .gitignore
├── .gitattributes
└── README.md
```

**Технические требования:**
- Использовать pnpm для управления monorepo
- Общие зависимости в корневом package.json
- Настроить TypeScript для всех приложений
- Добавить общие скрипты: `dev`, `build`, `test`

***

## Компонент 1: Signaling Server (приоритет 1)

**Цель:** Минимальный WebSocket сервер для обмена SDP/ICE candidates между устройствами.

### Задачи:

**1.1 Инициализация проекта signaling сервера**

```
apps/signaling/
├── src/
│   ├── index.ts          # Точка входа
│   ├── server.ts         # Socket.io сервер
│   └── types.ts          # TypeScript типы
├── package.json
├── tsconfig.json
└── .env.example
```

**Зависимости:**
```json
{
  "dependencies": {
    "socket.io": "^4.7.0",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

**1.2 Реализация логики signaling сервера**

**Функционал:**
- WebSocket сервер на порту 3000 (или из ENV)
- Управление комнатами (rooms) по кодам паринга
- TTL для кодов: 5 минут (автоудаление)
- Обмен событиями: `join-room`, `signal`, `disconnect`
- CORS для работы с PWA на Vercel
- Health check endpoint `/health` для мониторинга

**Основные события:**
```typescript
// Псевдокод событий
socket.on('join-room', (code: string) => {
  // Добавить сокет в комнату
  // Уведомить других участников
  // Установить TTL таймер
});

socket.on('signal', ({ code, signal }) => {
  // Переслать SDP/ICE другому участнику комнаты
});

socket.on('disconnect', () => {
  // Очистить комнату
  // Уведомить второго участника
});
```

**1.3 Подготовка к деплою на Render.com**

**Файлы:**
- `render.yaml` — конфигурация для автодеплоя
- `.env.example` — переменные окружения
- `start` скрипт в package.json

**render.yaml:**
```yaml
services:
  - type: web
    name: pinq-signaling
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: node dist/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
```

***

## Компонент 2: CLI-приложение (приоритет 2)

**Цель:** Консольное приложение для приема файлов и текста с телефона.

### Задачи:

**2.1 Инициализация CLI проекта**

```
apps/cli/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── commands/
│   │   └── receive.ts    # Команда receive
│   ├── webrtc/
│   │   ├── peer.ts       # WebRTC peer логика
│   │   └── signaling.ts  # Socket.io клиент
│   ├── utils/
│   │   ├── file.ts       # Работа с файлами
│   │   └── display.ts    # CLI UI (прогресс, спиннеры)
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md
```

**Зависимости:**
```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "simple-peer": "^9.11.1",
    "socket.io-client": "^4.7.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "cli-progress": "^3.12.0",
    "wrtc": "^0.4.7"
  },
  "bin": {
    "qshare": "./dist/index.js"
  }
}
```

**2.2 Реализация команды `receive`**

**Использование:**
```bash
qshare receive ABC123
# или
qshare receive ABC123 --path ~/Desktop --confirm
```

**Флаги:**
- `--path <dir>` — директория сохранения (по умолчанию ~/Downloads)
- `--confirm` — запрашивать подтверждение перед приемом
- `--verbose` — детальный вывод для дебага

**Логика:**
1. Парсинг аргументов (код + флаги)
2. Показать спиннер "Подключение к signaling серверу..."
3. Pre-warming запрос (если Render.com спит)
4. Подключение к WebSocket по коду
5. Ожидание WebRTC offer от телефона
6. Обмен SDP/ICE candidates
7. Установка DataChannel соединения
8. Прием данных (текст или файл)
9. Обработка:
   - Текст → вывод в консоль с подсветкой
   - Файл → сохранение с прогресс-баром
10. Отправка ACK и закрытие соединения

**2.3 WebRTC peer реализация**

**Функционал:**
```typescript
// Псевдокод peer.ts
class WebRTCReceiver {
  private peer: SimplePeer.Instance;
  
  constructor(signalingUrl: string, code: string) {
    // Инициализация simple-peer с STUN серверами
    this.peer = new SimplePeer({
      initiator: false,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          // ExpressTURN если нужно
        ]
      }
    });
  }
  
  async connect() {
    // Обмен signaling через WebSocket
  }
  
  onData(callback: (data: Buffer | string) => void) {
    this.peer.on('data', callback);
  }
}
```

**2.4 Обработка данных**

**Протокол передачи:**
```typescript
// Первый chunk = метаданные
interface Metadata {
  type: 'text' | 'file';
  filename?: string;
  size?: number;
  mimeType?: string;
}

// Последующие chunks = данные
// Последний chunk = 'EOF'
```

**Для текста:**
```typescript
if (metadata.type === 'text') {
  let text = '';
  peer.on('data', (chunk) => {
    if (chunk === 'EOF') {
      console.log(chalk.green(text));
    } else {
      text += chunk;
    }
  });
}
```

**Для файлов:**
```typescript
if (metadata.type === 'file') {
  const filepath = path.join(downloadDir, metadata.filename);
  const writeStream = fs.createWriteStream(filepath);
  const progressBar = new CliProgress.SingleBar(...);
  
  peer.on('data', (chunk) => {
    if (chunk === 'EOF') {
      writeStream.end();
      progressBar.stop();
      console.log(chalk.green(`✓ Saved: ${filepath}`));
    } else {
      writeStream.write(chunk);
      progressBar.increment(chunk.length);
    }
  });
}
```

**2.5 Подготовка к публикации**

**npm:**
```json
{
  "name": "pinq-cli",
  "version": "0.1.0",
  "bin": {
    "qshare": "./dist/index.js"
  },
  "files": ["dist"],
  "keywords": ["webrtc", "p2p", "file-transfer", "cli"]
}
```

**Homebrew (formula):**
```ruby
# Formula/pinq.rb
class QuickShare < Formula
  desc "P2P file transfer CLI companion"
  homepage "https://github.com/yourusername/pinq"
  url "https://registry.npmjs.org/pinq-cli/-/pinq-cli-0.1.0.tgz"
  sha256 "..."
  
  depends_on "node"
  
  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end
end
```

**Winget (manifest):**
```yaml
# manifests/q/QuickShare/QuickShare/0.1.0.yaml
PackageIdentifier: QuickShare.QuickShare
PackageVersion: 0.1.0
PackageLocale: en-US
Publisher: Your Name
PackageName: Pair-In Quick CLI
License: GPL v3
ShortDescription: P2P file transfer companion
InstallModes:
  - interactive
Installers:
  - Architecture: x64
    InstallerType: portable
    InstallerUrl: https://github.com/.../qshare-win.exe
```

***

## Компонент 3: PWA (приоритет 3)

**Цель:** Веб-приложение для отправки файлов и текста с телефона.

### Задачи:

**3.1 Инициализация PWA проекта (Svelte + Vite)**

```
apps/pwa/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── CodeDisplay.svelte      # Код паринга
│   │   │   ├── FileSelector.svelte     # Выбор файла
│   │   │   ├── TextInput.svelte        # Ввод текста
│   │   │   ├── ProgressBar.svelte      # Прогресс передачи
│   │   │   └── ConnectionStatus.svelte # Статус соединения
│   │   ├── webrtc/
│   │   │   ├── peer.ts                 # WebRTC отправитель
│   │   │   └── signaling.ts            # WebSocket клиент
│   │   └── utils/
│   │       ├── codeGenerator.ts        # Генератор кодов
│   │       └── fileChunker.ts          # Разбивка файлов на chunks
│   ├── App.svelte                       # Главный компонент
│   ├── main.ts
│   └── app.css
├── public/
│   ├── manifest.json                    # PWA манифест
│   ├── service-worker.js                # Service Worker
│   └── icons/                           # Иконки для PWA
├── index.html
├── vite.config.ts
└── package.json
```

**Зависимости:**
```json
{
  "dependencies": {
    "svelte": "^4.0.0",
    "simple-peer": "^9.11.1",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "vite": "^5.0.0",
    "vite-plugin-pwa": "^0.17.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

**3.2 UI/UX дизайн**

**Главный экран (состояния):**

1. **Idle (начальное):**
   ```
   ┌──────────────────────────┐
   │      Pair-In Quick         │
   │                          │
   │  [📄 Send Text]          │
   │  [📁 Send File]          │
   │                          │
   └──────────────────────────┘
   ```

2. **Выбор контента:**
   ```
   ┌──────────────────────────┐
   │  📄 Send Text            │
   │                          │
   │  ┌────────────────────┐  │
   │  │ Enter text here... │  │
   │  │                    │  │
   │  └────────────────────┘  │
   │                          │
   │       [Send ➜]           │
   └──────────────────────────┘
   ```

3. **Ожидание подключения:**
   ```
   ┌──────────────────────────┐
   │  Waiting for receiver... │
   │                          │
   │      ┌─────────┐         │
   │      │ ABC123  │         │
   │      └─────────┘         │
   │                          │
   │  Enter this code on      │
   │  computer CLI            │
   │                          │
   │  [Cancel]                │
   └──────────────────────────┘
   ```

4. **Передача:**
   ```
   ┌──────────────────────────┐
   │  Sending...              │
   │                          │
   │  document.pdf            │
   │  ████████░░ 80%          │
   │  4.2 MB / 5.0 MB         │
   │                          │
   └──────────────────────────┘
   ```

5. **Успех:**
   ```
   ┌──────────────────────────┐
   │  ✓ Sent successfully!    │
   │                          │
   │  document.pdf            │
   │  5.0 MB                  │
   │                          │
   │  [Send Another]          │
   └──────────────────────────┘
   ```

**3.3 Логика WebRTC отправителя**

```typescript
// lib/webrtc/peer.ts
class WebRTCSender {
  private peer: SimplePeer.Instance;
  
  constructor(signalingUrl: string, code: string) {
    this.peer = new SimplePeer({
      initiator: true,  // PWA = инициатор
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' }
        ]
      }
    });
  }
  
  async sendText(text: string) {
    // Отправка метаданных
    this.peer.send(JSON.stringify({ type: 'text' }));
    
    // Отправка текста (chunks по 16KB если большой)
    const chunks = chunkText(text, 16 * 1024);
    for (const chunk of chunks) {
      this.peer.send(chunk);
    }
    
    // EOF маркер
    this.peer.send('EOF');
  }
  
  async sendFile(file: File, onProgress: (percent: number) => void) {
    // Отправка метаданных
    this.peer.send(JSON.stringify({
      type: 'file',
      filename: file.name,
      size: file.size,
      mimeType: file.type
    }));
    
    // Чтение и отправка файла chunks
    const chunkSize = 16 * 1024;
    let offset = 0;
    
    while (offset < file.size) {
      const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer();
      this.peer.send(Buffer.from(chunk));
      
      offset += chunkSize;
      onProgress((offset / file.size) * 100);
    }
    
    // EOF маркер
    this.peer.send('EOF');
  }
}
```

**3.4 Генератор кодов паринга**

```typescript
// lib/utils/codeGenerator.ts
export function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
```

**3.5 PWA манифест и Service Worker**

**manifest.json:**
```json
{
  "name": "Pair-In Quick",
  "short_name": "QShare",
  "description": "P2P file and text transfer",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Service Worker (для офлайн):**
```javascript
// public/service-worker.js
const CACHE_NAME = 'pinq-v1';
const urlsToCache = ['/', '/index.html', '/assets/index.js', '/assets/index.css'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
```

**3.6 Настройка Tailwind CSS**

```javascript
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        success: '#10b981',
        error: '#ef4444'
      }
    }
  }
}
```

**3.7 Деплой на Vercel**

**vercel.json:**
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

***

## Компонент 4: Интеграция и тестирование

### Задачи:

**4.1 Сквозное тестирование**

**Тестовые сценарии:**

1. **Отправка текста (пароль):**
   - PWA: ввести "MyPassword123" → получить код ABC123
   - CLI: `qshare receive ABC123`
   - Проверка: текст отображается в консоли

2. **Отправка маленького файла (<1MB):**
   - PWA: выбрать image.jpg (500 KB) → код DEF456
   - CLI: `qshare receive DEF456`
   - Проверка: файл в ~/Downloads/image.jpg

3. **Отправка большого файла (10-50 MB):**
   - PWA: выбрать video.mp4 (25 MB) → код GHI789
   - CLI: `qshare receive GHI789`
   - Проверка: прогресс-бар, файл успешно сохранен

4. **Неверный код:**
   - CLI: `qshare receive WRONG1`
   - Проверка: ошибка "Room not found" через 30 секунд

5. **Разрыв соединения:**
   - PWA: начать передачу → закрыть браузер
   - CLI: должен показать "Connection lost"

6. **Холодный старт Render.com:**
   - Подождать 20 минут (signaling заснет)
   - CLI: `qshare receive ABC123`
   - Проверка: pre-warming + успешное подключение

**4.2 Тестирование на разных платформах**

- **Windows:** CLI через cmd/PowerShell + PWA в Chrome
- **macOS:** CLI через Terminal + PWA в Safari
- **Linux:** CLI через bash + PWA в Firefox
- **Android:** только PWA в Chrome Mobile

**4.3 Тестирование NAT traversal**

- Локальная сеть (оба устройства в WiFi)
- Разные сети (мобильный интернет + WiFi)
- Корпоративная сеть с firewall
- Symmetric NAT (если доступно)

***

## Компонент 5: Документация и публикация

### Задачи:

**5.1 README для GitHub репозитория**

**Структура:**
```markdown
# Pair-In Quick

P2P file and text transfer between phone and computer without cloud services.

## Features
- 🚀 Direct P2P transfer (WebRTC)
- 🔒 End-to-end encrypted (DTLS)
- 📱 PWA for phone
- 💻 CLI for computer
- 🆓 Completely free

## Quick Start

### On Phone
1. Open https://qshare.app
2. Choose text or file
3. Get pairing code (e.g., ABC123)

### On Computer
```
npm install -g pinq-cli
qshare receive ABC123
```

## Installation

[npm/Homebrew/Winget инструкции]

## How it Works

[Диаграмма из резюме]

## LiGPL v3ations

- Max file size: 50 MB
- Code expires in 5 minutes
- Requires internet connection

## Self-Hosting

[Инструкции для signaling сервера]

## License
GPL v3
```

**5.2 Публикация CLI**

**npm:**
```bash
cd apps/cli
npm publish
```

**Homebrew tap:**
```bash
# Создать tap репозиторий
git clone https://github.com/yourusername/homebrew-tap
cd homebrew-tap
# Добавить Formula/pinq.rb
git push

# Пользователи установят:
brew tap yourusername/tap
brew install pinq
```

**Winget:**
```bash
# Fork winget-pkgs
# Добавить manifest в manifests/q/QuickShare/
# Создать Pull Request
```

**5.3 Деплой компонентов**

**Signaling на Render.com:**
1. Подключить GitHub репозиторий
2. Выбрать apps/signaling
3. Auto-deploy при push в main
4. Получить URL: https://pinq-signaling.onrender.com

**PWA на Vercel:**
1. Подключить GitHub репозиторий
2. Выбрать apps/pwa как root
3. Auto-deploy при push в main
4. Настроить домен: qshare.app (опционально)

**5.4 Обновление конфигурации**

**В PWA указать signaling URL:**
```typescript
// apps/pwa/src/lib/config.ts
export const SIGNALING_URL = import.meta.env.PROD
  ? 'https://pinq-signaling.onrender.com'
  : 'http://localhost:3000';
```

**В CLI указать signaling URL:**
```typescript
// apps/cli/src/config.ts
export const SIGNALING_URL = process.env.SIGNALING_URL
  || 'https://pinq-signaling.onrender.com';
```

***

## Чеклист финальной проверки

### Перед релизом:

- [ ] Signaling сервер работает на Render.com
- [ ] PWA доступна по URL (Vercel)
- [ ] CLI опубликован в npm
- [ ] Отправка текста работает
- [ ] Отправка файла <1MB работает
- [ ] Отправка файла 10-50MB с прогресс-баром работает
- [ ] Pre-warming для Render.com работает
- [ ] Код паринга генерируется корректно
- [ ] TTL кодов соблюдается (5 минут)
- [ ] Ошибки обрабатываются с понятными сообщениями
- [ ] README содержит все инструкции
- [ ] LICENSE добавлен (GPL v3)
- [ ] STUN/TURN серверы настроены
- [ ] Тестирование на 3+ устройствах пройдено

### Опциональные улучшения (post-MVP):

- [ ] E2E шифрование через Web Crypto API
- [ ] История передач в PWA
- [ ] Множественная отправка файлов
- [ ] QR-код вместо ввода кода
- [ ] Desktop уведомления при успешной передаче
- [ ] Dark mode в PWA
- [ ] Homebrew/Winget публикация
- [ ] Мониторинг и аналитика (опционально)

***

