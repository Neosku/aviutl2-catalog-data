- ## TTSFileRename.lua
  ### 概要
  ドロップしたテキストファイルと同じ名前の音声ファイルを探し、[PSDToolKitが受けいられる形](https://github.com/oov/aviutl2_psdtoolkit2/blob/main/src/lua/PSDToolKitHandler.lua/util.lua#L47)にテキストファイルと音声ファイルを同じ名前にリネームする。  
  例えば、01-セリフ.txtと01-セリフ.wavがあった場合、01-セリフ.txtを01_セリフ.txtにリネームし、01-セリフ.wavを01_セリフ.wavにリネームする。