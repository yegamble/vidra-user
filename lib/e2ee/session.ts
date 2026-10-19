// Captured operations must never continue using a different account's bearer.
let userId: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export function onE2EESessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setE2EEUser(next: string | null): void {
  if (next === userId) return;
  userId = next;
  generation++;
  for (const listener of listeners) listener();
}

export function captureE2EESession() {
  if (!userId) throw new Error("Sign in to use secure messaging.");
  const capturedGeneration = generation;
  return {
    userId,
    generation,
    assertCurrent() {
      if (capturedGeneration !== generation) throw new Error("The signed-in account changed.");
    },
  };
}
