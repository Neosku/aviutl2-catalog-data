// v2 schema への変換テーブル
export const LEGACY_TYPE_TO_PACKAGE_TYPE = {
  本体: "core",
  MOD: "mod",
  入力プラグイン: "inputPlugin",
  出力プラグイン: "outputPlugin",
  汎用プラグイン: "generalPlugin",
  フィルタプラグイン: "filterPlugin",
  スクリプト: "script",
  スクリプトモジュール: "script",
  オブジェクト: "script",
  言語ファイル: "custom",
  その他: "custom",
} as const;

export const LEGACY_LICENSE_RULES = {
  MIT: { type: "MIT" },
  "Apache-2.0": { type: "Apache-2.0" },
  "MIT No Attribution": { type: "custom", name: "MIT No Attribution" },
  "MIT-0 License": { type: "custom", name: "MIT-0" },
  "MIT-0  license": { type: "custom", name: "MIT-0" },
  "0BSD": { type: "custom", name: "0BSD" },
  "BSD-2-Clause": { type: "BSD-2-Clause" },
  "BSD-3-Clause": { type: "BSD-3-Clause" },
  "BSL-1.0": { type: "custom", name: "BSL-1.0" },
  "CC0-1.0": { type: "CC0-1.0" },
  GPLv3: { type: "GPL-3.0" },
  "GPL-3.0": { type: "GPL-3.0" },
  "GPL-3.0 license": { type: "GPL-3.0" },
  Unlicense: { type: "Unlicense" },
  "WTFPL license": { type: "custom", name: "WTFPL license" },
  カスタムライセンス: { type: "custom", name: "カスタムライセンス" },
  独自ライセンス: { type: "custom", name: "独自ライセンス" },
  "ニコニ・コモンズ": { type: "custom", name: "ニコニ・コモンズ" },
  不明: { type: "unknown", name: "不明" },
} as const;

export const LEGACY_INSTALLER_SOURCE_TO_NEW_TYPE = {
  direct: "directUrl",
  booth: "booth",
  github: "githubRelease",
  GoogleDrive: "googleDrive",
} as const;

export const LEGACY_ACTION_TO_NEW_ACTION = {
  download: "download",
  extract: "extract",
  extract_sfx: "extractSfx",
  copy: "copy",
  delete: "delete",
  run: "run",
  run_auo_setup: "runAuoSetup",
} as const;

export const LEGACY_SEARCH_CHECK_TYPE_TO_NEW_SOURCE = {
  GitHub: "githubRelease",
  URL: "webPage",
} as const;

export const LEGACY_HASH_EXTRACT_FORMATS = new Set(["zip", "7zip"]);

export const LEGACY_ID_OVERRIDES: Record<string, string> = {
  "Garech.jp_akey.aul2": "garech.jp-akey-aul2",
  "Nagomiku.NagoEffect2.mod2": "nagomiku.nagoeffect2-mod2",
  "sevenc-nanashi.aviutl2-rs.rusty_binaural": "sevenc-nanashi.aviutl2-rs-rusty-binaural",
  "sevenc-nanashi.aviutl2-rs.rusty_chiptune": "sevenc-nanashi.aviutl2-rs-rusty-chiptune",
  "sevenc-nanashi.aviutl2-rs.rusty_equalizer": "sevenc-nanashi.aviutl2-rs-rusty-equalizer",
  "sevenc-nanashi.aviutl2-rs.rusty_ffmpeg": "sevenc-nanashi.aviutl2-rs-rusty-ffmpeg",
  "sevenc-nanashi.aviutl2-rs.rusty_image_rs_input":
    "sevenc-nanashi.aviutl2-rs-rusty-image-rs-input",
  "sevenc-nanashi.aviutl2-rs.rusty_image_rs_output":
    "sevenc-nanashi.aviutl2-rs-rusty-image-rs-output",
  "sevenc-nanashi.aviutl2-rs.rusty_local_alias_plugin":
    "sevenc-nanashi.aviutl2-rs-rusty-local-alias-plugin",
  "sevenc-nanashi.aviutl2-rs.rusty_metronome_plugin":
    "sevenc-nanashi.aviutl2-rs-rusty-metronome-plugin",
  "sevenc-nanashi.aviutl2-rs.rusty_midi_player": "sevenc-nanashi.aviutl2-rs-rusty-midi-player",
  "sevenc-nanashi.aviutl2-rs.rusty_pixelsort": "sevenc-nanashi.aviutl2-rs-rusty-pixelsort",
  "sevenc-nanashi.aviutl2-rs.rusty_random_color": "sevenc-nanashi.aviutl2-rs-rusty-random-color",
  "sevenc-nanashi.aviutl2-rs.rusty_restart_shortcut":
    "sevenc-nanashi.aviutl2-rs-rusty-restart-shortcut",
  "sevenc-nanashi.aviutl2-rs.rusty_scripts_search":
    "sevenc-nanashi.aviutl2-rs-rusty-scripts-search",
  "sevenc-nanashi.aviutl2-rs.rusty_single_image_output":
    "sevenc-nanashi.aviutl2-rs-rusty-single-image-output",
  "sevenc-nanashi.aviutl2-rs.rusty_srt_file": "sevenc-nanashi.aviutl2-rs-rusty-srt-file",
  "sevenc-nanashi.aviutl2-rs.rusty_statistics": "sevenc-nanashi.aviutl2-rs-rusty-statistics",
  "sevenc-nanashi.aviutl2-scripts.camera_frame-obj2":
    "sevenc-nanashi.aviutl2-scripts-camera-frame-obj2",
  "sevenc-nanashi.aviutl2-scripts.crt-display.anm2":
    "sevenc-nanashi.aviutl2-scripts-crt-display-anm2",
  "sevenc-nanashi.aviutl2-scripts.gpu_pixelsort-anm2":
    "sevenc-nanashi.aviutl2-scripts-gpu-pixelsort-anm2",
  "sevenc-nanashi.aviutl2-scripts.hide_on_export-anm2":
    "sevenc-nanashi.aviutl2-scripts-hide-on-export-anm2",
  "sevenc-nanashi.aviutl2-scripts.pixel-transform-anm2":
    "sevenc-nanashi.aviutl2-scripts-pixel-transform-anm2",
  "sevenc-nanashi.aviutl2-scripts.targeted-scale-anm2":
    "sevenc-nanashi.aviutl2-scripts-targeted-scale-anm2",
  "sevenc-nanashi.aviutl2-scripts.vertical-video-obj2":
    "sevenc-nanashi.aviutl2-scripts-vertical-video-obj2",
  "V.Bernkastel.AviUtl2_Language_kr": "v-bernkastel.aviutl2-language-kr",
};

export const LEGACY_PACKAGE_ROLE_OVERRIDES: Record<string, "primaryPackage" | "supportPackage"> =
  {};

export type IdCandidateResult =
  | {
      ok: true;
      candidate: string;
    }
  | {
      ok: false;
      reason: string;
    };

export function deriveIdCandidate(legacyId: string): IdCandidateResult {
  const override = LEGACY_ID_OVERRIDES[legacyId];
  if (override !== undefined) {
    return {
      ok: true,
      candidate: override,
    };
  }

  const dotCount = [...legacyId].filter((character) => character === ".").length;
  if (dotCount !== 1) {
    return {
      ok: false,
      reason:
        "legacy id must be reviewed manually because it does not split into exactly one namespace separator.",
    };
  }

  const [legacyNamespace, legacySlug] = legacyId.split(".");
  const namespace = slugifyIdSegment(legacyNamespace);
  const slug = slugifyIdSegment(legacySlug);

  if (namespace.length === 0 || slug.length === 0) {
    return {
      ok: false,
      reason:
        "legacy id must be reviewed manually because slugification produced an empty namespace or slug.",
    };
  }

  return {
    ok: true,
    candidate: `${namespace}.${slug}`,
  };
}

function slugifyIdSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}
