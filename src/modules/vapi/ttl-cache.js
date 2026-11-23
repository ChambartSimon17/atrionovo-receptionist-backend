// ======================================================
// TTL Cache
// ======================================================
//
// A tiny in-memory cache with an expiry per entry. Used to
// keep the business of a Vapi number for a few minutes, so
// assistant-request and the tool calls of one phone call do
// not each hit the database.
//
// Per process: with more than one backend instance every
// instance keeps its own copy. That is fine for data that
// may be a few minutes old (name, opening hours).
// ======================================================

export class TtlCache {
  #entries = new Map();

  constructor({ ttlMs, maxEntries = 1000, now = () => Date.now() }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key) {
    const entry = this.#entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Also returns entries that expired: last known value,
   * for when the database is down.
   */
  getStale(key) {
    return this.#entries.get(key)?.value;
  }

  set(key, value) {
    if (this.#entries.size >= this.maxEntries) {
      // Oldest entry first (Map keeps insertion order).
      this.#entries.delete(this.#entries.keys().next().value);
    }

    this.#entries.delete(key);
    this.#entries.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  delete(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }
}
