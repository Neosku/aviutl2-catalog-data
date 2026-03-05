import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const releaseDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const copyrightSchema = z
  .object({
    years: z.string(),
    holder: z.string(),
  })
  .strict();

const licenseSchema = z
  .object({
    type: z.string(),
    isCustom: z.boolean(),
    copyrights: z.array(copyrightSchema),
    licenseBody: z.string().nullable(),
  })
  .strict();

const imageSchema = z
  .object({
    thumbnail: z.string().optional(),
    infoImg: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.thumbnail === undefined && value.infoImg === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either thumbnail or infoImg is required.",
      });
    }
  });

const githubSourceSchema = z
  .object({
    owner: z.string(),
    repo: z.string(),
    pattern: z.string(),
  })
  .strict();

const googleDriveSourceSchema = z
  .object({
    id: z.string(),
  })
  .strict();

const installerSourceSchema = z
  .object({
    direct: z.string().optional(),
    booth: z.string().optional(),
    github: githubSourceSchema.optional(),
    GoogleDrive: googleDriveSourceSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys: Array<keyof typeof value> = ["direct", "booth", "github", "GoogleDrive"];
    const enabled = keys.filter((key) => value[key] !== undefined);
    if (enabled.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one source type is required (direct / booth / github / GoogleDrive).",
      });
    }
  });

const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("download"),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("extract"),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("extract_sfx"),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("copy"),
      from: z.string(),
      to: z.string(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("delete"),
      path: z.string(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("run"),
      path: z.string(),
      args: z.array(z.string()),
      elevate: z.boolean().optional(),
    })
    .passthrough(),
  z
    .object({
      action: z.literal("run_auo_setup"),
      path: z.string(),
    })
    .passthrough(),
]);

const installerSchema = z
  .object({
    source: installerSourceSchema,
    install: z.array(actionSchema),
    uninstall: z.array(actionSchema),
  })
  .strict();

const versionFileSchema = z
  .object({
    path: z.string(),
    XXH3_128: z.string(),
  })
  .strict();

const versionSchema = z
  .object({
    version: z.string(),
    release_date: z.string().regex(releaseDateRegex, "Expected YYYY-MM-DD."),
    file: z.array(versionFileSchema),
  })
  .strict();

const packageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    summary: z.string(),
    description: z.string(),
    author: z.string(),
    repoURL: z.string(),
    "latest-version": z.string(),
    licenses: z.array(licenseSchema),
    tags: z.array(z.string()),
    dependencies: z.array(z.string()),
    images: z.array(imageSchema),
    installer: installerSchema,
    version: z.array(versionSchema),
    popularity: z.number().optional(),
    trend: z.number().optional(),
    niconiCommonsId: z.string().optional(),
    originalAuthor: z.string().optional(),
  })
  .strict();

const indexSchema = z.array(packageSchema);

type IndexData = z.infer<typeof indexSchema>;

type ValidationIssue = {
  path: (string | number)[];
  message: string;
};

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "<root>";
  }

  return path
    .map((segment) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      return `.${String(segment)}`;
    })
    .join("")
    .replace(/^\./, "");
}

function packageLabel(raw: unknown, path: readonly PropertyKey[]): string {
  if (!Array.isArray(raw) || typeof path[0] !== "number") {
    return "<unknown>";
  }

  const candidate = raw[path[0]] as Record<string, unknown> | undefined;
  if (candidate && typeof candidate.id === "string" && candidate.id.length > 0) {
    return candidate.id;
  }

  return `index:${path[0]}`;
}

function semanticChecks(data: IndexData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const idToIndexes = new Map<string, number[]>();

  data.forEach((pkg, index) => {
    const indexes = idToIndexes.get(pkg.id) ?? [];
    indexes.push(index);
    idToIndexes.set(pkg.id, indexes);

    if (pkg.version.length === 0) {
      issues.push({
        path: [index, "version"],
        message: "version must contain at least one entry.",
      });
      return;
    }

    const latestVersion = pkg.version[pkg.version.length - 1].version;
    if (latestVersion !== pkg["latest-version"]) {
      issues.push({
        path: [index, "latest-version"],
        message: `latest-version (${pkg["latest-version"]}) must match the last version entry (${latestVersion}).`,
      });
    }
  });

  for (const [id, indexes] of idToIndexes.entries()) {
    if (indexes.length <= 1) {
      continue;
    }
    for (const index of indexes) {
      issues.push({
        path: [index, "id"],
        message: `Duplicate id detected: ${id}`,
      });
    }
  }

  return issues;
}

function main(): void {
  const target = process.argv[2] ?? "index.json";
  const targetPath = resolve(target);

  let rawText = "";
  try {
    rawText = readFileSync(targetPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR Failed to read file: ${targetPath}`);
    console.error(`ERROR ${message}`);
    process.exit(1);
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR Invalid JSON: ${targetPath}`);
    console.error(`ERROR ${message}`);
    process.exit(1);
  }

  const parsed = indexSchema.safeParse(rawData);
  if (!parsed.success) {
    console.error(`ERROR Schema validation failed (${parsed.error.issues.length} issue(s)).`);
    for (const issue of parsed.error.issues) {
      const path = formatPath(issue.path);
      const pkg = packageLabel(rawData, issue.path);
      console.error(`ERROR [${pkg}] ${path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const semanticIssues = semanticChecks(parsed.data);
  if (semanticIssues.length > 0) {
    console.error(`ERROR Semantic validation failed (${semanticIssues.length} issue(s)).`);
    for (const issue of semanticIssues) {
      const path = formatPath(issue.path);
      const pkg = packageLabel(parsed.data, issue.path);
      console.error(`ERROR [${pkg}] ${path}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`OK Validation passed: ${target} (packages=${parsed.data.length})`);
}

main();
