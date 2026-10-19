import { getEngine } from "./engine";
import { captureE2EESession } from "./session";

/** Coordinate automatic preparation across tabs as well as thread/bootstrap callers. */
export async function prepareDevice() {
  const session = captureE2EESession();
  const prepare = async () => {
    session.assertCurrent();
    const engine = await getEngine();
    const device = await engine.ensureDevice();
    await engine.replenishOneTimeKeys().catch(() => {});
    session.assertCurrent();
    return device;
  };
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(`vidra-e2ee:${session.userId}`, prepare) : prepare();
}
