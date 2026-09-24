# NEF-Input

Nikonのカメラの生データファイル形式(.NEF)をAviutl2で読み込める入力プラグインです。

## 機能

- Nikon NEF RAW ファイルの読み込み
- [zenraw](https://crates.io/crates/zenraw) による現像処理（sRGB 出力）
- [memmap2](https://crates.io/crates/memmap2) によるゼロコピーファイル読み込み

## ライセンス

MIT