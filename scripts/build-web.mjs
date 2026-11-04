// Temporary build until web/ (Vite) lands in the next PR: publish web/public as the static site.
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("web/dist", { recursive: true, force: true });
mkdirSync("web/dist", { recursive: true });
cpSync("web/public", "web/dist", { recursive: true });
console.log("web/dist ready (placeholder)");
