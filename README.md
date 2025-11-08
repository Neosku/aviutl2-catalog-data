# AviUtl2 カタログ用データベース

AviUtl2 の「カテゴリ表示」に対応するパッケージ（プラグイン・スクリプトなど）のデータベースです。

## ファイル構成

* **index.json**
  パッケージ情報をまとめたメインのデータベース

* **template.json**
  `index.json` に追記する際のテンプレート

* **search.json**
  パッケージに定期的なアップデートがないか確認するためのデータベース

* **aviutl2\_catalog\_update.json**
  AviUtl2 カタログのアップデート有無を確認するためのデータベース

- **[パッケージ.md](./パッケージ.md)**
  `index.json` に登録されたパッケージの一覧

- **register-package.md**
  新しいパッケージを登録する際の手順

## パッケージの登録方法
本ソフトをダウンロードして、 [register-package.md](./register-package.md) に従って Pull Request を送信してください。
