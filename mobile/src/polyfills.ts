import { getRandomValues as expoCryptoGetRandomValues } from "expo-crypto";
import { Buffer } from "buffer";
import structuredClonePolyfill from "@ungap/structured-clone";
import "fast-text-encoding";

global.Buffer = Buffer;

// Anchor's account-discriminator hashing (coder/sha256.js) does
// `new TextDecoder().decode(...)` — Hermes doesn't reliably provide
// TextEncoder/TextDecoder as globals, so any call touching
// `program.coder.accounts.memcmp()`/`.decode()` (i.e. any getProgramAccounts
// -based fetch) threw "undefined is not a function" on-device without this,
// even though the exact same code worked fine under Node during testing.
// `fast-text-encoding`'s import above installs the globals as a side effect
// if they're missing.

// Hermes has no structuredClone; @solana/web3.js calls it while cloning RPC
// responses, so a request throws "Property 'structuredClone' doesn't exist"
// on-device without this. Confirmed necessary on the SwapKings mobile app
// (same RN/Hermes stack) — carried over verbatim.
if (typeof (global as any).structuredClone === "undefined") {
  (global as any).structuredClone = (value: unknown) =>
    structuredClonePolyfill(value, { lossy: false });
}

class Crypto {
  getRandomValues = expoCryptoGetRandomValues;
}

const webCrypto = typeof crypto !== "undefined" ? crypto : new Crypto();

(() => {
  if (typeof crypto === "undefined") {
    Object.defineProperty(window, "crypto", {
      configurable: true,
      enumerable: true,
      get: () => webCrypto,
    });
  }
})();
