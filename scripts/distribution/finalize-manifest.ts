// 配布用manifestにcommit情報の追加
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { manifestSchema, type CatalogManifest } from "../../catalog-schema/definitions.ts";
import { readJsonFile, writeJsonFile } from "../shared/fs-utils.ts";
import { toJstIsoString } from "../shared/date-time.ts";

export type ManifestPublication = {
  artifactCommit: string;
  artifactBaseUrl: string;
};

export function isCurrentPublishedManifest(
  candidate: CatalogManifest,
  previous: CatalogManifest | null,
): boolean {
  return (
    previous?.artifactCommit !== undefined &&
    previous.artifactBaseUrl !== undefined &&
    isDeepStrictEqual(logicalManifestContent(candidate), logicalManifestContent(previous))
  );
}

export function finalizeManifest(
  candidate: CatalogManifest,
  previous: CatalogManifest | null,
  publication: ManifestPublication,
  now: string,
): CatalogManifest {
  const proposed = manifestSchema.parse({
    ...candidate,
    ...publication,
  });
  const updatedAt =
    previous !== null &&
    isDeepStrictEqual(
      manifestContentWithoutUpdatedAt(proposed),
      manifestContentWithoutUpdatedAt(previous),
    )
      ? toJstIsoString(previous.updatedAt)
      : toJstIsoString(now);

  return manifestSchema.parse({ ...proposed, updatedAt });
}

function logicalManifestContent(
  manifest: CatalogManifest,
): Omit<CatalogManifest, "updatedAt" | "artifactCommit" | "artifactBaseUrl"> {
  const {
    updatedAt: _updatedAt,
    artifactCommit: _artifactCommit,
    artifactBaseUrl: _artifactBaseUrl,
    ...content
  } = manifest;
  return content;
}

function manifestContentWithoutUpdatedAt(
  manifest: CatalogManifest,
): Omit<CatalogManifest, "updatedAt"> {
  const { updatedAt: _updatedAt, ...content } = manifest;
  return content;
}

function loadManifest(path: string): CatalogManifest {
  return manifestSchema.parse(readJsonFile(path));
}

function loadPreviousManifest(path: string | undefined): CatalogManifest | null {
  if (path === undefined || !existsSync(path)) {
    return null;
  }
  const parsed = manifestSchema.safeParse(readJsonFile(path));
  return parsed.success ? parsed.data : null;
}

function parseOptions(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new Error(`Invalid arguments: ${args.join(" ")}`);
    }
    options.set(key.slice(2), value);
  }
  return options;
}

function requiredOption(options: ReadonlyMap<string, string>, key: string): string {
  const value = options.get(key);
  if (value === undefined) {
    throw new Error(`Missing --${key}.`);
  }
  return value;
}

function main(): void {
  const [command, ...rawOptions] = process.argv.slice(2);
  const options = parseOptions(rawOptions);
  const inputPath = requiredOption(options, "input");
  const previousPath = options.get("previous");
  const candidate = loadManifest(inputPath);
  const previous = loadPreviousManifest(previousPath);

  if (command === "is-current") {
    process.exitCode = isCurrentPublishedManifest(candidate, previous) ? 0 : 1;
    return;
  }

  if (command !== "finalize") {
    throw new Error(
      "Usage: finalize-manifest.ts <is-current|finalize> --input <path> [--previous <path>] ...",
    );
  }

  const outputPath = requiredOption(options, "output");
  const finalized = finalizeManifest(
    candidate,
    previous,
    {
      artifactCommit: requiredOption(options, "artifact-commit"),
      artifactBaseUrl: requiredOption(options, "artifact-base-url"),
    },
    options.get("now") ?? toJstIsoString(new Date()),
  );
  writeJsonFile(outputPath, finalized);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
