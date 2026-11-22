# 静态资源缓存与 Cloudflare 配置（CAT-005）

- 日期：2026-11-22
- 目标：中国用户重复访问走浏览器 / 边缘缓存，首屏少下载；`sw.js` 不再被缓存 4 小时；中文标题字体从 1.5 MB 降到几十 KB。
- 状态：**origin 与工具已就绪；线上 Cloudflare 未应用**。本机没有 API token，本票不部署、不改 DNS。

## 1. 2026-11-22 线上实测

`curl -sSI https://cats.mainstayx.com<path>` 的响应头（同日多次）：

| 路径 | cache-control | cf-cache-status | content-length |
| --- | --- | --- | --- |
| `/` | `no-cache` | `DYNAMIC` | –（压缩） |
| `/index.html` | `no-cache` | `DYNAMIC` | –（压缩） |
| `/sw.js` | `max-age=14400` | `REVALIDATED` | 5,366 |
| `/js/game.js` | `max-age=14400` | `REVALIDATED` | 51,223 |
| `/css/style.css` | `max-age=14400` | `MISS`（随后 `REVALIDATED`） | 23,019 |
| `/assets/room-bg.jpg` | `max-age=14400` | `REVALIDATED` | 205,287 |
| `/assets/fonts/ZCOOLKuaiLe-Regular.ttf` | `max-age=14400` | `REVALIDATED` | 1,514,968 |

三个结论：

1. Service Worker 被浏览器缓存 4 小时，部署后旧 SW 最长会留 4 小时。
2. 边缘没有 HIT：`REVALIDATED` 表示 Cloudflare 每次都拿 ETag 回源校验；重复访问仍吃满 RTT（大陆到 HK/LAX/SIN 通常 150–300 ms）。
3. 中文标题字体 1.5 MB 是首屏最大单文件。

### 4 小时从哪来

线上 origin 当时对 `js/`、`css/`、`assets/` 也发 `Cache-Control: no-cache`（CAT-005 之前的 `server/static.mjs`）。响应里的 `max-age=14400` 是 Cloudflare zone 的 **Browser Cache TTL** 默认值 4 小时改写出来的：

> Browser Cache TTL … By default, Cloudflare honors the cache expiration set in your `Expires` and `Cache-Control` headers but overrides those headers if: the value … is less than the Browser Cache TTL Cloudflare setting.
> — [Edge and Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/)

所以只改 origin 对可缓存响应不够：Cloudflare 的 Browser Cache TTL 会覆写更短的 origin 值。建议把 Browser Cache TTL 改成 **Respect Existing Headers** 作为兜底（bypass / DYNAMIC 响应本来就会保留 origin `no-cache`），并让 Cache Rule 显式设置 browser TTL。`REVALIDATED` 则来自 zone 的边缘缓存策略，用本文第 4 节的规则修复。

## 2. origin 策略（`server/static.mjs`）

按解析后的路径分类，不再一刀切 `no-cache`：

| 路径 | Cache-Control |
| --- | --- |
| `/`、`/index.html`、`/sw.js`、`/manifest.webmanifest` | `no-cache` |
| `/js/**`、`/css/**` | `public, max-age=3600, stale-while-revalidate=86400` |
| `/assets/**` | `public, max-age=604800, stale-while-revalidate=86400` |
| 其他（404 等） | 维持原有行为 |

- 所有 200 仍带强校验用 ETag 与 `Last-Modified`；`If-None-Match` 命中返回 304（304 保留同样的 `Cache-Control`）。
- HEAD 与 GET 使用同一份头（HEAD 不发 body）。
- 代码 / 图片 TTL 短、`stale-while-revalidate` 长：浏览器在 TTL 内直接用缓存，后台再校验，不会因为 TTL 到期卡首屏。
- SW（`v9`）对 `/js/`、`/css/`、`/assets/` 走 **cache-first**：命中直接返回，不发请求；未命中才走网络并写入 Cache API。navigation、HTML、`sw.js`、`manifest.webmanifest` 仍走 network-first（`fetch(req, { cache: 'no-cache' })`，3 秒超时或离线回缓存），保证部署后壳能立刻更新。`/api/`、`assets/raw/`、`design/`、`tools/` 不缓存。
- **失效办法**：SW 缓存没有 HTTP TTL，靠 `sw.js` 的 `VERSION` 变更失效——任何部署只要改了 `js/`、`css/`、`assets/` 或预缓存列表，就必须 bump `VERSION`；新 worker 安装时用 `cache: 'reload'` 重新拉取，`activate` 删除旧 cache。Cloudflare 边缘用 `purge_everything`（或按 URL purge）。文件名没有内容哈希，7 天边缘 TTL 意味着不 purge 时旧图最多留 7 天；每次部署都 purge 是本仓库的约定。

`sw.js` 本身进入 `no-cache` 分类；SW `VERSION` 从 `v7` 升到 `v9`，预缓存列表加入 `assets/fonts/ZCOOLKuaiLe-Regular.woff2`（CAT-004 的 6 个音频和水碗图已在列表里）。1.5 MB 的 TTF 不再预缓存：支持 WOFF2 的浏览器不需要它，需要回退的浏览器会在首次使用时按需取并由 SW 运行时缓存，避免安装阶段白下载 1.5 MB。

## 3. 字体子集

- 工具：`python3 tools/subset-font.py`；扫描 `index.html`、`js/*.js`、`css/*.css`，加 ASCII 可打印字符、常用中文标点，以及 `tools/common-hanzi.txt`（现代汉语常用字表，取前 3000 字），调用 `fontTools.subset`（即 `pyftsubset`）：
  `--flavor=woff2 --layout-features='*' --no-hinting`。
- 结果：`ZCOOLKuaiLe-Regular.ttf` 1,514,968 B → `ZCOOLKuaiLe-Regular.woff2` **357,740 B**（349.4 KB，-76%），3172 个字符，其中 3000 个常用汉字全部在字体里；脚本会校验这 3000 字都在输出 cmap 中，缺失即失败。
- 源字体没有的字形（emoji、`←↑→↓★☆` 等 22 个）由系统字体回退，不阻塞构建；脚本会打印清单。
- `css/style.css` 的 `@font-face` 先 WOFF2 后 TTF；TTF 与 OFL 授权文件保留，供不支持 WOFF2 的浏览器回退。
- 截图对比（改动前后、桌面 1280×800、手机 390×844）：
  - `/home/sentimentalk/codes/temp/cat-005/screenshots/before-desktop-1280x800.png`
  - `/home/sentimentalk/codes/temp/cat-005/screenshots/before-mobile-390x844.png`
  - `/home/sentimentalk/codes/temp/cat-005/screenshots/after-desktop-1280x800.png`
  - `/home/sentimentalk/codes/temp/cat-005/screenshots/after-mobile-390x844.png`
  - 标题 `俺家的猫厕所` 前后宽度同为 109.45 px；无缺字方块；页面资源从 `ZCOOLKuaiLe-Regular.ttf`（1,515,268 B 传输）变为 `.woff2`（357,740 B，-76%）。
  - 仓库内可复查：`python3 tools/subset-font.py` 重建出同一文件；SHA-256 `9ad17022d7da8c1dbb5b324096f35ba03274e836b9b5ec99f438f84ee57a1e58`（生成后以 `sha256sum` 为准）。浏览器 canvas `measureText`（16px KuaiLe）：`他/国/年/们` 与 `猫/俺` 全部 14.72 px，改动前的 50,860 B 子集对前四字回退为 16.00 px。探针：`/home/sentimentalk/codes/temp/cat-005/font-advance.mjs`。

## 4. Cloudflare Cache Rules

### 4.1 用脚本（推荐，可 Review）

`tools/cf-cache-rules.mjs` 零依赖，读环境变量，不读写仓库：

```sh
# 只看将 PUT 的 JSON，不联网
node tools/cf-cache-rules.mjs --dry-run

# 应用（需要 token + zone id）
export CLOUDFLARE_API_TOKEN=...   # 不要 commit、不要贴进日志
export CLOUDFLARE_ZONE_ID=...
node tools/cf-cache-rules.mjs --apply
```

规则（phase `http_request_cache_settings`，action `set_cache_settings`）：

| 规则 | 表达式 | 动作 |
| --- | --- | --- |
| bypass app shell and API | `/api/` 前缀，或路径等于 `/sw.js`、`/index.html`、`/manifest.webmanifest`、`/` | `cache: false` |
| static assets | `/assets/` 前缀 | edge 604,800 s、browser 604,800 s |
| code | `/js/` 或 `/css/` 前缀 | edge 3,600 s、browser 3,600 s |

`--apply` 先 `GET /zones/{zone}/rulesets/phases/http_request_cache_settings/entrypoint`：entrypoint 不存在（404）时按 Cloudflare 文档用 `POST /zones/{zone}/rulesets` 建 `kind: zone`、`phase: http_request_cache_settings` 的规则集；已存在时按 `cats-toilet:` description 前缀替换本项目的规则，其他规则保留并排在后面，再 `PUT` 同一 entrypoint。PUT 前会剥掉 GET 返回的只读字段（`id` / `version` / `last_updated` 等），只发 `description`、`expression`、`action`、`action_parameters`、`enabled`。Cloudflare 按顺序匹配，本项目规则放最前，窄路径表达式不会影响其他路径。

token 权限：**Zone:Read** + **Zone:Cache Rules:Edit**；purge 另需 **Zone:Cache Purge**。使用 zone 级 token，不要用 Global API Key。缺 `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_ZONE_ID` 时 `--apply` 不发送请求，先打印将要 PUT 的完整 payload，再非零退出并标 `未应用 (not applied)`；任何输出都不包含 token。

> Edge Cache TTL 下限：Free 2 小时（7,200 s），Pro 1 小时（3,600 s）。免费版上 `code` 规则的 3,600 s 可能被抬到 7,200 s；按本票取 3,600 s，若 API 因下限拒绝，把该规则改成 7,200 s 再 apply。

### 4.2 用 Dashboard

1. 选中 `mainstayx.com` zone → **Caching → Cache Rules**。
2. 按上表建三条规则；Expression 用 `starts_with(http.request.uri.path, "/assets/")` 等。
3. **Caching → Configuration → Browser Cache TTL** 建议改成 **Respect Existing Headers**（兜底，不是唯一前提）：DYNAMIC / bypass 的响应会保留 origin `no-cache`，但被边缘缓存的静态资源仍可能被 4 小时设置改写；改了可以避免这条隐式覆写。
4. 若 zone 之前有 Page Rules 或旧 Cache Rules 对 `/js/`、`/assets/` 设过 Edge/Browser TTL，删除或让其排在本项目规则之后。
5. 保存后按第 5 节验证。

### 4.3 部署后 purge

```sh
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "content-type: application/json" --data '{"purge_everything":true}'
```

purge 只清边缘；浏览器里已存的旧资源靠 `sw.js` 的 `VERSION` + `cache: 'reload'` 更新。`wrangler` 不管 zone cache rules（它只管 Workers/Pages/KV/R2），所以本仓库用 REST 脚本。

## 5. 审计

```sh
# 线上只读巡检
node tools/cdn-audit.mjs --base https://cats.mainstayx.com

# 本地 origin 头断言（自己先起服务）
node server/server.mjs --port 8790 --db /tmp/cats.db &
node tools/cdn-audit.mjs --base http://127.0.0.1:8790 --assert-origin
```

每个路径请求两次，打印 `status`、`cache-control`、`content-length`、`cf-cache-status`。`--assert-origin` 只断言 origin 的 `Cache-Control`；线上 `REVALIDATED`/`DYNAMIC`/`MISS` 只作为提示，不当成本地失败。

配置好规则后的预期：

- `/`、`/index.html`、`/sw.js`、`/manifest.webmanifest`：`cf-cache-status: DYNAMIC`（bypass），`cache-control: no-cache`。
- `/js/`、`/css/`、`/assets/`：第二次请求 `cf-cache-status: HIT`。
- 装了 SW 的浏览器第二次加载由 cache-first 直接返回（`X-SW-Cache: hit`），不再发请求；审计脚本从 Node 发起，不受 SW 影响，看到的是真实边缘行为。

## 6. 免费版做不到什么

- Cloudflare 免费 / Pro 在中国大陆**没有自有节点**。大陆流量通常落到香港、洛杉矶、新加坡等，首访 RTT 仍然高；缓存只省重复下载，不省首访 RTT。
- 真正的大陆加速需要：
  - Cloudflare **China Network**：Enterprise 合同 + ICP 备案 + 域名接入；或
  - 阿里云 / 腾讯云 CDN：需要大陆账号与 ICP 备案，并把源站暴露给该 CDN。
- 本票不注册 CDN、不备案、不买 Enterprise/Argo，也不改 DNS。免费版能做的只有：正确缓存头 + Cache Rules + 字体子集 + 首次加载体积下降。

## 7. 用户下一步

1. 合并并部署本 SHA 后，先跑 `node tools/cdn-audit.mjs --base https://cats.mainstayx.com` 确认 origin 头已变。
2. 在 Cloudflare 把 **Browser Cache TTL** 改为 Respect Existing Headers。
3. 创建 Zone:Read + Zone:Cache Rules:Edit 的 token，和 zone id 一起放进本机环境变量，运行 `node tools/cf-cache-rules.mjs --apply`；或按 4.2 手动建三条规则。
4. `purge_everything`，再跑审计确认 `HIT`。
5. 若目标是大陆首访速度，评估 China Network 或国内 CDN（需备案），这超出本仓库能自动完成的范围。

没有 token 时本文不声称规则已生效；上述第 2–4 步需要用户执行。
