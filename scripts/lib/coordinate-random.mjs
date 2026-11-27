const MASK64 = (1n << 64n) - 1n
const textEncoder = new TextEncoder()

export const Stream = Object.freeze({
  production: 1, quality: 2, event: 3, market: 4,
  competition: 5, partner: 6, staff: 7, misc: 8,
})

export function hashText(text) {
  let value = 2166136261
  for (const byte of textEncoder.encode(text)) {
    value ^= byte
    value = Math.imul(value, 16777619) >>> 0
  }
  return value >>> 0
}

function splitmix64(value) {
  value = (value + 0x9E3779B97F4A7C15n) & MASK64
  value = ((value ^ (value >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64
  value = ((value ^ (value >> 27n)) * 0x94D049BB133111EBn) & MASK64
  return (value ^ (value >> 31n)) & MASK64
}

export function draw(seed, week, stream, purpose, index) {
  let mixed = 0x9E3779B97F4A7C15n
  mixed ^= (BigInt(seed >>> 0) * 0x9E3779B97F4A7C15n) & MASK64
  mixed ^= (BigInt(week >>> 0) * 0xC2B2AE3D27D4EB4Fn) & MASK64
  mixed ^= (BigInt(stream >>> 0) * 0x165667B19E3779F9n) & MASK64
  mixed ^= (BigInt(purpose >>> 0) * 0x27D4EB2F165667C5n) & MASK64
  mixed ^= (BigInt(index >>> 0) * 0x9E3779B185EBCA87n) & MASK64
  return Number((splitmix64(mixed & MASK64) >> 32n) & 0xFFFFFFFFn)
}

export function drawBelow(seed, week, stream, purpose, index, bound) {
  const normalizedBound = bound >>> 0
  if (normalizedBound === 0) return 0
  return draw(seed, week, stream, purpose, index) % normalizedBound
}
