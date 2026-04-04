import { useQuery } from '@tanstack/react-query'

import { changbu } from '../lib/changbu'
import { queryKeys } from '../lib/queryKeys'

export function useCalendarYears(enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarYears(),
    queryFn: () => changbu.calendar.listYears(),
    enabled,
  })
}

export function useCalendarHeatmap(year: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarHeatmap(year),
    queryFn: () => changbu.calendar.getYearHeatmap(year),
    enabled,
  })
}

export function useCalendarDayDetail(date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarDay(date),
    queryFn: () => changbu.calendar.getDayDetail(date),
    enabled,
  })
}

export function useUpcomingCalendarEntries(limitDays: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarUpcoming(limitDays),
    queryFn: () => changbu.calendar.listUpcoming(limitDays),
    enabled,
  })
}
