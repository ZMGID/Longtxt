import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

export function useTags() {
  const query = useQuery({
    queryKey: queryKeys.tags(),
    queryFn: () => changbu.tags.list(),
  })

  return {
    tags: query.data ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? '加载标签失败。' : null,
    refresh: query.refetch,
  }
}
