import type {
  AnyGroupDto,
  FileEntryDto,
  FolderEntryDto,
  OverviewDto,
  SourceStatusDto,
  TrashItemDto,
} from '@vd/shared';
import { client } from './treaty';

/** Eden result → thrown Error, preserving the API's `error` message envelope. */
async function unwrap<T>(
  p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null }>
): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const value = error.value as { error?: string } | string | null;
    const message = typeof value === 'string' ? value : value?.error;
    const code = typeof error.status === 'number' ? error.status : 'unknown';
    throw new Error(message ?? `request failed: ${code}`);
  }
  return data as T;
}

export interface GroupFilters {
  type?: 'folder' | 'file';
  sources?: number[];
  status?: string;
  minBytes?: number;
}

export interface BrowseResult {
  dir: string;
  folders: FolderEntryDto[];
  files: FileEntryDto[];
}

export const api = {
  overview: () => unwrap<OverviewDto>(client.v1.overview.get()),

  scan: (id: number) =>
    unwrap<{ started: boolean; sourceId: number }>(client.v1.sources({ id }).scan.post()),

  scanAll: () =>
    unwrap<{ started: number[]; skipped: number[] }>(client.v1['scan-all'].post()),

  groups: (filters: GroupFilters = {}) => {
    const query: Record<string, string> = {};
    if (filters.type) query.type = filters.type;
    if (filters.sources && filters.sources.length > 0)
      query.sources = filters.sources.join(',');
    if (filters.status) query.status = filters.status;
    if (filters.minBytes && filters.minBytes > 0) query.minBytes = String(filters.minBytes);
    return unwrap<{ groups: AnyGroupDto[] }>(client.v1.groups.get({ query }));
  },

  trashGroup: (key: string, keepSourceId: number) =>
    unwrap<{ trashed: number; bytes: number; failures: { relPath: string; error: string }[] }>(
      client.v1.groups.trash.post({ key, keepSourceId })
    ),

  browse: (id: number, dir = '') =>
    unwrap<BrowseResult>(client.v1.sources({ id }).files.get({ query: dir ? { dir } : {} })),

  trash: async () => (await unwrap<{ items: TrashItemDto[] }>(client.v1.trash.get())).items,

  restore: (id: number) =>
    unwrap<{ restored: boolean; relPath: string }>(client.v1.trash({ id }).restore.post()),

  purge: (id: number) => unwrap<{ purged: boolean }>(client.v1.trash({ id }).purge.post()),

  purgeAll: () =>
    unwrap<{ purged: number; failures: { id: number; error: string }[] }>(
      client.v1.trash['purge-all'].post()
    ),

  reveal: (sourceId: number, relPath: string) =>
    unwrap<{ ok: boolean }>(client.v1.reveal.post({ sourceId, relPath })),
};

export type { SourceStatusDto };
