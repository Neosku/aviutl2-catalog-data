# HEIF-HEIC-Input

HEIC/HEIFをAviutl2で読み込める入力プラグインです。

## 対応形式
- .heic
- .heif

## インストール

1. Github Releaseから最新の `HEIF-HEIC-Input.au2pkg.zip` をダウンロード
2. `HEIF-HEIC-Input.au2pkg.zip` を、AviUtl2 のプレビュー画面へドラッグ＆ドロップします。

## ビルド

### 必要なもの

- Rust の MSVC ツールチェーン
- Git
- Visual Studio Build Tools の「C++によるデスクトップ開発」ワークロード

### 手順

PowerShellでプロジェクトのフォルダを開き、次の順番で実行します。

```powershell
cargo install cargo-vcpkg
cargo vcpkg build
cargo build --release
```

`cargo vcpkg build` がlibheifと必要なネイティブライブラリを準備します。初回は依存ライブラリの取得・ビルドに時間がかかります。

ビルド成果物は `target/release/heif_heic_input.dll` です。拡張子を `.aui2` に変更して plugins フォルダに配置してください。

## ライセンス

MIT