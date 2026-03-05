## 注意
[標準機能](https://github.com/oov/aviutl2_psdtoolkit2/tree/e06318c9cb50c8f89f5aec3d4adb2215a096e87a?tab=readme-ov-file#%E9%9F%B3%E5%A3%B0%E3%81%A8%E5%AD%97%E5%B9%95%E9%96%A2%E9%80%A3)で対応可能のため独自機能が必要でない場合はインストールしなくても大丈夫です。
- ## audio2obj.lua
  ### 概要
  Altキーを押下しながらドロップした音声ファイルのファイル名からセリフ準備@PSDToolKitオブジェクトと音声オブジェクトのobjectファイルを生成する。  
  filesから音声ファイルを除きobjectファイルを追加した状態になる
  ### 設定
  - use_alt_key: Altキー押下時のみ有効化するかどうか（デフォルト:true）
  - set_character_id: 
    - switch:セリフ準備@PSDToolKitオブジェクトのキャラクターIDをファイル名から設定するかどうか（デフォルト:false）
    - splitstr: キャラクターIDとセリフテキストを分割する文字列（デフォルト:"_"）