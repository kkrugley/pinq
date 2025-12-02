const inspect = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const debuglog = (_section: string) => (..._args: unknown[]) => {
  // no-op; simple-peer only uses this for optional logging in Node
};

export { inspect, debuglog };
export default { inspect, debuglog };
