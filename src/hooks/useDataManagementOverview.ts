import { useQuery } from '@tanstack/react-query'

import type { DataManagementOverview } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

export type DataManagementOverviewResult = DataManagementOverview & {
  compatibilityMode?: 'missing-handler'
}

function isMissingOverviewHandlerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(`No handler registered for 'data:get-overview'`)
}

export function useDataManagementOverview() {
  return useQuery({
    queryKey: queryKeys.dataManagement(),
    queryFn: async (): Promise<DataManagementOverviewResult> => {
      try {
        return await changbu.data.getOverview()
      } catch (error) {
        if (!isMissingOverviewHandlerError(error)) {
          throw error
        }

        const meta = await changbu.settings.getMeta()

        return {
          compatibilityMode: 'missing-handler',
          dataDirectory: meta.dataDirectory,
          databasePath: '需要重启应用后读取',
          settingsDirectory: '需要重启应用后读取',
          settingsFilePath: '需要重启应用后读取',
          totalBlockCount: meta.totalBlockCount,
          totalNotebookCount: -1,
          totalSnapshotCount: -1,
          totalAttachmentCount: -1,
          totalVectorCount: -1,
          vectorReady: meta.vectorReady,
          aiConfigured: meta.aiConfigured,
          activeAiMode: meta.activeAiMode,
          vectorDimension: meta.vectorDimension,
          vectorSchemaReady: meta.vectorSchemaReady,
          failedVectorCount: meta.failedVectorCount,
          pendingVectorCount: meta.pendingVectorCount,
          vectorQueueProcessing: meta.vectorQueueProcessing,
          tokenUsage: meta.tokenUsage,
        }
      }
    },
  })
}
