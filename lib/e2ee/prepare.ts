import { getEngine } from "./engine";
import { captureE2EESession } from "./session";

/** Shared preparation path for sign-in and the conversation's recovery UI. */
export async function prepareDevice() {
  const session = captureE2EESession();
  const engine = await getEngine();
  const device = await engine.ensureDevice().catch(async (error: unknown) => {
    if (error instanceof Error && error.name === "DeviceRemovedError") throw error;
    const activated = await engine.currentDevice();
    if (!activated) throw error;
    return activated; // A failed background refill must not disable existing sessions.
  });
  await engine.replenishOneTimeKeys().catch(() => {});
  session.assertCurrent();
  return device;
}
