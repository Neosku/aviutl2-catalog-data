// パッケージ.mdの生成
import { resolve } from "node:path";
import process from "node:process";
import { writeTextFile } from "../shared/fs-utils.ts";
import { SOURCE_LOCALE } from "../../catalog-schema/definitions.ts";
import { loadSourcePackages, pickContentForLocale } from "../source/loader.ts";
import { resolveUpdateCheck } from "../shared/update-check.ts";

type PackageListEntry = {
  id: string;
  name: string;
  author: string;
  summary: string;
  addedAt: string;
  autoUpdate: boolean;
};

function escapeMarkdownTableCell(value: string): string {
  return value.trim().replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function buildMarkdown(entries: PackageListEntry[]): string {
  const lines = [
    "# AviUtl2カタログ登録パッケージ一覧",
    "",
    "AviUtl2カタログに登録されているパッケージ一覧です。",
    "自動更新対応は GitHub Release を用いてリリースされているパッケージのみ対応しており、30分ごとにアップデートを確認します。",
    "",
    "| パッケージ名 | 作者 | 自動更新対応 | 概要 |",
    "| --- | --- | --- | --- |",
  ];

  for (const entry of entries) {
    const name = escapeMarkdownTableCell(entry.name);
    const author = escapeMarkdownTableCell(entry.author);
    const summary = escapeMarkdownTableCell(entry.summary);

    lines.push(`| ${name} | ${author} | ${entry.autoUpdate ? "〇" : "×"} | ${summary} |`);
  }

  return `${lines.join("\n")}\n`;
}

function main(): void {
  const repoRoot = process.cwd();
  const packagesRoot = resolve(repoRoot, "packages");
  const outputPath = resolve(repoRoot, "publish-preview", "パッケージ.md");

  const entries = loadSourcePackages(packagesRoot)
    .map((pkg) => {
      const content = pickContentForLocale(pkg, SOURCE_LOCALE);
      return {
        id: pkg.meta.id,
        name: content.name,
        author: content.author,
        summary: content.description.summary,
        addedAt: pkg.meta.addedAt,
        autoUpdate: resolveUpdateCheck(pkg) !== null,
      } satisfies PackageListEntry;
    })
    .sort(
      (left, right) =>
        left.addedAt.localeCompare(right.addedAt, "ja") || left.id.localeCompare(right.id, "ja"),
    );

  writeTextFile(outputPath, buildMarkdown(entries));

  console.log(`Generated package markdown from source packages: ${outputPath}`);
}

main();
