/** Keep in sync with src/main/services/files/path-safety.ts `toMediaUrl`. */
export function toMediaUrl(filePath: string): string {
  return `media://local/?path=${encodeURIComponent(filePath)}`
}
