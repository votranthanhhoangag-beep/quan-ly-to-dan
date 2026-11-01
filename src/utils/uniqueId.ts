export const createUniqueId = (prefix: string) => {
  const identifier = globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${identifier}`;
};
