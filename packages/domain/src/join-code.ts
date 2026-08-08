const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function generateJoinCode(rng: () => number = Math.random, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}

export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}
