export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function deepCloneWith<T>(obj: T, revive: (cloned: T) => void): T {
  const cloned = deepClone(obj);
  revive(cloned);
  return cloned;
}
