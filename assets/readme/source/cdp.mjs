// Minimal Chrome DevTools Protocol client over the browser's page target.
export async function connect(browserWs) {
  const port = new URL(browserWs).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) handlers.get(msg.method)?.(msg.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const once = (method) => new Promise((resolve) => handlers.set(method, (p) => { handlers.delete(method); resolve(p); }));
  const on = (method, fn) => handlers.set(method, fn);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function open(url, { width = 1280, height = 800, dpr = 1, scheme = 'light', mobile = false, settle = 6000 } = {}) {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await send('Page.navigate', { url });
    await sleep(settle);
  }
  return { send, evaluate, once, on, sleep, open, close: () => ws.close() };
}
