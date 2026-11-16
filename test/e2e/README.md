# 浏览器端到端测试

零第三方依赖：自写 CDP 客户端（Node 24 自带 `WebSocket` / `fetch`）。

## 跑

```sh
node --test 'test/e2e/*.test.mjs'
```

Node 24 的测试运行器不再把目录参数展开，所以用 glob 而不是 `test/e2e/`。

依赖 `/usr/bin/google-chrome`。服务端口用 8790–8799，CDP 用 9555。

## 文件

- `cdp.mjs` — `launch({ port, userDataDir, width, height })`，返回 page：`addInitScript` / `goto` / `evaluate` / `waitFor` / `click` / `text` / `count` / `shot` / `close`，以及 `page.errors`（`{ type, text, url, status }`）。
- `serve.mjs` — `startServer({ port, dbPath, root })`，起 `server/server.mjs`，返回 `{ url, stop() }`。
- `harness.mjs` — `withGame(t, fn, opts)`：临时 DB + Chrome profile，起服务、开 Chrome、打开 `opts.path`（默认 `/`）、等 `window.__game`，`t.after` 里清理并打印 console 错误条数。
- `smoke.test.mjs` — 冒烟用例。

## 房间时钟

`?clock=<epochMs>` 是房间自带的调试时钟参数（`js/game.js` 读 `clock` query，把 `Date.now()` 偏到指定时刻）；用例用页面里的 `window.__game.advanceClock(ms)` 往后推进，不要改系统时间。

## 环境变量

- `E2E_BASE_URL` — 直接连已有服务（不再起服务），用于对基线 worktree 跑同一批用例。
- `E2E_SHOT_DIR` — 截图目录，默认 `/home/sentimentalk/codes/temp/cat-002/screenshots`。
- `E2E_PORT` — 服务端口，默认 8790（也可用 `withGame` 的 `opts.port`）。

## 临时数据

临时 DB 与 Chrome profile 放在 `/home/sentimentalk/codes/temp/cat-002/e2e/<随机>/`，用例结束删除。

## 已知放行

访客首屏 `GET /api/me` 按设计返回 401，Chrome 记一条 `Failed to load resource` 错误；smoke 只放行这一条（`url` 以 `/api/me` 结尾且 `status === 401`），其余任何 error / exception 都算失败。
