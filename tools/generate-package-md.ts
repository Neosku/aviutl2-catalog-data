import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type IndexEntry = {
  id?: unknown;
  name?: unknown;
  author?: unknown;
  summary?: unknown;
};

type SearchEntry = {
  id?: unknown;
};

const repoRoot = process.cwd();
const indexPath = resolve(repoRoot, "index.json");
const searchPath = resolve(repoRoot, "search.json");
const outputPath = resolve(repoRoot, "パッケージ.md");
const archiveOutputPath = resolve(repoRoot, "archive", "パッケージ一覧.md");

function readJsonArray<T>(path: string): T[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`Expected JSON array: ${path}`);
  }
  return raw as T[];
}

function escapeMarkdownTableCell(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function buildMarkdown(
  entries: IndexEntry[],
  searchIds: Set<string>,
  includeAutoUpdate: boolean,
): string {
  const lines = ["# AviUtl2カタログ登録パッケージ一覧"];
  if (includeAutoUpdate) {
    lines.push("");
    lines.push("AviUtl2カタログに登録されているパッケージ一覧です。");
    lines.push(
      "自動更新対応は GitHub Release を用いてリリースされているパッケージのみ対応しており、30分ごとにアップデートを確認します。",
    );
    lines.push("");
    lines.push("| パッケージ名 | 作者 | 自動更新対応 | 概要 |");
    lines.push("| --- | --- | --- | --- |");
  } else {
    lines.push("");
    lines.push("| パッケージ名 | 作者 | 概要 |");
    lines.push("| --- | --- | --- |");
  }

  for (const entry of entries) {
    const name = escapeMarkdownTableCell(entry.name);
    const author = escapeMarkdownTableCell(entry.author);
    const summary = escapeMarkdownTableCell(entry.summary);

    if (includeAutoUpdate) {
      const autoUpdate = typeof entry.id === "string" && searchIds.has(entry.id) ? "〇" : "×";
      lines.push(`| ${name} | ${author} | ${autoUpdate} | ${summary} |`);
      continue;
    }

    lines.push(`| ${name} | ${author} | ${summary} |`);
  }

  return `${lines.join("\n")}\n`;
}

function writeUtf8File(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function main(): void {
  const indexEntries = readJsonArray<IndexEntry>(indexPath);
  const searchEntries = readJsonArray<SearchEntry>(searchPath);
  const searchIds = new Set(
    searchEntries
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  writeUtf8File(outputPath, buildMarkdown(indexEntries, searchIds, true));
  writeUtf8File(archiveOutputPath, buildMarkdown(indexEntries, searchIds, false));

  console.log(`Generated package markdown: ${outputPath}`);
  console.log(`Generated archive package list: ${archiveOutputPath}`);
}

main();
