# 動画OUT

動画OUT は、AviUtl2 用の動画/音声出力プラグインです。

FFmpeg DLL を利用して、AviUtl2 の編集結果を MP4 / H.264 / AAC として書き出します。

## 概要

AviUtl2 から MP4 / H.264 / AAC で書き出すための出力プラグインです。

## 主な機能

- AviUtl2 のタイムラインを MP4 へ出力
- H.264 エンコード
- Intel QSV による GPU エンコード
- libx264 による CPU エンコード
- AAC 音声エンコード
- 簡易設定ダイアログ
- INI による前回設定の保存

## 標準設定

初期状態では、投稿サイトや一般的な共有用途を広くカバーするため、以下の設定になっています。

- コンテナ: MP4
- 映像: H.264 Intel QSV
- 画質: Standard
- 音声: AAC 192 kbps

必要に応じて、設定ダイアログから画質や音声 bitrate を変更できます。

## 出力設定

AviUtl2 の出力保存ダイアログ右下にある `設定` ボタンから、`VW Media Output Settings` を開きます。

設定項目:

- Encoder
  - `GPU / H.264 Intel QSV`
  - `CPU / H.264 libx264`
- Video quality
  - `High quality`
  - `Standard`
  - `Fast`
- Audio
  - `AAC 576 kbps`
  - `AAC 384 kbps`
  - `AAC 256 kbps`
  - `AAC 192 kbps`
  - `AAC 128 kbps`
  - `None`

通常出力は `Standard`、試し出力は `Fast`、画質を優先したい場合は `High quality` を選びます。

## 設定保存

設定はプラグインと同じフォルダの INI に保存されます。

```text
C:\ProgramData\aviutl2\Plugin\VW_Media_Output\VW_Media_Output.ini
```

保存例:

```ini
[Settings]
Version=1
Encoder=IntelQsv
VideoQuality=Standard
AudioMode=Aac192
```

INI の読み込みでは、不明な値や古い値があってもエラーにせず、既定値へ戻します。

## パフォーマンスログ

デバッグ・検証用にパフォーマンスログを出力できます。

通常は無効です。

切り替えは以下の定数で行います。

```pascal
OUTPUT_PERF_LOG_ENABLED = False
```

ログは出力ファイルと同じ場所に作成されます。

```text
output.mp4.perf.log
```

主な計測項目:

- `get_video`
- `video_convert`
- `video_encode_write`
- `get_audio`
- `audio_convert`
- `audio_encode_write`

## インストール

以下のフォルダに配置します。

```text
C:\ProgramData\aviutl2\Plugin\VW_Media_Output
```

必要なファイル:

- `VW_Media_Output.auo2`
- `avutil-60.dll`
- `avcodec-62.dll`
- `avformat-62.dll`
- `avdevice-62.dll`
- `avfilter-11.dll`
- `swscale-9.dll`
- `swresample-6.dll`

## リリース zip

配置済みプラグインフォルダからリリース zip を作成します。

```bat
Setup\make_release_zip.bat
```

作成されるファイル:

```text
Setup\VW_Media_Output.zip
```

zip には `VW_Media_Output` フォルダごと含まれます。

展開先:

```text
C:\ProgramData\aviutl2\Plugin
```

## ビルド

必要環境:

- Embarcadero Delphi 37.0
- Win64 target

ビルドコマンド:

```powershell
cmd.exe /s /c '"C:\Program Files (x86)\Embarcadero\Studio\37.0\bin\rsvars.bat" && MSBuild.exe VW_Media_Output.dproj /t:Build /p:Config=Debug /p:Platform=Win64'
```

ビルド後、post-build により以下へ `VW_Media_Output.auo2` と FFmpeg DLL がコピーされます。

```text
C:\ProgramData\aviutl2\Plugin\VW_Media_Output
```

## 構成

- `VW_Media_Output.dpr`
  - AviUtl2 へ公開する出力プラグイン入口と設定保持。
- `AviUtl\Output\AviUtl2OutputTypes.pas`
  - AviUtl2 出力プラグイン API 定義。
- `Plugin_Output\FFmpegApi.pas`
  - FFmpeg DLL ロードと基本 API 定義。
- `Plugin_Output\FFmpegOutputEncoder.pas`
  - 映像/音声取得、変換、エンコード、mux の中心処理。
- `Plugin_Output\FFmpegOutputApiTypes.pas`
  - 出力処理で使う FFmpeg 公開 record / 関数型。
- `Plugin_Output\FFmpegOutputConfig.pas`
  - encoder / quality / audio 設定定義。
- `Plugin_Output\FFmpegOutputSettingsDialog.pas`
  - 出力設定ダイアログ。
- `Plugin_Output\FFmpegOutputSettingsStorage.pas`
  - INI 読み書き。
- `Plugin_Output\FFmpegOutputVideoInput.pas`
  - AviUtl2 から取得する映像形式と stride 処理。
- `Plugin_Output\FFmpegOutputPerfLog.pas`
  - パフォーマンスログ。

## ライセンス

このプロジェクトは GNU General Public License v3.0 で公開しています。

詳細は [LICENSE](LICENSE) を参照してください。
