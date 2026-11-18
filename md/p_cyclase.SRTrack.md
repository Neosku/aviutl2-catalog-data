# SRTrack

AviUtl2で編集した動画に対応するSRT字幕出力を支援するプラグインです。
テキスト系のオブジェクトからSRT字幕を出力できるほか、動画ファイルとSRTファイルをセットでタイムラインに配置するための機能があります。
出力済の動画を別プロジェクトで結合・切り抜きした後にも、編集結果に対応する字幕を再出力できます。

## 主な機能

- タイムライン上のテキスト情報を集めてSRT字幕を出力するExporter
- 動画と同名のSRTをまとめて配置するImporter（オンオフ可能）
- 動画オブジェクトと連携する `SRTrack Object`
- 編集画面専用の字幕Preview（オンオフ可能）

## 動作確認環境・前提プラグイン

- Windows x64
- AviUtl2 / ExEdit2 2.1.13
- GCMZDrops2
- L-SMASH Works

## 注意

試験段階の初期公開版です。製作者自身の動画投稿上の必要に基づき、Codexによるバイブコーディングを用いて制作されています。
導入前に、AviUtl2のデータフォルダと大切なプロジェクトファイルをバックアップすることを強く推奨します。

不具合報告・改善案はGitHub Issuesで受け付けています。

- [GitHubリポジトリ](https://github.com/p-cyclase/SRTrack)
- [v0.1.0 ダウンロード](https://github.com/p-cyclase/SRTrack/releases/tag/v0.1.0)