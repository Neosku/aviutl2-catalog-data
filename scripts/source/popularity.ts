import { resolve } from "node:path";
import {
  catalogPopularitySchema,
  type CatalogPopularity,
} from "../../catalog-schema/definitions.ts";
import { readJsonFile } from "../shared/fs-utils.ts";

export const SOURCE_POPULARITY_RELATIVE_PATH = "catalog-popularity.json";

export function sourcePopularityPath(repoRoot: string): string {
  return resolve(repoRoot, SOURCE_POPULARITY_RELATIVE_PATH);
}

export function loadSourcePopularity(repoRoot: string): CatalogPopularity {
  return catalogPopularitySchema.parse(readJsonFile(sourcePopularityPath(repoRoot)));
}
