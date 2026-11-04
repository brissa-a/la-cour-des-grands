export function memoize<K, T>(load: (key: K) => Promise<T>): (key: K) => Promise<T> {
  const loaded = new Map<K, Promise<T>>()
  return key => {
    const known = loaded.get(key)
    if (known) return known
    const promise = load(key)
    loaded.set(key, promise)
    promise.catch(() => {
      if (loaded.get(key) === promise) loaded.delete(key)
    })
    return promise
  }
}
