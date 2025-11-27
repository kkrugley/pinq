export function runCli() {
  console.log('CLI scaffold ready for Pair-In Quick.');
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
  runCli();
}
