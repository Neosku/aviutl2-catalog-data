// ファイル読み書きのユーティリティ関数群
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function resolveRepoPath(repoRoot: string, maybeRelativePath: string): string {
  return resolve(repoRoot, maybeRelativePath);
}

export function repoPathExists(repoRoot: string, maybeRelativePath: string): boolean {
  return existsSync(resolveRepoPath(repoRoot, maybeRelativePath));
}

export function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeJsonFile(path: string, value: unknown): void {
  ensureDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeTextFile(path: string, content: string): void {
  ensureDirectory(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function writeBinaryFile(path: string, content: Uint8Array): void {
  ensureDirectory(dirname(path));
  writeFileSync(path, content);
}

export function copyFileIntoRepoOutput(from: string, to: string): void {
  ensureDirectory(dirname(to));
  copyFileSync(from, to);
}

export function resetDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
  ensureDirectory(path);
}

export function removeDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** Replaces a generated directory without exposing a half-written output tree. */
export function replaceDirectory(stagedPath: string, destinationPath: string): void {
  const backupPath = `${destinationPath}.backup-${process.pid}`;
  removeDirectory(backupPath);
  const hadDestination = existsSync(destinationPath);

  if (hadDestination) {
    renameWithRetry(destinationPath, backupPath);
  }

  try {
    renameWithRetry(stagedPath, destinationPath);
  } catch (error) {
    if (hadDestination && existsSync(backupPath)) {
      renameWithRetry(backupPath, destinationPath);
    }
    throw error;
  }

  removeDirectory(backupPath);
}

function renameWithRetry(from: string, to: string): void {
  const retryableCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
  const attempts = 8;

  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= attempts - 1 || code === undefined || !retryableCodes.has(code)) {
        throw error;
      }
      sleepSync(Math.min(50 * 2 ** attempt, 500));
    }
  }
}

function sleepSync(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, milliseconds);
}
