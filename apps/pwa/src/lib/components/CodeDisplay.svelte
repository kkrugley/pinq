<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let code: string;
  const dispatch = createEventDispatcher<{ copied: void }>();

  async function copyCode() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(code);
    dispatch('copied');
  }
</script>

<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-md flex items-center justify-between gap-3">
  <div>
    <p class="text-xs uppercase tracking-wide text-slate-400">Pairing code</p>
    <p class="text-3xl font-semibold text-white">{code}</p>
  </div>
  <button
    type="button"
    class="bg-primary text-white px-4 py-2 rounded-lg shadow hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-primary"
    on:click={copyCode}
  >
    Copy
  </button>
</div>
