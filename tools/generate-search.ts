import fs from "node:fs";
import path from "node:path";

type JsonObject = Record<string, any>;

const INDEX_PATH = path.resolve("index.json");
const SEARCH_PATH = path.resolve("search-gen.json");

const indexData: JsonObject[] = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf-8"),
);

// index.json の latest-version に対応する version ブロックを返す
function findLatestVersion(pkg_data: JsonObject): JsonObject | undefined {
  return pkg_data.version?.find(
    (v: JsonObject) => v.version === pkg_data["latest-version"],
  );
}

// ZIP、7z のインストールステップが含まれた場合の extract の値を返す
// extract_sfx = 7zip、extract = zip
function detectExtractType(pkg_data: JsonObject): "zip" | "7zip" | undefined {
  const install = pkg_data.installer?.install ?? [];

  if (install.some((x: JsonObject) => x.action === "extract_sfx")) {
    return "7zip";
  }

  if (install.some((x: JsonObject) => x.action === "extract")) {
    return "zip";
  }

  return undefined;
}

// パス区切り文字を / に統一する (内部処理用)
function normalizePath(p: string): string {
  return p.replaceAll("\\", "/");
}

// パスの変数部分を削除する
function stripKnownRoot(p: string): string {
  const normalized = normalizePath(p);

  return normalized
    .replace(/^\{pluginsDir\}\//, "")
    .replace(/^\{scriptsDir\}\//, "")
    .replace(/^\{dataDir\}\//, "")
    .replace(/^\{appDir\}\//, "");
}

function isFilePath(p: string): boolean {
  return path.posix.extname(p) !== "";
}

// {tmp} から始まるパスを、{tmp} を省いて返す
// それ以外の場所からのコピーは hash-calc の対象外
function tmpSourcePath(from: string): string | undefined {
  const normalized = normalizePath(from).replace(/\/+$/, "");

  if (normalized === "{tmp}") {
    return "";
  }

  if (normalized.startsWith("{tmp}/")) {
    return normalized.substring("{tmp}/".length);
  }

  return undefined;
}

// copy.to から見た相対パスを返す
function relativeFromInstallTo(
  recordPath: string,
  installTo: string,
): string | undefined {
  const normalizedRecordPath = normalizePath(recordPath);
  const normalizedInstallTo = normalizePath(installTo).replace(/\/+$/, "");

  if (normalizedRecordPath === normalizedInstallTo) {
    return "";
  }

  if (normalizedRecordPath.startsWith(normalizedInstallTo + "/")) {
    return normalizedRecordPath.substring(normalizedInstallTo.length + 1);
  }

  return undefined;
}

function joinPosix(...parts: string[]): string {
  return parts.filter((x) => x !== "").join("/").replace(/\/+/g, "/");
}

// rigaya さんの出力プラグインは Plugin/ 配下に展開されるため、
// 7-Zip SFX かつ .auo2 の場合だけ Plugin/ を補う
function applyRigayaPluginPrefix(
  archivePath: string,
  extract: string | undefined,
): string {
  if (extract !== "7zip" || !archivePath.endsWith(".auo2")) {
    return archivePath;
  }

  if (archivePath.startsWith("Plugin/")) {
    return archivePath;
  }

  return joinPosix("Plugin", archivePath);
}

// latest-version の file[] と installer.install[] を照合して、
// ZIP内のパスとインストール先のパスを抽出、hash-calcを作る
function buildHashCalc(pkg_data: JsonObject): JsonObject[] | undefined {
  const latest = findLatestVersion(pkg_data);

  if (!latest?.file?.length) {
    return undefined;
  }

  const install = pkg_data.installer?.install ?? [];
  const extract = detectExtractType(pkg_data);

  const recordPaths = latest.file.map((f: JsonObject) => String(f.path));
  const paths: string[] = [];

  for (const file of latest.file) {
    const recordPath = String(file.path);
    const normalizedRecordPath = normalizePath(recordPath);
    const relativeRecordPath = stripKnownRoot(recordPath);
    const recordBaseName = path.posix.basename(relativeRecordPath);

    let archivePath: string | undefined;

    // まず、copy.from がファイルを直接指していて、file[].path の basename と一致するケース
    for (const step of install) {
      if (
        step.action !== "copy" ||
        typeof step.from !== "string" ||
        typeof step.to !== "string"
      ) {
        continue;
      }

      const relativeInstallTo = relativeFromInstallTo(
        normalizedRecordPath,
        String(step.to),
      );

      if (relativeInstallTo === undefined) {
        continue;
      }

      const archiveSource = tmpSourcePath(String(step.from));

      if (archiveSource === undefined) {
        continue;
      }

      if (
        isFilePath(archiveSource) &&
        path.posix.basename(archiveSource) === recordBaseName
      ) {
        archivePath = archiveSource;
        break;
      }
    }

    if (!archivePath) {
      // 次に、copy.from がディレクトリを指すケース
      // copy.to 以下の相対パスを抽出し、copy.from に足して、アーカイブ内パスを推定する
      for (const step of install) {
        if (
          step.action !== "copy" ||
          typeof step.from !== "string" ||
          typeof step.to !== "string"
        ) {
          continue;
        }

        const relativeInstallTo = relativeFromInstallTo(
          normalizedRecordPath,
          String(step.to),
        );

        if (relativeInstallTo === undefined) {
          continue;
        }

        const archiveSource = tmpSourcePath(String(step.from));

        if (archiveSource === undefined) {
          continue;
        }

        if (isFilePath(archiveSource)) {
          continue;
        }

        archivePath = joinPosix(
          archiveSource,
          relativeInstallTo || recordBaseName,
        );
        break;
      }
    }

    if (!archivePath) {
      // インストール手順から追えない場合 (インストーラ型の場合)、仮想変数を外した記録パスを暫定的に使う
      // rigaya さんの出力プラグインの場合は特別に Plugin/ を補う
      archivePath = applyRigayaPluginPrefix(relativeRecordPath, extract);
    }

    paths.push(archivePath);
  }

  const result: JsonObject = {};

  if (extract) {
    result.extract = extract;
  }

  result.paths = paths;
  result.recordPaths = recordPaths;

  return [result];
}

// search.json のJSON形式へ変換する
function buildGithubEntry(pkg_data: JsonObject): JsonObject {
  const github = pkg_data.installer.source.github;

  return {
    id: pkg_data.id,
    "latest-version": pkg_data["latest-version"],
    checkType: {
      type: "GitHub",
      repo: `${github.owner}/${github.repo}`,
      regex: github.pattern,
      "hash-calc": buildHashCalc(pkg_data),
    },
  };
}

// GitHub ソースを持つ項目だけを自動生成する
// 結果は search-gen.json に書き出して、差分チェック→問題ないものをセルフでマージ
const searchData = indexData
  .map((pkg_data) => {
    if (pkg_data.installer?.source?.github) {
      return buildGithubEntry(pkg_data);
    }

    return null;
  })
  .filter(Boolean);

fs.writeFileSync(SEARCH_PATH, JSON.stringify(searchData, null, 2) + "\n");

console.log(
  `Generated ${searchData.length} entries: ${SEARCH_PATH}`,
);
