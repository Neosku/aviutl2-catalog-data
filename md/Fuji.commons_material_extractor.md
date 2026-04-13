# ニコニ・コモンズ作品ID一覧出力プラグイン

AviUtl2のプロジェクト内で使用されている親作品登録可能な作品ID（nc/im/sm で始まるID）を自動取得し、テキストファイルに出力する汎用プラグイン（.aux2）です。

詳しい説明は解説動画を作成しているのでそちらをご参照ください → https://www.nicovideo.jp/watch/sm46156601

## 主な機能

- アクティブシーン内の動画・画像・音声・PSDファイルオブジェクトから作品IDを自動取得
- 重複を除去し、昇順ソートして一覧化
- クリップボードへのコピー、テキストファイルへの保存に対応
- 日本語・英語の対応

## 動作環境

- Windows 10/11 (64bit)
- AviUtl2

## インストール（Aviutl2カタログからの場合）

インストールボタンを押すと登録完了です

## インストール（自分で入れる場合）

1. [Google drive](https://drive.google.com/drive/folders/17BQSHUlCVBaRFADDYpjd_eH8UJ_FZ69x?usp=sharing) から最新の `commons_material_extractor.aux2` をダウンロード
2. ダウンロードしたファイルを `aviutl2\Plugin\` に配置
3. AviUtl2 を再起動

正しくインストールされていれば「表示」>「親作品登録可能な作品IDを取得」が表示されます。

## 使い方

1. AviUtl2 で作品IDを含むプロジェクトを開く
2. メニューバーから「設定」→「親作品登録可能な作品IDを取得」を選択し、プラグインのウィンドウを開く
3. 「取得」ボタンをクリックすると、作品ID一覧がテキストボックスに表示される
4. 「コピー」でクリップボードにコピー、「ファイルに保存」でテキストファイルに出力

### 出力例

```text
im300
nc100
nc200
sm500
```

## 対象エフェクト

以下のエフェクトからファイルパスを取得し、作品IDを抽出します:

| エフェクト名 | プロパティキー |
| --- | --- |
| 動画ファイル / VideoFile | ファイル / File |
| 画像ファイル / ImageFile | ファイル / File |
| 音声ファイル / AudioFile | ファイル / File |
| PSDファイル@PSDToolKit / PSDFile@PSDToolKit | PSDファイル / PSDFile |

## ライセンス

MIT License
