/**
 * @dsh-external/dsh-session-lock — client half.
 *
 * 会话互斥锁（跨标签页）：
 *   - 用浏览器原生 Web Locks API 对每个会话名加互斥锁；
 *   - 持锁标签页正常编辑；未持锁标签页在 composer 上方显示警告横幅并支持一键接管；
 *   - 接管 = BroadcastChannel 通知持锁页释放 + 本页重新竞争锁；
 *   - 标签页关闭/切换会话时锁自动释放（Web Locks 语义）。
 *
 * 注册点：conversation.input.dock（id: dsh-session-lock, order 25）。
 * 依赖：react / react-dom 由宿主提供（peer）；不依赖任何 host 服务。
 */
import * as React from 'react'

/**
 * 最小自描述类型：运行时协议来自 dsh-client-ui-renderer 的 renderEntry
 * （entry.component 作为 React 组件渲染，standard/ownerProps 自动合并进 props）。
 */
interface SlotRegistrationOptions {
  name: string
  id?: string
  order?: number
  label?: string | (() => string)
}

interface SlotsService {
  inject(key: string, callback: () => unknown, label?: string): unknown
  register(options: SlotRegistrationOptions, component?: unknown): unknown
}

type ClientContext = {
  slots: SlotsService
  effect(callback: () => unknown, label?: string): unknown
}

export const inject = ['slots']

const CHANNEL_NAME = 'dsh-session-lock.v1'
const LOCK_PREFIX = 'dsh.session-lock.'
const WAIT_BEFORE_BLOCKED_MS = 900
const TAB_ID = (() => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
})()

interface YieldMessage {
  type: 'yield'
  sessionId: string
  from: string
}

function supportsWebLocks(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.locks !== 'undefined'
      && typeof navigator.locks.request === 'function'
  } catch {
    return false
  }
}

type LockPhase = 'idle' | 'locked' | 'waiting' | 'blocked' | 'unsupported' | 'no-session'

/** 每个会话的锁竞争逻辑；组件卸载或 sessionId 变化时释放。 */
function useSessionLock(sessionId: string | undefined) {
  const [phase, setPhase] = React.useState<LockPhase>(sessionId ? 'waiting' : 'no-session')
  const [attempt, setAttempt] = React.useState(0)
  const releaseRef = React.useRef<(() => void) | null>(null)
  const cancelledRef = React.useRef(false)

  React.useEffect(() => {
    releaseRef.current?.()
    releaseRef.current = null
    cancelledRef.current = false
    if (sessionId === undefined) {
      setPhase('no-session')
      return
    }
    if (!supportsWebLocks()) {
      setPhase('unsupported')
      return
    }

    let blockedTimer: ReturnType<typeof setTimeout> | undefined
    const lockName = LOCK_PREFIX + sessionId
    setPhase('waiting')

    const channel: BroadcastChannel | null =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

    const onMessage = (event: MessageEvent) => {
      const data = event.data as YieldMessage | undefined
      if (data && data.type === 'yield' && data.sessionId === sessionId) {
        // 别的标签页请求接管：释放本页持有的锁。
        releaseRef.current?.()
        releaseRef.current = null
      }
    }
    channel?.addEventListener('message', onMessage)

    void navigator.locks.request(lockName, { mode: 'exclusive' }, () => {
      // 拿到锁：回调在持有期间挂起，直到 resolve 才释放。
      return new Promise<void>((resolve) => {
        if (cancelledRef.current) {
          resolve()
          return
        }
        if (blockedTimer !== undefined) clearTimeout(blockedTimer)
        releaseRef.current = resolve
        setPhase('locked')
      })
    }).catch(() => {
      /* 锁名冲突或浏览器策略异常：保持 waiting，重试由 attempt 驱动 */
    })

    blockedTimer = setTimeout(() => {
      // 900ms 内仍未拿到锁（回调未触发）= 另一标签页持有。
      if (releaseRef.current === null && !cancelledRef.current) {
        setPhase('blocked')
      }
    }, WAIT_BEFORE_BLOCKED_MS)

    return () => {
      cancelledRef.current = true
      if (blockedTimer !== undefined) clearTimeout(blockedTimer)
      channel?.close()
      releaseRef.current?.()
      releaseRef.current = null
    }
  }, [sessionId, attempt])

  const takeOver = React.useCallback(() => {
    if (sessionId === undefined) return
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      const message: YieldMessage = { type: 'yield', sessionId, from: TAB_ID }
      channel.postMessage(message)
      channel.close()
    } catch {
      /* BroadcastChannel 不可用则直接重试竞争 */
    }
    // 给持锁页一点时间让出锁，然后重新竞争。
    setTimeout(() => setAttempt((n) => n + 1), 350)
  }, [sessionId])

  return { phase, takeOver }
}

function SessionLockDock({ sessionId }: { sessionId?: string }): React.ReactElement | null {
  const { phase, takeOver } = useSessionLock(sessionId)

  if (sessionId === undefined || phase === 'unsupported' || phase === 'idle' || phase === 'no-session') {
    return null
  }

  if (phase === 'locked' || phase === 'waiting') {
    // 持锁/竞争期不打扰用户：渲染一个极低调的状态点。
    return React.createElement(
      'div',
      { style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: 'var(--dsw-alias-label-secondary, #666)',
        padding: '2px 6px 0',
        opacity: phase === 'locked' ? 0.85 : 0.4,
        transition: 'opacity .25s',
      } },
      React.createElement('span', null, phase === 'locked' ? '🔒 本页独占编辑' : '⏳ 正在取得会话锁'),
    )
  }

  // blocked：另一标签页持有锁 → 警告横幅 + 接管按钮。
  // 颜色全部用 dsh 主题变量（明暗模式自动适配）：文字用主文字色，
  // 背景用警告色低透明混合，边框用警告色。
  return React.createElement(
    'div',
    {
      role: 'alert',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '8px 12px',
        margin: '6px 6px 2px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-state-warn-primary, #b8860b)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary, #ffc107) 13%, transparent)',
        color: 'var(--dsw-alias-label-primary, #333)',
        fontSize: '12.5px',
        lineHeight: 1.5,
      },
    },
    React.createElement(
      'span',
      null,
      '⚠ 该会话已在另一标签页打开——本页的输入不会同步且可能被覆盖。',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: takeOver,
        style: {
          flexShrink: 0,
          padding: '5px 12px',
          borderRadius: '6px',
          border: '1px solid var(--dsw-alias-border-l2, #999)',
          background: 'transparent',
          color: 'var(--dsw-alias-label-primary, #333)',
          cursor: 'pointer',
          fontSize: '12px',
        },
      },
      '接管此会话',
    ),
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({ name: "conversation.input.dock", id: "dsh-session-lock", order: 25, label: () => "会话锁" }, SessionLockDock),
  ), '@dsh-external/dsh-session-lock: input dock')
}
