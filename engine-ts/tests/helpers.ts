import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineInputs } from "../src";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURES = join(ROOT, "fixtures");

export interface Fixture { inputs: EngineInputs; expected: Record<string, number | string | null>; overrides?: object }

export const load = <T = Fixture>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
export const fixtureNames = (): string[] =>
  readdirSync(FIXTURES).filter(f => f.endsWith(".json") && f !== "base_monthly.json").sort();

/** ENGINE_SPEC §0 / CLAUDE.md rule 1: amounts max(1 SAR, 0.01%), ratios 1e-4. 'لا يسترد' = null; -1 = null or -1. */
export function close(actual: number | null | undefined, expected: unknown): boolean {
  if (expected === "لا يسترد" || expected === null) return actual === null;
  if (expected === -1 && actual === null) return true;
  if (actual === null || actual === undefined || typeof expected !== "number") return false;
  if (Math.abs(expected) > 10) return Math.abs(actual - expected) <= Math.max(1.0, Math.abs(expected) * 1e-4);
  return Math.abs(actual - expected) <= 1e-4;
}
