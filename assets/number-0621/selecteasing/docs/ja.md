# AviUtl プラグイン - イージング簡単選択 (AviUtl2 / x64 移植版)

イージング番号を画像から選択できるようにします。   
本リポジトリは、蛇色 (へびいろ) 氏によるオリジナル版を AviUtl2 (x64) 環境向けに移植したフォーク版です。  

## 注意

このプラグインは**イージングのスクリプトと併用して利用する前提**です。  
あくまでイージングをする際に便利なツールというだけなので、このプラグインを入れただけで**イージングが使えるようになるわけではない**です。  
ご自身で別途イージング用のスクリプトを導入してください。  
イージング用のスクリプトはいくつかありますが、私が愛用しているのは「easing_tra_2020」です。  
<https://www.nicovideo.jp/watch/sm37721332>  
↑動画の概要欄にあるURLから入手してください。  

## 導入方法

以下のファイルとフォルダを AviUtl2 の `Plugins` フォルダに入れてください。  

* `SelectEasing.aux2` (プラグイン本体)
* `SelectEasing` (アセットフォルダ)
  * `SelectEasing.exe` (UI プロセス)
  * `SelectEasing.xml` (設定ファイル)
  * `easing.png`
  * `easing2.png`
  * `easing3.png`

> [重要]  
> AviUtl2 (64bit) 専用です。従来の AviUtl 1.10 (32bit) では動作しません。  
> プラグイン本体 (`.aux2`) と同じ場所に `SelectEasing` フォルダを配置し、その中に `SelectEasing.exe` を置いてください。  

## 使用方法

1. AviUtl2 のオブジェクト設定ダイアログなどで、移動方法（イージング番号）の選択ダイアログを表示させます（歯車マークをクリックするなど）。  
2. その横にイージング選択ウィンドウが表示されるので、画像の中から希望の番号をクリックすると数値が反映されます。  

## 設定方法

SelectEasing フォルダ内の SelectEasing.xml をテキストエディタで編集します。AviUtl 起動中でも変更が反映されます。

* ```<easing>```
  * ```imageVersion``` 画像のバージョンを指定します。```1``` ```2``` は easing 用、```3``` は ease 用です。
  * ```clamp``` YES の場合は画像がモニターからはみ出ないように表示位置を調整します。
  * ```horz``` left の場合はダイアログの左側に画像を表示します。right の場合は右側に表示します。それ以外の場合は中央に表示します。
  * ```vert``` top の場合はダイアログの上側に画像を表示します。bottom の場合は下側に表示します。それ以外の場合は中央に表示します。
  * ```alpha``` 画像のアルファ値を指定します。
  * ```scale``` 画像の表示倍率を指定します。
  * ```<selected>``` 選択状態の色を指定します。
  * ```<hot>``` ホット状態の色を指定します。
* ```<ease>```
  * ```enable``` YES を指定すると数値が負数になります。例えばイージング番号 41 を選択すると数値は -41 になります。さらにベジェ曲線を編集するウィンドウが表示されます。
  * ```origin``` ウィンドウを表示する基準を指定します。number を指定すると数値入力ダイアログが基準になります。easing を指定するとイージング画像ウィンドウが基準になります。
  * ```clamp``` YES の場合は画像がモニターからはみ出ないように表示位置を調整します。
  * ```horz``` left の場合は origin の左側に画像を表示します。right の場合は右側に表示します。それ以外の場合は中央に表示します。
  * ```vert``` top の場合は origin の上側に画像を表示します。bottom の場合は下側に表示します。それ以外の場合は中央に表示します。
  * ```alpha``` ウィンドウのアルファ値を指定します。
  * ```margin``` 外枠までのマージンを指定します。
  * ```hitDistance``` 追加の当たり判定範囲を指定します。描画を小さくすると当たり判定も小さくなるので、その場合はこの値を大きくします。
  * ```segmentCount``` ベジェ曲線の有効性をチェックするための分割数を指定します。大きくするとチェックが厳密になりますが、その分重くなります。
  * ```hideCursor``` YES を指定するとドラッグ時にマウスカーソルを非表示にします。
  * ```immediately``` YES を指定するとベジェ曲線編集時、フレーム画像を即時更新します。(その代わりベジェ曲線の描画にラグが発生するようになります)
  * ```<window>``` ウィンドウのクライアント領域のサイズを指定します。
  * ```<background>``` 背景色を指定します。
  * ```<border>``` 外枠の色と太さを指定します。
  * ```<curve>``` ベジェ曲線の色と太さを指定します。
  * ```<invalidCurve>``` ベジェ曲線が無効になったときの色と太さを指定します。
  * ```<handle>``` ベジェハンドルの色と太さを指定します。
  * ```<point>``` 制御点の色と半径を指定します。
  * ```<hotPoint>``` ホット状態の制御点の色を指定します。

## 更新履歴

* 1.0.0 - 2026/04/01 初版

## 動作確認

* AviUtl ExEdit2 beta39 <https://spring-fragrance.mints.ne.jp/aviutl/>

## ライセンス

このリポジトリは、[AviUtl-Plugin-SelectEasing](https://github.com/hebiiro/AviUtl-Plugin-SelectEasing) をベースにしています。  
元のコード部分には **MIT License** が適用されます（詳細は[`LICENSE.orig`](LICENSE.orig)を参照してください）。

ただし、私（No.0）が追加・変更した部分については **MIT No Attribution (MIT-0)** を適用します。  
したがって、私の著作権を表示する義務はありませんが、責任は負いかねます（詳細は[`LICENSE`](LICENSE)を参照してください）。

## クレジット

* **オリジナル版作成者**: 蛇色 (へびいろ) 氏
  * [GitHub](https://github.com/hebiiro) / [X](https://x.com/io_hebiiro)
* **移植**: No.0
  * [GitHub](https://github.com/NumberZero-0621) / [X](https://x.com/NumberZero_0621)
* **使用ライブラリ等**:
  * [AviUtlPluginSDK](https://github.com/ePi5131/aviutl_exedit_sdk)
  * [AviUtl2 SDK](https://github.com/m-t-p/aviutl2_sdk_mirror)
  * [Common Library](https://github.com/hebiiro/Common-Library)
  * [Microsoft Research Detours Package](https://github.com/microsoft/Detours)

## 免責事項

この作成物および同梱物を使用したことによって生じたすべての障害・損害・不具合等に関しては、作成者およびその関係者は一切の責任を負いません。各自の責任においてご使用ください。
