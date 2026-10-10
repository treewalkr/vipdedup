import { z } from "zod";

export * from "./paths";

/* ————————————————————————————————————————————
   vipdedup domain schemas — single source of
   truth for API responses and web DTOs.
   ———————————————————————————————————————————— */

export const SourceDto = z.object({
  id: z.number().int(),
  label: z.string(),
  path: z.string(),
  createdAt: z.string(),
});
export type SourceDto = z.infer<typeof SourceDto>;

export const ScanStatus = z.enum(["running", "ok", "error", "timeout"]);
export type ScanStatus = z.infer<typeof ScanStatus>;

export const ScanRunDto = z.object({
  id: z.number().int(),
  sourceId: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: ScanStatus,
  phase: z.enum(["scan", "hash", "done"]).nullable(),
  error: z.string().nullable(),
  fileCount: z.number().int().nullable(),
  hashedCount: z.number().int().nullable(),
  bytes: z.number().nullable(),
});
export type ScanRunDto = z.infer<typeof ScanRunDto>;

export const SourceStatusDto = z.object({
  source: SourceDto,
  online: z.boolean(),
  fileCount: z.number().int(),
  bytes: z.number(),
  lastScan: ScanRunDto.nullable(),
  scanning: z.boolean(),
});
export type SourceStatusDto = z.infer<typeof SourceStatusDto>;

export const OverlapMatrixCellDto = z.object({
  aId: z.number().int(),
  bId: z.number().int(),
  sharedFolders: z.number().int(),
  sharedFiles: z.number().int(),
  sharedBytes: z.number(),
});
export type OverlapMatrixCellDto = z.infer<typeof OverlapMatrixCellDto>;

export const OverlapSummaryDto = z.object({
  folderGroups: z.number().int(),
  fileGroups: z.number().int(),
  confirmedGroups: z.number().int(),
  differingGroups: z.number().int(),
  reclaimableBytes: z.number(),
  matrix: z.array(OverlapMatrixCellDto),
});
export type OverlapSummaryDto = z.infer<typeof OverlapSummaryDto>;

export const OverviewDto = z.object({
  sources: z.array(SourceStatusDto),
  overlap: OverlapSummaryDto,
});
export type OverviewDto = z.infer<typeof OverviewDto>;

/* —— duplicate groups ———————————————————— */

export const GroupStatus = z.enum([
  "identical", // every copy hashed & byte-equal
  "partial", // some copies verified equal, some unverified
  "differ", // hashed copies disagree on content
  "unverified", // hashes not computed (e.g. source offline)
]);
export type GroupStatus = z.infer<typeof GroupStatus>;

export const GroupSourceRowDto = z.object({
  sourceId: z.number().int(),
  label: z.string(),
  fileCount: z.number().int(),
  bytes: z.number(),
  /** Files in this source that also exist (path+size match) in another source of the group. */
  matchedCount: z.number().int(),
  matchedBytes: z.number(),
  hashedCount: z.number().int(),
  /** Example relative path (file groups: the shared path; folder groups: first file). */
  exampleRelPath: z.string().nullable(),
  mtime: z.string().nullable(),
});
export type GroupSourceRowDto = z.infer<typeof GroupSourceRowDto>;

export const FolderGroupDto = z.object({
  key: z.string(), // "folder:<topNorm>"
  kind: z.literal("folder"),
  name: z.string(),
  sources: z.array(GroupSourceRowDto),
  fileCount: z.number().int(),
  dupFileCount: z.number().int(),
  dupBytes: z.number(),
  status: GroupStatus,
});
export type FolderGroupDto = z.infer<typeof FolderGroupDto>;

export const FileGroupDto = z.object({
  key: z.string(), // "path:<relNorm>" or "hash:<hex>"
  kind: z.literal("file"),
  matchBasis: z.enum(["path", "hash"]),
  name: z.string(),
  relPath: z.string().nullable(),
  size: z.number(),
  hash: z.string().nullable(),
  sources: z.array(GroupSourceRowDto),
  dupBytes: z.number(),
  status: GroupStatus,
});
export type FileGroupDto = z.infer<typeof FileGroupDto>;

export type AnyGroupDto = FolderGroupDto | FileGroupDto;

export const FileEntryDto = z.object({
  id: z.number().int(),
  relPath: z.string(),
  name: z.string(),
  size: z.number(),
  mtime: z.string(),
  hash: z.string().nullable(),
  /** Copies of this file (path+size match) in other sources. */
  dupCopies: z.number().int(),
  dupInLabels: z.array(z.string()),
});
export type FileEntryDto = z.infer<typeof FileEntryDto>;

export const FolderEntryDto = z.object({
  name: z.string(),
  /** Folder path relative to the source root (for navigation). */
  relPath: z.string(),
  fileCount: z.number().int(),
  bytes: z.number(),
  /** Other sources whose matching folder also holds files. */
  dupInLabels: z.array(z.string()),
});
export type FolderEntryDto = z.infer<typeof FolderEntryDto>;

export const TrashItemDto = z.object({
  id: z.number().int(),
  sourceId: z.number().int(),
  sourceLabel: z.string(),
  originalRelPath: z.string(),
  size: z.number(),
  trashedAt: z.string(),
});
export type TrashItemDto = z.infer<typeof TrashItemDto>;

/* —— request bodies ————————————————————— */

export const GroupTrashRequest = z.object({
  key: z.string().min(1),
  keepSourceId: z.number().int(),
});
export type GroupTrashRequest = z.infer<typeof GroupTrashRequest>;

export const AddSourceRequest = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
});
export type AddSourceRequest = z.infer<typeof AddSourceRequest>;

export const RevealRequest = z.object({
  sourceId: z.number().int(),
  relPath: z.string().min(1),
});
export type RevealRequest = z.infer<typeof RevealRequest>;
