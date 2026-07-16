MIDIファイルの情報を AviUtl2 (ExEdit2) 上に表示するオブジェクト集です。
テキスト・グラフ・ピアノ鍵盤・ピアノロール（2D / GPU / 3D）などを同梱しています。

v0.0.1を入れている方へ
プラグイン本体がauf2からaux2に変わったので必ず古いファイルを削除してから再インストールをお願いします。

含まれるオブジェクト（MIDI Info カテゴリ）
- MIDI Source：MIDIの読み込みと共有元。チャンネル色・同期の起点
- MIDI Text：ノーツ数 / 時刻 / BPM / 拍子 / 小節 / NPS などをテンプレート表示
- MIDI Graph：NPS / Polyphony / BPM / Notes / Density のグラフ
- MIDI Text Scroll：Marker / Lyric / Text の時間軸スクロール
- MIDI Keyboard：押下中の鍵を点灯するピアノ鍵盤
- MIDI Piano Roll / GPU / 3D：ノートを時間軸でスクロール表示

特長
- 複数オブジェクトでMIDIを共有＋タイムライン同期
- チャンネル別の表示色、時間軸 Time / Beat 対応
- Black MIDI 向けの軽量化、バックグラウンド読み込み、透明背景描画

動作環境・導入
- AviUtl2 (ExEdit2) / Windows
- MidiInfoObject.aux2 を C:\ProgramData\aviutl2\Plugin に入れて再起動
- AviUtl2 Catalog からも導入・更新できます: https://github.com/Neosku/aviutl2-catalog

ドキュメント（日本語 / English）
https://avu2-midi-info-docs.c30.life/

拡張したい方へ（開発者向け）
読み込んだMIDI解析を外部プラグインから安定したC APIで取得できます。
ヘッダ1ファイル（MIT）を取り込むだけで利用可能です。
公開ヘッダ・サンプル: https://github.com/Zel9278/midi-info-api

現在は Beta 版です。

Preview 1: https://youtu.be/jbMNOAlzwFQ
Preview 2: https://youtu.be/-5YxROVGu00
