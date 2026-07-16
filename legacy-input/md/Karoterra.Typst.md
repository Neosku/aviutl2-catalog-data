# Typst for AviUtl2

[AviUtl2][aviutl-url] で [Typst][typst-url] を使えるようにするプラグイン


## 動作環境

AviUtl2 ExEdit2 version 2.0beta43b にて動作確認しました。


## 使い方

プラグインをインストールすると以下のメディアオブジェクトが追加されます。

| 名前          | 初期ラベル |
|---------------|------------|
| Typstテキスト | Typst      |
| Typstファイル | Typst      |

Typst コードにコンパイルエラーがある場合はログに出力されます。
ログ画面は **表示** → **ログ表示** から表示できます。


### Typstテキスト

AviUtl2 上で書いた Typst コードを描画します。

- **幅**  
  ページの幅を指定する。
- **高さ**  
  ページの高さを指定する。
- **単位**  
  幅と高さの単位を指定する。
- **スケール**  
  ページのスケールを指定する。
  単位が「px」のときはオブジェクトのサイズは固定でページ内のテキストなどのサイズが変化する。
  単位が「px」以外のときはオブジェクトのサイズごと変化する。
- **テキスト**  
  描画したい Typst コードを入力する。
  ファイルを参照（`.typ` ファイルのインポート/インクルード、 `image` で画像を読み込むなど）する場合はプロジェクトファイル `.aup2` からの相対パスを指定する。
  プロジェクトファイルが保存されていない場合はコンパイルエラーになる。

### Typstファイル

Typst のソースコードファイル `.typ` を描画します。

`.typ` ファイルをタイムラインにドラッグアンドドロップすることでも追加できます。

- **スケール**  
  ページのスケールを指定する。
  数値を大きくするとオブジェクトのサイズが大きくなる。
- **ページ**  
  描画したいページ番号を指定する。
  全体のページ数より大きな値を指定したときは最後のページが描画される。
- **ファイル**  
  `.typ` ファイルを指定する。

ファイルを参照（`.typ` ファイルのインポート/インクルード、 `image` で画像を読み込むなど）する場合はメディアオブジェクに設定した `.typ` ファイルからの相対パスを指定してください。


<!-- links -->

[releases-url]: https://github.com/karoterra/aviutl2-typst/releases
[releases-badge]: https://img.shields.io/github/v/release/karoterra/aviutl2-typst
[catalog-url]: https://aviutl2-catalog-badge.sevenc7c.workers.dev/package/Karoterra.Typst
[catalog-badge]: https://aviutl2-catalog-badge.sevenc7c.workers.dev/badge/v/Karoterra.Typst
[aviutl-url]: https://spring-fragrance.mints.ne.jp/aviutl/
[typst-url]: https://typst.app/
[aviutl2-catalog-url]: https://github.com/Neosku/aviutl2-catalog
