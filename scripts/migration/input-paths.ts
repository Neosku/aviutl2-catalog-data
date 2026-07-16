import { resolve } from "node:path";

export const LEGACY_INPUT_ROOT = "legacy-input";

export const LEGACY_INPUT_PATHS = {
  index: `${LEGACY_INPUT_ROOT}/index.json`,
  search: `${LEGACY_INPUT_ROOT}/search.json`,
  date: `${LEGACY_INPUT_ROOT}/date.json`,
} as const;

/** Resolves a local path stored in a legacy JSON file against legacy-input/. */
export function resolveLegacyInputReference(repoRoot: string, reference: string): string {
  return resolve(repoRoot, LEGACY_INPUT_ROOT, reference);
}
