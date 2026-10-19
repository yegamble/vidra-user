import { getEngine } from "./engine";
import { captureE2EESession } from "./session";

/** Shared preparation path for sign-in and the conversation's recovery UI. */
export async function prepareDevice() {
  const session = captureE2EESession();
  const engine = await getEngine();
  const device = await engine.ensureDevice();
  await engine.replenishOneTimeKeys().catch(() => {});
  session.assertCurrent();
  return device;
}
