/**
 * Path normalization + parsing shared by the scanner, the matcher and the
 * trash restorer. Sources live on exFAT/NTFS (case-insensitive filesystems),
 * so matching keys lowercase everything; display paths keep original case.
 */

/** NFC + lowercase — canonical matching form of a path segment or full rel path. */
export function normSeg(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

export interface PathParts {
  /** Relative directory, "" at the source root. */
  dir: string;
  /** Final path segment. */
  name: string;
  /** First directory segment, "" for loose top-level files. */
  top: string;
}

export function pathParts(rel: string): PathParts {
  const cut = rel.lastIndexOf("/");
  const dir = cut === -1 ? "" : rel.slice(0, cut);
  const name = cut === -1 ? rel : rel.slice(cut + 1);
  const top = dir === "" ? "" : dir.split("/")[0];
  return { dir, name, top };
}

/** True when the (already normalized) relative path stays inside a source root. */
export function isSafeRelPath(rel: string): boolean {
  if (rel === "" || rel.startsWith("/") || rel.includes("\0")) return false;
  return rel.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
