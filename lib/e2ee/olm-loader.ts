// Loads the @matrix-org/olm WASM runtime, client-side only, EXACTLY ONCE.
//
// Turbopack cannot bundle @matrix-org/olm (its emscripten glue references Node's
// `fs`/`path`), so we never import the package as a module. Instead we load
// `olm.js` at runtime via a <script> tag from /olm/ (copied into public/ by
// scripts/copy-olm-wasm.mjs at build time) — the officially-supported way to use
// Olm in a browser. It is thus never in the bundle graph nor the server bundle.
//
// The type-only import below is erased at build time, so it adds no runtime
// dependency; it just gives us the Olm class typings.
import type * as OlmNS from "@matrix-org/olm";

declare global {
  interface Window {
    Olm?: typeof OlmNS;
  }
}

let ready: Promise<typeof OlmNS> | null = null;

/** loadOlm resolves the initialized global Olm namespace (browser only). */
export function loadOlm(): Promise<typeof OlmNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Olm can only be loaded in the browser"));
  }
  if (!ready) {
    ready = new Promise<typeof OlmNS>((resolve, reject) => {
      const init = (Olm: typeof OlmNS) =>
        Olm.init({ locateFile: () => "/olm/olm.wasm" })
          .then(() => resolve(Olm))
          .catch(reject);
      if (window.Olm) {
        init(window.Olm);
        return;
      }
      const script = document.createElement("script");
      script.src = "/olm/olm.js";
      script.async = true;
      script.onload = () => {
        if (!window.Olm) {
          reject(new Error("Olm runtime loaded but window.Olm is undefined"));
          return;
        }
        init(window.Olm);
      };
      script.onerror = () => reject(new Error("failed to load the Olm runtime script"));
      document.head.appendChild(script);
    });
  }
  return ready;
}
