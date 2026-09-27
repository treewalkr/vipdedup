/**
 * Scanner ignore rules — OS junk and FUSE temp files that must never show up
 * as (phantom) duplicates. Applied to every entry name at every depth.
 */
const IGNORED_NAMES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".vipdedup-trash",
  "System Volume Information",
  "RECYCLER",
  "$RECYCLE.BIN",
  "lost+found",
]);

export function isIgnoredName(name: string): boolean {
  if (IGNORED_NAMES.has(name)) return true;
  // macOS AppleDouble sidecars (._clip.mp4)
  if (name.startsWith("._")) return true;
  // s3fs/other FUSE "being deleted" placeholders seen on these drives
  // (they appear with and without a leading dot)
  if (/^\.?fuse_hidden/.test(name)) return true;
  if (/^\.?nfs/.test(name)) return true;
  return false;
}
