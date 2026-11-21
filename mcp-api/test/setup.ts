const noCache = {
  match: () => Promise.resolve(undefined),
  put: () => Promise.resolve(),
};

Object.assign(globalThis, { caches: { default: noCache } });
