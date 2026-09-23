# NEF-Input

Nikonのカメラの生データファイル形式(.NEF)をAviutl2で読み込める入力プラグインです。

## 機能

- Nikon NEF RAW ファイルの読み込み
- [zenraw](https://crates.io/crates/zenraw) による現像処理（sRGB 出力）
- [memmap2](https://crates.io/crates/memmap2) によるゼロコピーファイル読み込み

## インストール

1. Github Releaseから最新の `NEF-Input.au2pkg.zip` をダウンロード
2. `NEF-Input.au2pkg.zip` を、AviUtl2 のプレビュー画面へドラッグ＆ドロップします。

## ビルド

```bash
cargo build --release
```

ビルド成果物は `target/release/nef_input.dll` です。
拡張子を `.aui2` に変更して plugins フォルダに配置してください。

## ライセンス

MIT