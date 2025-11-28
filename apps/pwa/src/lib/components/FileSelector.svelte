<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ select: File | null }>();

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const [file] = target.files ?? [];
    dispatch('select', file ?? null);
  }
</script>

<label class="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer bg-slate-800/40 hover:border-primary transition-colors">
  <div class="flex flex-col items-center justify-center pt-4 pb-4">
    <svg class="w-10 h-10 mb-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12"></path>
    </svg>
    <p class="text-sm text-slate-300">
      Drop a file here or click to browse
    </p>
    <p class="text-xs text-slate-500">Max 50 MB</p>
  </div>
  <input id="dropzone-file" type="file" class="hidden" on:change={handleChange} />
</label>
