AviUtl2 Source Monitor (Plugin)
==================================
作：映像学区 https://eizo-gak.com

概要
----
AviUtl2用のソースモニタープラグインです。
動画・音声ファイルのプレビュー、In/Out点指定、タイムラインへの投げ込みができます。

インストール
----
> [!NOTE]
> AviUtl2 カタログでは [ブートストラッパー版](https://github.com/sevenc-nanashi/aviutl2-sourcemonitor-bootstrapper.aux2) をインストールします。

[Releases](https://github.com/sevenc-nanashi/aviutl2-sourcemonitor-bootstrapper.aux2/releases/latest)から`sevenc-nanashi.aviutl2-sourcemonitor-bootstrapper-aux2-v{{version}}.au2pkg.zip`をダウンロードし、AviUtl2のプレビューにドラッグ&ドロップしてください。

免責事項
----
本プラグインの利用によって発生した一切の損害について、作者は責任を負いません。
個人利用していたプラグインを公開したものであり、一切のサポートを保証いたしません。


利用方法
----
AviUtl2画面左上のメニューバーから「表示」＞「Source Monitor」をクリックで起動。


機能
----
- 動画・音声ファイルのドラッグ&ドロップでプレビューできます。
- In / Out 点を指定し、
  [Send to Timeline]ボタンをクリックするとタイムラインへクリップを投げ込みます。
- 指定したクリップを .avmeta形式のメタファイルとして保存できます

※高画質・高負荷な動画素材では等速再生をサポートしません。音ズレが発生します。
※AviUtl2本体にて非対応のフォーマットは投げ込みができません。
（ソフトウェアが強制終了する場合があります）


License
----
本プラグインは FFmpeg( https://www.ffmpeg.org/ ) LGPL版 を使用します。
同梱のFFmpeg のライセンスは sm_LICENSE_FFmpeg.txt を参照してください。

FFmpeg のソースコードは以下から入手できます：
https://github.com/FFmpeg/FFmpeg
