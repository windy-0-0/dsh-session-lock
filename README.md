# @dsh-external/dsh-session-lock

DeepSeek Harness（DSH）**会话互斥锁**：用浏览器原生 **Web Locks API** 实现跨标签页互斥，防止同一会话被多个标签页/窗口并发编辑——这是 0.1.2 及更早版本中"输入框内容被自动删除、出现乱文字"（多页面草稿互相覆盖）的根治插件。

> 官方 0.1.3 在**进程**级引入了会话锁；本插件解决的是**浏览器页面**级并发，两者互补：单进程多标签场景官方锁管不到，正是本插件的用武之地。

## 特性

- 🔒 **原生互斥**：每个会话一把 Web Locks 独占锁，标签页关闭/切换会话自动释放（浏览器保证，无泄漏）；
- ⚠️ **冲突可见**：第二个打开同一会话的标签页，在输入框上方显示警告横幅——"该会话已在另一标签页打开，本页的输入不会同步且可能被覆盖"；
- ⚡ **一键接管**：横幅上的「接管此会话」按钮通过 BroadcastChannel 通知持锁页让出锁，本页随即获得编辑权；
- 🪶 **零依赖零 host**：纯 Client 插件（React 组件，宿主提供），无 host 状态、无网络请求、无存储写入；产物体积约 7KB（gzip 2.9KB）；
- 🔇 **不打扰**：持锁页只渲染一个极低调的"🔒 本页独占编辑"小字提示。

## 安装

```bash
npm install @dsh-external/dsh-session-lock
```

然后把它加入你的 profile bundles（`dsh.plugin add @dsh-external/dsh-session-lock`，或手动把包名加进 profile `package.json` 的 `dsh.profile.bundles` 数组），重启 dsh 生效。

如果使用 dsh-super-injector 生态（免重启热装配），在其环境中调用 `dev_inject_plugin <本插件目录>` 即可。

## 工作原理

```
标签页 A 打开会话 S ── navigator.locks.request('dsh.session-lock.<S>', {mode:'exclusive'}) ──► 持锁，正常编辑
标签页 B 打开会话 S ── 同一锁名请求进入等待 ── 900ms 未获得 ──► 显示警告横幅 + 接管按钮
B 点击接管 ── BroadcastChannel 广播 {type:'yield', sessionId} ──► A 释放锁 ──► B 获得锁
任一标签关闭/切走 ── 浏览器自动释放锁 ──► 另一页自动获得
```

- 锁名 = `dsh.session-lock.<sessionId>`，与其他插件的锁命名空间隔离；
- 页签 ID 用 `crypto.randomUUID()`（无痕窗口每次独立）；
- 不支持 Web Locks 的浏览器自动跳过（不渲染任何 UI，零干扰）。

## 兼容性

- DSH 0.1.2-rc.x（Web UI）；Edge/Chrome/Safari 15.4+；
- 与 dsh-defend / dsh-genui / dsh-filesnap 等插件无冲突（只注册 `conversation.input.dock` 一个条目，id `dsh-session-lock`）。

## 开发

```bash
npm install
npm run build:all   # tsc（host）+ tsdown（client → lib/client.js）
```

## License

BSD-3-Clause
