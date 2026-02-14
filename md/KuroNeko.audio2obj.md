- ## audio2obj.lua
  ### 概要
  Altキーを押下しながらドロップした音声ファイルのファイル名からセリフ準備@PSDToolKitオブジェクトと音声オブジェクトのobjectファイルを生成する。  
  filesから音声ファイルを除きobjectファイルを追加した状態になる
  ### 設定
  - use_alt_key: Altキー押下時のみ有効化するかどうか（デフォルト:true）
  - set_character_id: 
    - switch:セリフ準備@PSDToolKitオブジェクトのキャラクターIDをファイル名から設定するかどうか（デフォルト:false）
    - splitstr: キャラクターIDとセリフテキストを分割する文字列（デフォルト:"_"）