/**
 * @dsh-external/dsh-session-lock — host half.
 * 会话互斥完全在浏览器端完成（Web Locks + BroadcastChannel），host 无状态、无副作用。
 */

export const name = '@dsh-external/dsh-session-lock'

export function apply(_ctx: unknown): void {
  // 无 host 逻辑：锁的生命周期由浏览器保证（标签页关闭即释放）。
}
