import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

export function useSnapshots(snapshotQuery: string, notebookId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.snapshots(snapshotQuery, notebookId),
    queryFn: () => changbu.snapshots.list(snapshotQuery, notebookId),
    enabled,
  })
}
