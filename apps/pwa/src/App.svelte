<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ConnectionStatus from './lib/components/ConnectionStatus.svelte';
  import CodeDisplay from './lib/components/CodeDisplay.svelte';
  import FileSelector from './lib/components/FileSelector.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import TextInput from './lib/components/TextInput.svelte';
  import { SIGNALING_URL } from './lib/config';
  import { generateCode } from './lib/utils/codeGenerator';
  import { WebRTCSender, WebRTCReceiver } from './lib/webrtc/peer';
  import { SignalingClient } from './lib/webrtc/signaling';

  type Mode = 'idle' | 'text' | 'file';

  let pairingCode = generateCode();
  let sender: WebRTCSender | null = null;
  let receiver: WebRTCReceiver | null = null;
  let mode: Mode = 'idle';
  let statusMessage = 'Ready to pair your desktop with a 6-character code.';
  let statusTone: 'idle' | 'success' | 'error' = 'idle';
  let joinCode = '';
  let textValue = '';
  let selectedFile: File | null = null;
  let sending = false;
  let receiving = false;
  let progress = 0;
  let receiveProgress = 0;
  let successMessage = '';
  let errorMessage = '';
  let copyNotice = '';
  let activePayloadLabel = '';
  let receivingLabel = '';
  let receivedText = '';
  let prewarmPromise: Promise<void> | null = null;
  $: isBusy = sending || receiving;

  async function prewarmSignaling() {
    if (prewarmPromise) return prewarmPromise;
    const client = new SignalingClient(SIGNALING_URL, pairingCode);
    prewarmPromise = client.prewarm().finally(() => {
      prewarmPromise = null;
    });
    return prewarmPromise;
  }

  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleJoinCodeInput(event: Event) {
    const target = event.target as HTMLInputElement;
    joinCode = target.value.toUpperCase();
  }

  function resetSession() {
    sender?.destroy();
    sender = null;
    receiver?.destroy();
    receiver = null;
    pairingCode = generateCode();
    mode = 'idle';
    statusMessage = 'Ready to pair your desktop with a 6-character code.';
    statusTone = 'idle';
    joinCode = '';
    textValue = '';
    selectedFile = null;
    sending = false;
    receiving = false;
    progress = 0;
    receiveProgress = 0;
    successMessage = '';
    errorMessage = '';
    copyNotice = '';
    activePayloadLabel = '';
    receivingLabel = '';
    receivedText = '';
    void prewarmSignaling();
  }

  function handleRetry() {
    resetSession();
  }

  onMount(() => {
    void prewarmSignaling();
  });

  onDestroy(() => {
    sender?.destroy();
    receiver?.destroy();
  });

  async function ensureSender() {
    try {
      sender?.destroy();
      sender = new WebRTCSender(SIGNALING_URL, pairingCode);
      await sender.connect((status) => {
        statusMessage = status;
        statusTone = status.toLowerCase().includes('error') ? 'error' : 'idle';

        if (status.toLowerCase().includes('warming')) {
          statusMessage = 'Warming up signaling... (can take up to a minute on first start)';
        }
      });
      statusTone = 'success';
      statusMessage = 'Connected. Ready to transfer.';
    } catch (err) {
      statusTone = 'error';
      statusMessage = err instanceof Error ? err.message : 'Connection failed';
      throw err;
    }
  }

  async function sendText() {
    if (!textValue.trim()) {
      errorMessage = 'Enter text to send.';
      return;
    }

    receivedText = '';
    receivingLabel = '';
    receiveProgress = 0;
    sending = true;
    progress = 0;
    successMessage = '';
    errorMessage = '';
    activePayloadLabel = 'Sending text';
    statusMessage = 'Connecting and sending text...';

    try {
      await ensureSender();
      statusMessage = 'Sending text...';
      await sender?.sendText(textValue, (percent) => {
        progress = percent;
      });
      statusMessage = 'Waiting for desktop to confirm...';
      statusTone = 'idle';
      successMessage = 'Text delivered to desktop.';
      statusTone = 'success';
      statusMessage = 'Done!';
      textValue = '';
      sender?.destroy();
      sender = null;
    } catch (err) {
      statusTone = 'error';
      statusMessage = 'Failed to send text';
      errorMessage = err instanceof Error ? err.message : 'Send error.';
    } finally {
      sending = false;
    }
  }

  async function sendFile() {
    if (!selectedFile) {
      errorMessage = 'Pick a file to send.';
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      errorMessage = 'Max file size is 50 MB.';
      return;
    }

    receivedText = '';
    receivingLabel = '';
    receiveProgress = 0;
    sending = true;
    progress = 0;
    successMessage = '';
    errorMessage = '';
    activePayloadLabel = selectedFile.name;
    statusMessage = 'Connecting and sending file...';

    try {
      await ensureSender();
      statusMessage = 'Sending file...';
      await sender?.sendFile(selectedFile, (percent) => {
        progress = percent;
      });
      statusMessage = 'Waiting for desktop to confirm...';
      statusTone = 'idle';
      successMessage = `${selectedFile.name} sent.`;
      statusTone = 'success';
      statusMessage = 'Done!';
      selectedFile = null;
      sender?.destroy();
      sender = null;
    } catch (err) {
      statusTone = 'error';
      statusMessage = 'Failed to send file';
      errorMessage = err instanceof Error ? err.message : 'File send error.';
    } finally {
      sending = false;
    }
  }

  async function receiveData() {
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      errorMessage = 'Enter a code to join.';
      statusTone = 'error';
      statusMessage = 'Enter a code to join.';
      return;
    }

    receiver?.destroy();
    receiver = new WebRTCReceiver(SIGNALING_URL, normalizedCode);
    joinCode = normalizedCode;
    receiving = true;
    receiveProgress = 0;
    receivingLabel = '';
    successMessage = '';
    errorMessage = '';
    receivedText = '';
    activePayloadLabel = '';
    statusTone = 'idle';
    statusMessage = 'Connecting to sender...';

    try {
      const result = await receiver.receive({
        onProgress: (percent) => {
          receiveProgress = percent;
        },
        onStatus: (status) => {
          statusMessage = status;
          statusTone = status.toLowerCase().includes('error') ? 'error' : 'idle';
        },
        onMetadata: (metadata) => {
          receivingLabel = metadata.type === 'file' ? metadata.filename || 'File incoming' : 'Incoming text';
        },
      });

      statusTone = 'success';
      statusMessage = 'Transfer complete.';

      if (result.type === 'text') {
        receivedText = result.text;
        successMessage = 'Text received.';
      } else {
        const filename = result.metadata.filename || 'pinq-transfer';
        saveBlob(result.blob, filename);
        successMessage = `${filename} saved to your device.`;
      }
    } catch (err) {
      statusTone = 'error';
      const message = err instanceof Error ? err.message : 'Failed to receive data';
      statusMessage = message;
      errorMessage = message;
    } finally {
      receiving = false;
      receiveProgress = 0;
      receiver?.destroy();
      receiver = null;
    }
  }
</script>

<main class="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-50">
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-8">
    <header class="space-y-2">
      <p class="text-sm text-blue-300 uppercase tracking-[0.2em]">Pair-In Quick</p>
      <h1 class="text-4xl font-bold">P2P text and file transfer</h1>
      <p class="text-slate-300">Generate or join a 6-character code to send or receive files and text directly via WebRTC.</p>
    </header>

    <section class="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg p-6 space-y-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CodeDisplay code={pairingCode} on:copied={() => (copyNotice = 'Code copied!')} />
        {#if copyNotice}
          <span class="text-xs text-slate-400">{copyNotice}</span>
        {/if}
      </div>

      <ConnectionStatus status={statusMessage} tone={statusTone} />

      <div class="grid gap-5 md:grid-cols-2">
        <div class="space-y-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-100">Send from this device</p>
            <span class="text-xs text-slate-500">Share your code above</span>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <button
              class="w-full bg-primary text-white py-3 rounded-xl font-semibold shadow hover:bg-blue-500 disabled:opacity-60"
              on:click={() => (mode = 'text')}
              disabled={isBusy}
            >
              📄 Send text
            </button>
            <button
              class="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold shadow hover:bg-slate-700 border border-slate-700 disabled:opacity-60"
              on:click={() => (mode = 'file')}
              disabled={isBusy}
            >
              📁 Send file
            </button>
          </div>

          {#if mode === 'text'}
            <div class="space-y-3">
              <TextInput bind:value={textValue} disabled={isBusy} placeholder="Enter text to send to desktop" />
              <button
                class="bg-primary text-white px-4 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
                on:click={sendText}
                disabled={isBusy}
              >
                {sending ? 'Sending...' : 'Send text'}
              </button>
            </div>
          {/if}

          {#if mode === 'file'}
            <div class="space-y-3">
              <div class:opacity-60={isBusy} class:pointer-events-none={isBusy}>
                <FileSelector on:select={(event) => (selectedFile = event.detail)} />
              </div>
              {#if selectedFile}
                <div class="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                  <div>
                    <p class="text-sm font-semibold">{selectedFile.name}</p>
                    <p class="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button
                    class="bg-primary text-white px-3 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
                    on:click={sendFile}
                    disabled={isBusy}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          {#if sending}
            <div class="space-y-2">
              <p class="text-sm text-slate-300">{activePayloadLabel || 'Transferring...'}</p>
              <ProgressBar value={progress} />
            </div>
          {/if}
        </div>

        <div class="space-y-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-100">Receive on this device</p>
            <span class="text-xs text-slate-500">Join a partner code</span>
          </div>

          <div class="space-y-2">
            <label for="join-code-input" class="text-xs uppercase tracking-wide text-slate-400">
              Enter code from another device
            </label>
            <div class="flex flex-col sm:flex-row gap-3">
              <input
                id="join-code-input"
                class="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                bind:value={joinCode}
                on:input={handleJoinCodeInput}
                placeholder="e.g. ABC123"
                maxlength="6"
                autocapitalize="characters"
                spellcheck="false"
                inputmode="text"
                disabled={receiving}
              />
              <button
                class="bg-slate-100 text-slate-900 px-4 py-2 rounded-lg font-semibold shadow hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                on:click={receiveData}
                disabled={isBusy || !joinCode.trim()}
              >
                {receiving ? 'Receiving...' : 'Receive'}
              </button>
            </div>
            <p class="text-xs text-slate-500">Paste a code from another phone or desktop to pull text or files here.</p>
          </div>

          {#if receiving}
            <div class="space-y-2">
              <p class="text-sm text-slate-300">{receivingLabel || 'Receiving...'}</p>
              <ProgressBar value={receiveProgress} />
            </div>
          {/if}

          {#if receivedText}
            <div class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2">
              <p class="text-xs uppercase tracking-wide text-slate-400">Received text</p>
              <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-50">{receivedText}</p>
            </div>
          {/if}
        </div>
      </div>

      {#if successMessage}
        <div class="rounded-lg bg-slate-800 border border-green-500/30 text-green-300 px-4 py-3 flex items-start gap-2">
          <span>✅</span>
          <div class="flex-1 space-y-2">
            <div>
              <p class="font-semibold">Success</p>
              <p class="text-sm">{successMessage}</p>
            </div>
            <button
              class="bg-primary text-white px-3 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
              on:click={resetSession}
              type="button"
            >
              Start new transfer
            </button>
          </div>
        </div>
      {/if}

      {#if errorMessage}
        <div class="rounded-lg bg-slate-800 border border-red-500/30 text-red-300 px-4 py-3 flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p class="font-semibold">Error</p>
            <p class="text-sm">{errorMessage}</p>
          </div>
          <div class="ml-auto">
            <button
              class="bg-primary text-white px-3 py-2 rounded-lg shadow hover:bg-blue-500 disabled:opacity-60"
              on:click={handleRetry}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        <button
          class="text-sm text-slate-300 underline decoration-dotted underline-offset-4"
          type="button"
          on:click={resetSession}
        >
          Reset code
        </button>
        <a
          class="text-sm text-slate-400"
          href="https://github.com/kkrugley/pinq"
          target="_blank"
          rel="noreferrer"
        >
          Help & source code
        </a>
      </div>
    </section>
  </div>
</main>
