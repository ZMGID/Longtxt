import { lazy } from 'react'

import type { AppView } from '../components/AppSidebar'

export const STARTUP_PREFETCH_PLAN: Array<{ view: AppView; delayMs: number }> = [
  { view: 'calendar', delayMs: 260 },
  { view: 'snapshots', delayMs: 920 },
  { view: 'graph', delayMs: 1560 },
  { view: 'data-management', delayMs: 2240 },
]

const loadCalendarView = () => import('../components/CalendarView')
const loadNotebookWorkspace = () => import('../components/NotebookWorkspace')
const loadSearchPanel = () => import('../components/SearchPanel')
const loadGraphView = () => import('../components/GraphView')
const loadSnapshotsView = () => import('../components/SnapshotsView')
const loadDataManagementView = () => import('../components/DataManagementView')

export const LazyCalendarView = lazy(() => loadCalendarView().then((module) => ({ default: module.CalendarView })))
export const LazyNotebookWorkspace = lazy(() => loadNotebookWorkspace().then((module) => ({ default: module.NotebookWorkspace })))
export const LazySearchPanel = lazy(() => loadSearchPanel().then((module) => ({ default: module.SearchPanel })))
export const LazyGraphView = lazy(() => loadGraphView().then((module) => ({ default: module.GraphView })))
export const LazySnapshotsView = lazy(() => loadSnapshotsView().then((module) => ({ default: module.SnapshotsView })))
export const LazyDataManagementView = lazy(() => loadDataManagementView().then((module) => ({ default: module.DataManagementView })))

export const VIEW_MODULE_PRELOADERS: Partial<Record<AppView, () => Promise<unknown>>> = {
  calendar: loadCalendarView,
  notebooks: loadNotebookWorkspace,
  search: loadSearchPanel,
  graph: loadGraphView,
  snapshots: loadSnapshotsView,
  'data-management': loadDataManagementView,
}
