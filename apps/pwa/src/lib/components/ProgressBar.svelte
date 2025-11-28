<script lang="ts">
  export let value = 0;
  export let label: string | null = null;
</script>

<div class="w-full">
  <div class="flex justify-between mb-1 text-sm text-slate-300">
    <span>{label ?? 'Progress'}</span>
    <span>{Math.round(value)}%</span>
  </div>
  <div class="w-full bg-slate-800 rounded-full h-3">
    <div
      class="bg-primary h-3 rounded-full transition-all"
      style={`width: ${Math.min(100, Math.max(0, value))}%`}
    ></div>
  </div>
</div>
