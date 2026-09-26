/** The N source locations this tool watches. Seeded into the DB on first boot. */
export const SOURCES: { label: string; path: string }[] = [
  { label: "My Passport", path: "/Users/ralim1/.mounty/My Passport/vip" },
  { label: "One Touch", path: "/Volumes/One Touch/nsfw/vip" },
  { label: "Seagate", path: "/Users/ralim1/.mounty/Seagate Backup Plus Drive/vip" },
];

/** Watchdog for a scan subprocess (metadata walk + hash pass), in ms. */
export const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS ?? 20 * 60_000);

/** Staged-trash folder name, created inside each source root. */
export const TRASH_DIR = ".vipdedup-trash";
