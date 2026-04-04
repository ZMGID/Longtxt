import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

export function useGraphData(activeTagFilters: string[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.graph(activeTagFilters),
    queryFn: () => changbu.graph.getData(activeTagFilters),
    enabled,
  })
}
