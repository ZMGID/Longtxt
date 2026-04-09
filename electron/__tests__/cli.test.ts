// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppContext } from '../appContext'
import { runChangbuCli } from '../cli'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runChangbuCli', () => {
  it('keeps --json output machine-readable for unknown commands', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runChangbuCli({} as AppContext, ['bad', '--json'])
    const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('')

    expect(exitCode).toBe(1)
    expect(stderrSpy).not.toHaveBeenCalled()
    expect(stdout).not.toContain('长布 CLI')
    expect(JSON.parse(stdout)).toEqual({
      ok: false,
      error: {
        code: 'UNKNOWN_COMMAND',
        message: '未知命令：bad',
      },
    })
  })

  it('localizes plain-text command errors for english mode', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const exitCode = await runChangbuCli({} as AppContext, ['bad'], { language: 'en' })
    const stderr = stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join('')
    const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('')

    expect(exitCode).toBe(1)
    expect(stdout).toContain('Changbu CLI')
    expect(stderr).toContain('Unknown command: bad')
  })
})
