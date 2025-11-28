<script lang="ts">
  export let value = '';
  export let placeholder = 'Enter text to send';
  export let disabled = false;
</script>

<textarea
  class="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-100 p-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
  rows="6"
  bind:value
  placeholder={placeholder}
  {disabled}
></textarea>
