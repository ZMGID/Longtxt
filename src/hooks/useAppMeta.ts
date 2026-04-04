import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

export function useAppMeta() {
  return useQuery({
    queryKey: queryKeys.meta(),
    queryFn: () => changbu.settings.getMeta(),
  })
}
