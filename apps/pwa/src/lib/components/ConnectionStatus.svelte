<script lang="ts">
  export let status: string;
  export let tone: 'idle' | 'success' | 'error' = 'idle';

  const toneClasses: Record<typeof tone, string> = {
    idle: 'text-slate-200',
    success: 'text-success',
    error: 'text-error',
  };
</script>

<p class={`text-sm ${toneClasses[tone]}`}>{status}</p>
