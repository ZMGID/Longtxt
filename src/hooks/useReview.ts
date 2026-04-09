import { useMutation, useQuery } from '@tanstack/react-query'

import { DOC_GENERATION_SETTINGS_KEY, parseDocGenerationSettings } from '../../shared/config'
import type { AiInsightHistoryRecord, AiInsightMethodId, AiInsightSnapshotInput, DailyReviewSnapshotInput } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

export function useDailyReview(language: string, dateKey: string, requestVersion: number, forceRefresh = false, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviewDaily(language, dateKey, requestVersion),
    queryFn: () => changbu.review.generateDaily(dateKey, forceRefresh),
    enabled: enabled && Boolean(dateKey),
  })
}

export function useAiInsight(
  language: string,
  methodId: AiInsightMethodId,
  dateKey: string,
  requestVersion: number,
  forceRefresh = false,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.reviewInsight(language, methodId, dateKey, requestVersion),
    queryFn: () => changbu.review.generateInsight(methodId, dateKey, forceRefresh),
    enabled: enabled && Boolean(methodId) && Boolean(dateKey),
  })
}

export function useAiInsightHistory(language: string, methodId: AiInsightMethodId | null = null, enabled = true, limit = 30) {
  return useQuery<AiInsightHistoryRecord[]>({
    queryKey: queryKeys.reviewInsightHistory(language, methodId, limit),
    queryFn: () => changbu.review.listInsightHistory(methodId, limit),
    enabled,
  })
}

export function useDocGenerationSettings() {
  return useQuery({
    queryKey: queryKeys.setting(DOC_GENERATION_SETTINGS_KEY),
    queryFn: async () => parseDocGenerationSettings(await changbu.settings.get(DOC_GENERATION_SETTINGS_KEY)),
  })
}

export function useSaveDailyReviewSnapshot() {
  return useMutation({
    mutationFn: (input: DailyReviewSnapshotInput) => changbu.review.saveDailySnapshot(input),
  })
}

export function useSaveAiInsightSnapshot() {
  return useMutation({
    mutationFn: (input: AiInsightSnapshotInput) => changbu.review.saveInsightSnapshot(input),
  })
}
