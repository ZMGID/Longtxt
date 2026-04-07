import { useQuery } from '@tanstack/react-query'

import { listBlocksByDateCompat } from '../lib/blockCleanupCompat'
import { queryKeys } from '../lib/queryKeys'

export function useBlocksByDate(date: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.blocksByDate(date ?? ''),
    enabled: enabled && Boolean(date),
    queryFn: () => listBlocksByDateCompat(date ?? ''),
  })
}
