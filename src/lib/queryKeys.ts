export const queryKeys = {
  blocks: () => ['blocks'] as const,
  tags: () => ['tags'] as const,
  notebooks: () => ['notebooks'] as const,
  notebookRoot: () => ['notebook'] as const,
  notebook: (notebookId: string) => ['notebook', notebookId] as const,
  graphRoot: () => ['graph'] as const,
  graph: (activeTagFilters: string[]) => ['graph', activeTagFilters] as const,
  snapshotsRoot: () => ['snapshots'] as const,
  snapshots: (snapshotQuery: string, notebookIdOrNull: string | null = null) => ['snapshots', snapshotQuery, notebookIdOrNull] as const,
  meta: () => ['meta'] as const,
}
