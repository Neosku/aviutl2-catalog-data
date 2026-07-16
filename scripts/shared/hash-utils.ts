// ハッシュ計算のユーティリティ関数群
import { createHash } from "node:crypto";

export function sha256Hex(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}
