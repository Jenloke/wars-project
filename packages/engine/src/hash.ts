import type { GameState } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * 32-bit FNV-1a hash of the serialized state, as 8 hex digits. Two peers that
 * applied the same actions to the same initial state produce the same hash, so
 * comparing hashes each turn detects a desync. Not cryptographic.
 *
 * Relies on `JSON.stringify` key order, which is insertion order for string keys
 * and ascending for the integer unit IDs, and is identical on every engine.
 */
export function hashState(state: GameState): string {
  const text = JSON.stringify(state);
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
