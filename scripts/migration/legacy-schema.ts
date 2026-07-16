// 旧schemaの定義
import { z } from "zod";

export const releaseDateRegex = /^\d{4}-\d{2}-\d{2}$/;

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

export const legacyPackageSchema = z
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

export const legacyIndexSchema = z.array(legacyPackageSchema);

const hashCalcSchema = z
  .object({
    extract: z.string().optional(),
    paths: z.array(z.string()),
    recordPaths: z.array(z.string()),
  })
  .strict();

const githubCheckTypeSchema = z
  .object({
    type: z.literal("GitHub"),
    repo: z.string(),
    regex: z.string(),
    "hash-calc": z.array(hashCalcSchema),
  })
  .strict();

const urlCheckTypeSchema = z
  .object({
    type: z.literal("URL"),
    url: z.string(),
    regex: z.string(),
    version_extract: z.string(),
    directTemplate: z.string(),
    "hash-calc": z.array(hashCalcSchema),
  })
  .strict();

export const legacySearchEntrySchema = z
  .object({
    id: z.string(),
    "latest-version": z.string(),
    checkType: z.union([githubCheckTypeSchema, urlCheckTypeSchema]),
  })
  .strict();

export const legacySearchSchema = z.array(legacySearchEntrySchema);

export const legacyDateEntrySchema = z
  .object({
    id: z.string(),
    addedDate: z.string().regex(releaseDateRegex, "Expected YYYY-MM-DD."),
  })
  .strict();

export const legacyDateSchema = z.array(legacyDateEntrySchema);

export type LegacyIndex = z.infer<typeof legacyIndexSchema>;
export type LegacyPackage = z.infer<typeof legacyPackageSchema>;
export type LegacySearch = z.infer<typeof legacySearchSchema>;
export type LegacySearchEntry = z.infer<typeof legacySearchEntrySchema>;
export type LegacyDate = z.infer<typeof legacyDateSchema>;
export type LegacyDateEntry = z.infer<typeof legacyDateEntrySchema>;
