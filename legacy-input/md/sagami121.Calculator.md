# Aviutl2-Calculator
AviUtl2上で計算ができるプラグイン

# インストール
`aviutl2_calc.aux2` を `C:\ProgramData\aviutl2\Plugin` に配置してください。

# ビルド方法

このプラグインをビルドするには、最新の Rust 環境が必要です。

1. **リポジトリをクローンまたはダウンロードします。**
2. **プロジェクトのルートディレクトリで以下のコマンドを実行します。**
   ```bash
   cargo build --release
   ```
3.ビルドが完了すると、以下の場所にファイルが生成されます。 `target/release/aviutl2_calc.dll`

4.`aviutl2_calc.dll` を `aviutl2_calc.aux2` に改名して、`C:\ProgramData\aviutl2\Plugin`に配置します。

# クレジット
・aviutl2-rs　https://github.com/sevenc-nanashi/aviutl2-rs/
