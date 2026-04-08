import { useQuery } from '@tanstack/react-query'

import type { GraphEdge, GraphNode } from '../../shared/types'
import { queryKeys } from '../lib/queryKeys'
import { changbu } from '../lib/changbu'

interface GraphDataPayload {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface PreparedGraphData extends GraphDataPayload {
  forceGraphData: {
    nodes: GraphNode[]
    links: GraphEdge[]
  }
}

function getForceGraphProjection(data: GraphDataPayload): PreparedGraphData['forceGraphData'] {
  return {
    nodes: data.nodes.map((node) => ({ ...node })),
    links: data.edges.map((edge) => ({ ...edge })),
  }
}

export function useGraphData(activeTagFilters: string[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.graph(activeTagFilters),
    queryFn: () => changbu.graph.getData(activeTagFilters),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    select: (data): PreparedGraphData => ({
      ...data,
      forceGraphData: getForceGraphProjection(data),
    }),
    enabled,
  })
}
