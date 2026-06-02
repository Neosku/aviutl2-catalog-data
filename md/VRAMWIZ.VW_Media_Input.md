# 動画IN

動画IN は、AviUtl2 用の入力プラグインです。
FFmpeg 8.1 系 DLL を利用して、動画ファイルと音声ファイルを AviUtl2 へ読み込むことを目的にしています。

## 特徴

- FFmpeg ベースの動画/音声入力プラグイン
- AviUtl2 の入力プラグインとして動作
- 映像は AviUtl2 の 32bit BGRx バッファへ直接出力
- 音声は PCM16 stereo 48kHz として出力
- 余計な UI を持たない軽量構成

## 対応ファイル

現在のフィルター対象:

- `*.mp4`
- `*.mov`
- `*.mkv`
- `*.avi`
- `*.wmv`
- `*.asf`
- `*.webm`
- `*.mpg`
- `*.mpeg`
- `*.m2ts`
- `*.ts`
- `*.m4v`
- `*.mp3`
- `*.wav`
- `*.m4a`
- `*.aac`
- `*.wma`
- `*.flac`
- `*.ogg`
- `*.opus`

`*.wmv` / `*.asf` / `*.webm` / `*.mpg` / `*.mpeg` / `*.m2ts` / `*.ts` / `*.m4v` は、FFmpeg に渡す仮対応として追加しています。
実ファイルでの確認は今後進めます。

`*.mp3` / `*.wav` / `*.m4a` / `*.aac` / `*.wma` / `*.flac` / `*.ogg` / `*.opus` は音声専用入力として扱います。
音声は FFmpeg 経由で PCM16 stereo 48kHz に変換して AviUtl2 へ返します。

## ダウンロード

最新版は GitHub Releases から取得してください。

- [v1.0.0 最新リリース](https://github.com/vramwiz/VW_Media_Input/releases/tag/v1.0.0)

## インストール

リリース zip `VW_Media_Input.zip` を展開し、含まれている `VW_Media_Input` フォルダを次の場所へ配置してください。

```text
C:\ProgramData\aviutl2\Plugin\VW_Media_Input
```

配置例:

```text
C:\ProgramData\aviutl2\Plugin
└─ VW_Media_Input
   ├─ VW_Media_Input.aui2
   ├─ avcodec-62.dll
   ├─ avformat-62.dll
   ├─ avutil-60.dll
   ├─ swresample-6.dll
   └─ swscale-9.dll
```

## ライセンス

このプロジェクトは GNU General Public License v3.0 で公開しています。

- [LICENSE](LICENSE)

