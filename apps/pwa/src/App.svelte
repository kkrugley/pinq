<script lang="ts">
  import { onDestroy } from 'svelte';
  import ConnectionStatus from './lib/components/ConnectionStatus.svelte';
  import CodeDisplay from './lib/components/CodeDisplay.svelte';
  import FileSelector from './lib/components/FileSelector.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import TextInput from './lib/components/TextInput.svelte';
  import { SIGNALING_URL } from './lib/config';
  import { generateCode } from './lib/utils/codeGenerator';
  import { WebRTCSender } from './lib/webrtc/peer';

  type Mode = 'idle' | 'text' | 'file';

  let pairingCode = generateCode();
  let sender: WebRTCSender | null = null;
  let mode: Mode = 'idle';
  let statusMessage = 'Ready to pair your desktop with a 6-digit code.';
  let statusTone: 'idle' | 'success' | 'error' = 'idle';
  let textValue = '';
  let selectedFile: File | null = null;
  let sending = false;
  let progress = 0;
  let successMessage = '';
  let errorMessage = '';
  let copyNotice = '';
  let activePayloadLabel = '';

  function resetSession() {
    sender?.destroy();
    sender = null;
    pairingCode = generateCode();
    mode = 'idle';
    statusMessage = 'Ready to pair your desktop with a 6-digit code.';
    statusTone = 'idle';
    textValue = '';
    selectedFile = null;
    sending = false;
    progress = 0;
    successMessage = '';
    errorMessage = '';
    copyNotice = '';
    activePayloadLabel = '';
  }

  onDestroy(() => sender?.destroy());

  async function ensureSender() {
    sender?.destroy();
    sender = new WebRTCSender(SIGNALING_URL, pairingCode);
    await sender.connect((status) => {
      statusMessage = status;
      statusTone = status.toLowerCase().includes('error') ? 'error' : 'idle';
    });
    statusTone = 'success';
    statusMessage = 'Connected. Ready to transfer.';
  }

  async function sendText() {
    if (!textValue.trim()) {
      errorMessage = 'Введите текст для отправки.';
      return;
    }

    sending = true;
    progress = 0;
    successMessage = '';
    errorMessage = '';
    activePayloadLabel = 'Отправка текста';
    statusMessage = 'Подключение и отправка текста...';

    try {
      await ensureSender();
      statusMessage = 'Отправка текста...';
      await sender?.sendText(textValue, (percent) => {
        progress = percent;
      });
      statusMessage = 'Ожидаем подтверждения от компьютера...';
      statusTone = 'idle';
      successMessage = 'Текст доставлен на компьютер.';
      statusTone = 'success';
      statusMessage = 'Готово!';
      textValue = '';
    } catch (err) {
      statusTone = 'error';
      statusMessage = 'Не удалось отправить текст';
      errorMessage = err instanceof Error ? err.message : 'Ошибка отправки.';
    } finally {
      sending = false;
    }
  }

  async function sendFile() {
    if (!selectedFile) {
      errorMessage = 'Выберите файл для отправки.';
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      errorMessage = 'Максимальный размер файла 50 МБ.';
      return;
    }

    sending = true;
    progress = 0;
    successMessage = '';
    errorMessage = '';
    activePayloadLabel = selectedFile.name;
    statusMessage = 'Подключение и отправка файла...';

    try {
      await ensureSender();
      statusMessage = 'Отправка файла...';
      await sender?.sendFile(selectedFile, (percent) => {
        progress = percent;
      });
      statusMessage = 'Ожидаем подтверждения от компьютера...';
      statusTone = 'idle';
      successMessage = `${selectedFile.name} отправлен.`;
      statusTone = 'success';
      statusMessage = 'Готово!';
      selectedFile = null;
    } catch (err) {
      statusTone = 'error';
      statusMessage = 'Не удалось отправить файл';
      errorMessage = err instanceof Error ? err.message : 'Ошибка отправки файла.';
    } finally {
      sending = false;
    }
  }
</script>

<main class="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-50">
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-8">
    <header class="space-y-2">
      <p class="text-sm text-blue-300 uppercase tracking-[0.2em]">Pair-In Quick</p>
      <h1 class="text-4xl font-bold">P2P передача текста и файлов</h1>
      <p class="text-slate-300">Сгенерируйте код, поделитесь им в CLI и отправьте данные напрямую по WebRTC.</p>
    </header>

    <section class="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg p-6 space-y-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CodeDisplay code={pairingCode} on:copied={() => (copyNotice = 'Код скопирован!')} />
        {#if copyNotice}
          <span class="text-xs text-slate-400">{copyNotice}</span>
        {/if}
      </div>

      <ConnectionStatus status={statusMessage} tone={statusTone} />

      <div class="grid md:grid-cols-2 gap-4">
        <button
          class="w-full bg-primary text-white py-3 rounded-xl font-semibold shadow hover:bg-blue-500 disabled:opacity-60"
          on:click={() => (mode = 'text')}
          disabled={sending}
        >
          📄 Отправить текст
        </button>
        <button
          class="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold shadow hover:bg-slate-700 border border-slate-700 disabled:opacity-60"
          on:click={() => (mode = 'file')}
          disabled={sending}
        >
          📁 Отправить файл
        </button>
      </div>

      {#if mode === 'text'}
        <div class="space-y-3">
          <TextInput bind:value={textValue} disabled={sending} placeholder="Введите текст для отправки на компьютер" />
          <button
            class="bg-primary text-white px-4 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
            on:click={sendText}
            disabled={sending}
          >
            {sending ? 'Отправка...' : 'Отправить текст'}
          </button>
        </div>
      {/if}

      {#if mode === 'file'}
        <div class="space-y-3">
          <FileSelector on:select={(event) => (selectedFile = event.detail)} />
          {#if selectedFile}
            <div class="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
              <div>
                <p class="text-sm font-semibold">{selectedFile.name}</p>
                <p class="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} МБ</p>
              </div>
              <button
                class="bg-primary text-white px-3 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
                on:click={sendFile}
                disabled={sending}
              >
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if sending}
        <div class="space-y-2">
          <p class="text-sm text-slate-300">{activePayloadLabel || 'Передача данных...'}</p>
          <ProgressBar value={progress} />
        </div>
      {/if}

      {#if successMessage}
        <div class="rounded-lg bg-slate-800 border border-green-500/30 text-green-300 px-4 py-3 flex items-start gap-2">
          <span>✅</span>
          <div>
            <p class="font-semibold">Успех</p>
            <p class="text-sm">{successMessage}</p>
          </div>
        </div>
      {/if}

      {#if errorMessage}
        <div class="rounded-lg bg-slate-800 border border-red-500/30 text-red-300 px-4 py-3 flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p class="font-semibold">Ошибка</p>
            <p class="text-sm">{errorMessage}</p>
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        <button
          class="text-sm text-slate-300 underline decoration-dotted underline-offset-4"
          type="button"
          on:click={resetSession}
        >
          Сбросить код
        </button>
        <a
          class="text-sm text-slate-400"
          href="https://github.com/kkrugley/pinq"
          target="_blank"
          rel="noreferrer"
        >
          Помощь и исходники
        </a>
      </div>
    </section>
  </div>
</main>
