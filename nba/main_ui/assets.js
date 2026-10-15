// NBA MAIN UI - the client, served from the source files themselves (no build step): wrangler bundles *.html and *.txt imports
// as text modules. The browser's pricing code is the worker's own pricing.js functions, serialized (one source of payout math).
import SHELL from "./client/shell.html";
import CORE from "./client/core.js.txt";
import DOSSIER from "./client/dossier.js.txt";
import SHARP from "./client/sharp.js.txt";
import BUILD from "./client/build.js.txt";
import SLIPS from "./client/slips.js.txt";
import PROFILE from "./client/profile.js.txt";
import ADMIN from "./client/admin.js.txt";
import LOGO_B64 from "./client/logo.png.b64.txt";
import * as PRICING from "./pricing.js";

// wrangler bundles with esbuild keep-names, which injects __name(fn, "name") calls INSIDE function bodies (nested functions and
// arrow functions). toString() carries those calls to the browser, where esbuild's helper does not exist - so the served file
// defines a no-op __name first (found live 2026-10-14: "Build failed: __name is not defined" on the Slips screen).
const PRICING_JS = "// NBA payout + EV math - the worker's nba/main_ui/pricing.js, serialized\n" +
  "var __name = typeof __name === 'function' ? __name : function (f) { return f; };\n" +
  Object.values(PRICING).filter(f => typeof f === "function").map(f => f.toString()).join("\n") + "\n";
if (!/function nbaPayout\(/.test(PRICING_JS) || !/function nbaFlexAlt\(/.test(PRICING_JS)) throw new Error("pricing.js did not serialize - client payout math unavailable");

export const ASSETS = { "index.html": SHELL, "core.js": CORE, "dossier.js": DOSSIER + "\n" + SHARP, "build.js": BUILD, "slips.js": SLIPS, "profile.js": PROFILE,
  "admin.js": ADMIN, "pricing.js": PRICING_JS, "logo.png.b64": String(LOGO_B64).trim() };
