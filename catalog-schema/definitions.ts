import { z } from "zod";

export const CATALOG_SCHEMA_VERSION = 2 as const;
export const SUPPORTED_LOCALES = ["ja", "en", "ko", "zh-CN", "zh-TW"] as const;
export const SOURCE_LOCALE = "ja" as const;
export const SOURCE_CONTENT_FALLBACK_LOCALES = ["en", SOURCE_LOCALE] as const;

export const catalogPackageIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const catalogPackageTypeValues = [
  "core",
  "mod",
  "inputPlugin",
  "outputPlugin",
  "generalPlugin",
  "filterPlugin",
  "script",
  "custom",
] as const;
export const catalogPackageRoleValues = ["primaryPackage", "supportPackage"] as const;
export const catalogLicenseTypeValues = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "GPL-2.0",
  "GPL-3.0",
  "CC0-1.0",
  "Unlicense",
  "custom",
  "unknown",
] as const;

export const nonEmptyStringSchema = z.string().min(1);
export const nonEmptyStringArraySchema = z.array(nonEmptyStringSchema);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const xxh128Schema = z.string().regex(/^[A-Fa-f0-9]{32}$/);
export const gitCommitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const catalogPackageIdSchema = z.string().regex(catalogPackageIdPattern);
export const catalogPackageTypeSchema = z.enum(catalogPackageTypeValues);
export const catalogPackageRoleSchema = z.enum(catalogPackageRoleValues);
export const catalogLicenseTypeSchema = z.enum(catalogLicenseTypeValues);

const httpUrlSchema = z.string().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "Expected an HTTP(S) URL.");
const httpsUrlSchema = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Expected an HTTPS URL.");
const localReferenceSchema = z
  .string()
  .regex(/^\.\//, "Expected a package-local path beginning with './'.")
  .refine(
    (value) => !value.split("/").includes(".."),
    "Path must not escape the package directory.",
  );
const markdownReferenceSchema = z
  .string()
  .refine(
    (value) =>
      /^https?:\/\//u.test(value) || (value.startsWith("./") && !value.split("/").includes("..")),
    "Expected a package-local path or an HTTP(S) URL.",
  );

export const markdownRefSchema = z.object({ markdownSource: nonEmptyStringSchema });
export const deprecationSchema = z.object({ message: nonEmptyStringSchema });

export const catalogLicenseCopyrightSchema = z
  .object({ years: nonEmptyStringSchema, holder: nonEmptyStringSchema })
  .strict();
export const catalogLicenseSchema = z
  .object({
    type: catalogLicenseTypeSchema,
    name: nonEmptyStringSchema.optional(),
    copyrights: z.array(catalogLicenseCopyrightSchema).min(1).optional(),
    licenseBody: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((license, context) => {
    if (license.copyrights !== undefined && license.licenseBody !== undefined) {
      context.addIssue({
        code: "custom",
        message: "copyrights and licenseBody are mutually exclusive.",
      });
    }
    if (license.type === "custom" && license.licenseBody === undefined) {
      context.addIssue({
        code: "custom",
        path: ["licenseBody"],
        message: "licenseBody is required for a custom license.",
      });
    }
  });

export const directUrlInstallerSourceSchema = z
  .object({ type: z.literal("directUrl"), url: httpUrlSchema })
  .strict();
export const boothInstallerSourceSchema = z
  .object({ type: z.literal("booth"), url: httpsUrlSchema })
  .strict();
export const githubReleaseInstallerSourceSchema = z
  .object({
    type: z.literal("githubRelease"),
    owner: nonEmptyStringSchema,
    repo: nonEmptyStringSchema,
    pattern: nonEmptyStringSchema,
  })
  .strict();
export const googleDriveInstallerSourceSchema = z
  .object({ type: z.literal("googleDrive"), id: nonEmptyStringSchema })
  .strict();
export const installationSourceSchema = z.discriminatedUnion("type", [
  directUrlInstallerSourceSchema,
  boothInstallerSourceSchema,
  githubReleaseInstallerSourceSchema,
  googleDriveInstallerSourceSchema,
]);

export const downloadInstallStepSchema = z.object({ action: z.literal("download") }).strict();
export const extractInstallStepSchema = z
  .object({
    action: z.literal("extract"),
    from: nonEmptyStringSchema.optional(),
    to: nonEmptyStringSchema.optional(),
  })
  .strict();
export const extractSfxInstallStepSchema = z
  .object({
    action: z.literal("extractSfx"),
    from: nonEmptyStringSchema.optional(),
    to: nonEmptyStringSchema.optional(),
  })
  .strict();
export const copyInstallStepSchema = z
  .object({ action: z.literal("copy"), from: nonEmptyStringSchema, to: nonEmptyStringSchema })
  .strict();
export const deleteInstallStepSchema = z
  .object({ action: z.literal("delete"), path: nonEmptyStringSchema })
  .strict();
export const runInstallStepSchema = z
  .object({
    action: z.literal("run"),
    path: nonEmptyStringSchema,
    args: nonEmptyStringArraySchema.optional(),
    elevate: z.boolean().optional(),
  })
  .strict();
export const runAuoSetupInstallStepSchema = z
  .object({ action: z.literal("runAuoSetup"), path: nonEmptyStringSchema })
  .strict();
export const installStepSchema = z.union([
  downloadInstallStepSchema,
  extractInstallStepSchema,
  extractSfxInstallStepSchema,
  copyInstallStepSchema,
  deleteInstallStepSchema,
  runInstallStepSchema,
  runAuoSetupInstallStepSchema,
]);
export const uninstallStepSchema = z.union([deleteInstallStepSchema, runInstallStepSchema]);
export const installationSchema = z
  .object({
    source: installationSourceSchema,
    installSteps: z.array(installStepSchema),
    uninstallSteps: z.array(uninstallStepSchema),
  })
  .strict();
export const catalogInstallationSourceSchema = z.discriminatedUnion("type", [
  directUrlInstallerSourceSchema,
  boothInstallerSourceSchema,
  googleDriveInstallerSourceSchema,
]);
export const catalogInstallationSchema = installationSchema.safeExtend({
  source: catalogInstallationSourceSchema,
});

export const relationSetSchema = z
  .object({
    requires: z.array(catalogPackageIdSchema).optional(),
    recommends: z.array(catalogPackageIdSchema).optional(),
    conflicts: z.array(catalogPackageIdSchema).optional(),
    similar: z.array(catalogPackageIdSchema).optional(),
    replaces: z.array(catalogPackageIdSchema).optional(),
    forkOf: catalogPackageIdSchema.optional(),
  })
  .strict();

export const catalogVersionFileSchema = z
  .object({ path: nonEmptyStringSchema, xxh128: xxh128Schema })
  .strict();
export const catalogVersionSchema = z
  .object({
    version: nonEmptyStringSchema,
    releaseDate: isoDateSchema,
    files: z.array(catalogVersionFileSchema).min(1),
  })
  .strict();

export const sourceMetaSchema = z
  .object({
    id: catalogPackageIdSchema,
    legacyId: z.string(),
    packageType: catalogPackageTypeSchema,
    packageRole: catalogPackageRoleSchema,
    addedAt: isoDateSchema,
    packagePageUrl: httpUrlSchema,
    fundingUrl: httpUrlSchema.optional(),
    isOpenSource: z.boolean().optional(),
    niconiCommonsId: nonEmptyStringSchema.optional(),
  })
  .strict();
export const sourceContentSchema = z
  .object({
    name: nonEmptyStringSchema,
    author: nonEmptyStringSchema,
    originalAuthor: nonEmptyStringSchema.optional(),
    typeLabel: nonEmptyStringSchema.optional(),
    tags: z.array(nonEmptyStringSchema),
    description: z
      .object({ summary: nonEmptyStringSchema, markdownSource: markdownReferenceSchema })
      .strict(),
    changelog: z.object({ markdownSource: markdownReferenceSchema }).strict().optional(),
    notice: z.object({ markdownSource: localReferenceSchema }).strict().optional(),
    deprecation: z.object({ message: nonEmptyStringSchema }).strict().optional(),
    licenses: z.array(catalogLicenseSchema).min(1),
    images: z
      .object({
        thumbnail: localReferenceSchema.optional(),
        detailImages: z.array(localReferenceSchema).optional(),
      })
      .strict()
      .refine(
        (images) => images.thumbnail !== undefined || (images.detailImages?.length ?? 0) > 0,
        "images must contain a thumbnail or at least one detail image.",
      )
      .optional(),
  })
  .strict();
export const sourceInstallSchema = z
  .object({ relations: relationSetSchema.optional(), installation: installationSchema })
  .strict();
export const sourceVersionsSchema = z
  .object({ versions: z.array(catalogVersionSchema).min(1) })
  .strict();

export const updateCheckSourceSchema = z.discriminatedUnion("type", [
  githubReleaseInstallerSourceSchema,
  z
    .object({
      type: z.literal("webPage"),
      url: httpsUrlSchema,
      assetPattern: nonEmptyStringSchema,
      versionExtractPattern: nonEmptyStringSchema,
      downloadUrlTemplate: nonEmptyStringSchema,
    })
    .strict(),
]);
export const hashTargetSchema = z
  .object({
    archiveFormat: z.enum(["none", "zip", "7zip"]).optional(),
    sourcePaths: z.array(nonEmptyStringSchema).min(1),
    recordPaths: z.array(nonEmptyStringSchema).min(1),
  })
  .strict();
export const sourceUpdateCheckSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      source: updateCheckSourceSchema.optional(),
      hashTargets: z.array(hashTargetSchema).min(1).optional(),
    })
    .strict(),
]);
export const sourcePackageSchema = z
  .object({
    meta: sourceMetaSchema,
    content: sourceContentSchema,
    install: sourceInstallSchema,
    versions: sourceVersionsSchema,
    updateCheck: sourceUpdateCheckSchema.optional(),
  })
  .strict();

const artifactFileSchema = z.object({ path: nonEmptyStringSchema, sha256: sha256Schema });
export const manifestArtifactSchema = z.object({
  updatedAt: isoDateTimeSchema,
  json: artifactFileSchema,
  zstd: artifactFileSchema,
});

export const catalogListPackageSchema = z.object({
  id: catalogPackageIdSchema,
  legacyId: z.string(),
  packageType: catalogPackageTypeSchema,
  packageRole: catalogPackageRoleSchema,
  addedAt: isoDateSchema,
  name: nonEmptyStringSchema,
  author: nonEmptyStringSchema,
  typeLabel: nonEmptyStringSchema.optional(),
  tags: nonEmptyStringArraySchema,
  summary: nonEmptyStringSchema,
  changelog: markdownRefSchema.optional(),
  niconiCommonsId: nonEmptyStringSchema.optional(),
  deprecation: deprecationSchema.optional(),
  images: z.object({ thumbnail: nonEmptyStringSchema }).optional(),
});
export const catalogListSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  locale: localeSchema,
  packages: z.array(catalogListPackageSchema),
});

export const catalogDetailPackageSchema = z.object({
  packagePageUrl: nonEmptyStringSchema,
  originalAuthor: nonEmptyStringSchema.optional(),
  fundingUrl: nonEmptyStringSchema.optional(),
  isOpenSource: z.boolean().optional(),
  description: markdownRefSchema,
  notice: markdownRefSchema.optional(),
  licenses: z.array(catalogLicenseSchema),
  images: z.object({ detailImages: nonEmptyStringArraySchema.optional() }).optional(),
});
export const catalogDetailSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  locale: localeSchema,
  packages: z.record(catalogPackageIdSchema, catalogDetailPackageSchema),
});

export const catalogVersionsPackageSchema = sourceVersionsSchema;
export const catalogVersionsSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  packages: z.record(catalogPackageIdSchema, catalogVersionsPackageSchema),
});
export const catalogLatestVersionsSchema = z.record(catalogPackageIdSchema, nonEmptyStringSchema);
export const catalogPopularityPackageSchema = z.object({
  popularity: z.number(),
  trend: z.number(),
});
export const catalogPopularitySchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  packages: z.record(catalogPackageIdSchema, catalogPopularityPackageSchema),
});
export const catalogInstallPackageSchema = sourceInstallSchema.safeExtend({
  installation: catalogInstallationSchema,
});
export const catalogInstallSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  packages: z.record(catalogPackageIdSchema, catalogInstallPackageSchema),
});
const publishedHashTargetSchema = hashTargetSchema.safeExtend({
  archiveFormat: z.enum(["none", "zip", "7zip"]),
});
export const catalogUpdateCheckSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  packages: z.array(
    z.object({
      id: catalogPackageIdSchema,
      source: updateCheckSourceSchema,
      hashTargets: z.array(publishedHashTargetSchema).min(1),
    }),
  ),
});
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
    artifactCommit: gitCommitShaSchema.optional(),
    artifactBaseUrl: httpUrlSchema
      .refine((value) => value.endsWith("/"), "Expected a directory URL ending with '/'.")
      .optional(),
    updatedAt: isoDateTimeSchema,
    locales: z.array(localeSchema).min(1),
    paths: z.object({
      list: z.record(localeSchema, manifestArtifactSchema),
      detail: z.record(localeSchema, manifestArtifactSchema),
      versions: manifestArtifactSchema,
      popularity: manifestArtifactSchema,
      install: manifestArtifactSchema,
      updateCheck: manifestArtifactSchema,
    }),
  })
  .superRefine((manifest, context) => {
    if ((manifest.artifactCommit === undefined) !== (manifest.artifactBaseUrl === undefined)) {
      context.addIssue({
        code: "custom",
        path: [manifest.artifactCommit === undefined ? "artifactCommit" : "artifactBaseUrl"],
        message:
          "artifactCommit and artifactBaseUrl must either both be present or both be absent.",
      });
    }
    if (
      manifest.artifactCommit !== undefined &&
      manifest.artifactBaseUrl !== undefined &&
      !new URL(manifest.artifactBaseUrl).pathname
        .split("/")
        .filter(Boolean)
        .includes(manifest.artifactCommit)
    ) {
      context.addIssue({
        code: "custom",
        path: ["artifactBaseUrl"],
        message: "artifactBaseUrl must contain artifactCommit as a complete path segment.",
      });
    }
    for (const locale of manifest.locales) {
      if (manifest.paths.list[locale] === undefined) {
        context.addIssue({
          code: "custom",
          path: ["paths", "list", locale],
          message: "Missing list artifact.",
        });
      }
      if (manifest.paths.detail[locale] === undefined) {
        context.addIssue({
          code: "custom",
          path: ["paths", "detail", locale],
          message: "Missing detail artifact.",
        });
      }
    }
  });

export type CatalogPackageType = z.infer<typeof catalogPackageTypeSchema>;
export type CatalogLocale = z.infer<typeof localeSchema>;
export type CatalogPackageRole = z.infer<typeof catalogPackageRoleSchema>;
export type CatalogLicenseType = z.infer<typeof catalogLicenseTypeSchema>;
export type CatalogLicense = z.infer<typeof catalogLicenseSchema>;
export type Installation = z.infer<typeof installationSchema>;
export type CatalogVersion = z.infer<typeof catalogVersionSchema>;
export type SourceMeta = z.infer<typeof sourceMetaSchema>;
export type SourceContent = z.infer<typeof sourceContentSchema>;
export type SourceInstall = z.infer<typeof sourceInstallSchema>;
export type SourceVersions = z.infer<typeof sourceVersionsSchema>;
export type SourceUpdateCheck = z.infer<typeof sourceUpdateCheckSchema>;
export type SourcePackage = z.infer<typeof sourcePackageSchema>;
export type CatalogManifest = z.infer<typeof manifestSchema>;
export type CatalogListPackage = z.infer<typeof catalogListPackageSchema>;
export type CatalogList = z.infer<typeof catalogListSchema>;
export type CatalogDetailPackage = z.infer<typeof catalogDetailPackageSchema>;
export type CatalogDetail = z.infer<typeof catalogDetailSchema>;
export type CatalogVersions = z.infer<typeof catalogVersionsSchema>;
export type CatalogPopularity = z.infer<typeof catalogPopularitySchema>;
export type CatalogInstallPackage = z.infer<typeof catalogInstallPackageSchema>;
export type CatalogInstall = z.infer<typeof catalogInstallSchema>;
