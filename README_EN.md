# dsh-session-lock

[中文](README.md) | English

**Cross-tab session mutex for DeepSeek Harness (DSH)**, built on the browser-native **Web Locks API**. It prevents multiple tabs/windows from editing the same session concurrently — the root cause of the "my input gets deleted and replaced with gibberish" bug on DSH ≤ 0.1.2, where drafts from multiple pages silently overwrite each other.

> DSH 0.1.3 introduced a session lock at the **process** level. This plugin covers **browser-page** concurrency: official locking does not protect a single process serving multiple tabs — exactly the gap this plugin fills. The two are complementary.

## Features

- 🔒 **Native mutual exclusion**: one exclusive Web Locks lock per session. Locks are released automatically by the browser when a tab closes or switches sessions — no leaks, no heartbeat.
- ⚠️ **Visible conflicts**: the second tab opening the same session shows a warning banner above the composer — "This session is already open in another tab; input here will not sync and may be overwritten."
- ⚡ **One-click takeover**: the banner's **Take over** button notifies the lock holder via BroadcastChannel to yield, then this tab acquires the lock.
- 🪶 **Zero host, zero dependencies**: a pure Client plugin (React component provided by the host). No host state, no network requests, no storage writes. Bundle ≈ 7 KB (gzip ≈ 2.9 KB).
- 🔇 **Unobtrusive**: the lock holder sees only a subtle "🔒 This tab owns the editor" hint.

## Install

```bash
npm install dsh-session-lock
```

Then add it to your profile bundles (`dsh.plugin add dsh-session-lock`, or append the package name to the `dsh.profile.bundles` array in the profile `package.json`) and restart dsh.

If you use the dsh-super-injector ecosystem (restart-free hot loading), call `dev_inject_plugin <this-directory>` in its environment.

## How it works

```
Tab A opens session S ── navigator.locks.request('dsh.session-lock.<S>', {mode:'exclusive'}) ──► owns the lock, edits normally
Tab B opens session S ── same lock name, request waits ── not acquired after 900 ms ──► warning banner + take-over button
B clicks "Take over" ── BroadcastChannel posts {type:'yield', sessionId} ──► A releases ──► B acquires
Any tab closes / switches away ── browser releases the lock automatically ──► the other tab takes over automatically
```

- Lock names are namespaced as `dsh.session-lock.<sessionId>`, isolated from other plugins.
- Per-tab identity uses `crypto.randomUUID()` (independent per Incognito window).
- Browsers without Web Locks support are skipped gracefully (no UI, zero interference).

## Compatibility

- DSH 0.1.2-rc.x Web UI; Microsoft Edge / Chrome / Safari 15.4+.
- No conflicts with dsh-defend / dsh-genui / dsh-filesnap (registers a single `conversation.input.dock` entry, id `dsh-session-lock`).
- Colors use dsh theme tokens (`--dsw-alias-*`), adapting to light/dark themes.

## Development

```bash
npm install
npm run build:all   # tsc (host) + tsdown (client → lib/client.js)
```

## License

BSD-3-Clause
