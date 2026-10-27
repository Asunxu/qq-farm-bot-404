# 活动插件开发指南

本文档描述限时活动插件（Activity Plugin）的开发、打包、上传与宿主契约。
参考实现（按复杂度递增）：

- `core/plugins/solar-terms/` —— 节令小札：常驻活动、无素材、select 开关、
  动态答题窗口由 runner 内部判断（最简单的入门样例）；
- `core/plugins/milk-tea/` —— 奶茶热销中：限时活动、350 个协议素材、
  果实保留谓词、完整手工操作面板（完整能力样例）。

## 1. 总体模型

- 插件 = 一个 zip 包，管理员在「管理面板 → 活动插件」上传后**立即生效**：
  主进程注册 HTTP 路由、worker 进程注册协议服务与自动化 runner、前端动态加载
  ESM 面板——全程不重启服务、不重新构建主前端。
- manifest.json 是唯一契约：活动时间窗（支持常驻）、自动化开关（key/类型/
  默认值/各自时间窗）、卡片素材、前后端入口都由它声明。主应用不再有任何
  插件活动的字面量（内置活动除外）。
- 存储位置：`<data>/plugins/installed/<id>/<version>/`，注册表在
  `<data>/plugins/registry.json`；升级保留最近 3 个历史版本可一键回滚；
  插件私有状态在 `<data>/plugins/state/<id>/`（跨版本保留，卸载不删除）。

## 2. 插件包结构

```
<slug>.zip
├── manifest.json          # 契约（schema 见 core/src/plugins/manifest.js）
├── backend/
│   ├── index.js           # CommonJS 入口：admin.register / worker.register
│   ├── service.js         # 活动协议服务（依赖注入，可单测）
│   ├── catalog.json       # 官方配置表快照（可选，随插件版本发布）
│   └── proto/*.proto      # 活动协议定义（含被 import 的依赖文件）
├── frontend/
│   ├── plugin.mjs         # 预构建自包含 ESM（Vue 内联，导出 mount(el, host)）
│   └── plugin.css
└── assets/                # 可选：协议路径解析的素材
    ├── *.png ...
    └── assets-map.json    # { file, sha256, url, ... } 上传时逐条校验
```

### manifest.json 关键字段

```json
{
  "id": "milk-tea",                    // 全局唯一 slug
  "name": "奶茶热销中",
  "version": "1.0.0",                  // x.y.z，重复上传即升级
  "apiVersion": 1,                     // 必须与宿主一致
  "activityIds": [2026110100],         // 用于活动目录去重
  "windows": [
    { "key": "activity", "startTime": 1792029600, "endTime": 1794844799 },
    { "key": "business", "startTime": 1792029600, "endTime": 1794671998 },
    { "key": "permanent", "startTime": 0, "endTime": 0 }   // 0/0 = 常驻活动
  ],
  "automation": [                      // 自动化开关：boolean / select / number
    { "key": "milk_tea_cashier", "label": "自动领取收益", "detail": "...",
      "window": "activity", "type": "boolean", "default": false },
    { "key": "milk_tea_hire_duration", "label": "雇佣时长", "window": "business",
      "type": "select", "default": 1,
      "options": [{ "value": 1, "label": "4 小时" }] }
  ],
  "frontend": {
    "entry": "frontend/plugin.mjs",
    "css": "frontend/plugin.css",
    "assetPrefix": "/activity/milk-tea"   // 素材站内前缀，全局不可冲突；无素材可省略
  },
  "card": { "icon": "i-carbon-cafe", "image": "/activity/milk-tea/img_s4Main_bg.png",
            "updatedMs": 1792029600000 }
}
```

窗口语义：`startTime/endTime` 为秒级时间戳；`0/0` 表示**常驻活动**（卡片不置灰、
开关不因窗口失效）。自动化开关声明的 `window` 决定其显隐与失效停用时间。

### 谁执行开关：插件 runner 与内置服务的分工

manifest 声明的开关默认由**插件自己的 runner** 执行（`ctx.registerAutomation`）。
有一个特例模式：**开关由内置服务执行、但窗口归属活动**（如奶茶插件的
`mall_coupon_gift_buy` 点券礼包，执行方是内置 `mall-gift-auto-buy` 服务）。
做法：manifest 声明该开关（获得设置页渲染、窗口失效停用、卸载强制关闭），
内置服务的执行代码照常读取 `getAutomation()[key]`，插件的 runner 不处理它即可。

## 3. 宿主契约（apiVersion 1）

### backend/index.js

```js
module.exports = {
  apiVersion: 1,
  admin: {
    register(ctx) {
      ctx.route('get', '/api/activity/<slug>', async (req, res) => {
        const accountId = ctx.requireAccount(req, res);      // 账号鉴权 helper
        if (!accountId) return;
        if (!ctx.requireConnected(res, accountId, '账号未运行')) return;
        res.json({ ok: true, activity: await ctx.callWorker(accountId, 'getXxx', [], 90000) });
      });
    },
    unregister() {},
  },
  worker: {
    register(ctx) {
      const types = buildTypes(ctx);   // 见下方 requireModule 铁律
      const service = createService({ ... });
      ctx.registerApiMethod('getXxx', (...args) => service.getXxx(...args));
      ctx.registerAutomation({ keys: [...], run: async (runCtx) => {} });
      ctx.registerFruitReserve(({ itemId, automation, nowSec }) => boolean);  // 可选
    },
    unregister() {},
  },
};
```

**ctx 提供的能力**：

| 能力 | 说明 |
| --- | --- |
| `ctx.route(method, path, ...handlers)` | 注册 HTTP 路由，必须挂在 `/api/` 下；自动插到 SPA fallback 之前，停用时精确摘除。鉴权由全局 auth gate 统一处理 |
| `ctx.requireAccount(req, res)` / `ctx.requireConnected(res, accountId, msg)` | 账号鉴权与在线校验 helper，路由内必用 |
| `ctx.callWorker(accountId, method, args, timeoutMs)` | 调用 worker 内 `registerApiMethod` 注册的方法；operate 类长 RPC 必须显式传 timeoutMs |
| `ctx.requireModule(name)` | **宿主模块解析的唯一通道**（白名单：protobufjs 及其子路径、long），见下方铁律 |
| `ctx.sendMsgAsync / getUserState / getBag / getBagItems / getServerTimeSec / itemDto / helpers` | 协议收发与数据 helper（helpers 含 serializeMutation / businessError / positiveDecimal） |
| `ctx.registerApiMethod(name, handler)` | 注册 worker 侧 api 方法，供主进程路由经 callWorker 调用 |
| `ctx.registerAutomation({ keys, run })` | 注册自动化 runner：挂在活动自动化心跳（登录后 10 秒 + 每 5 分钟 + 开关变化后 2 秒补跑）执行；runner 自行做开关、阶段与前置条件判断，异常只落日志不影响其他插件 |
| `ctx.registerFruitReserve(fn)` | 仓库自动卖出前逐条询问，返回 true 则保留该果实（`fn({ itemId, automation, nowSec })`） |
| `ctx.dataFile(name)` | 插件私有持久化文件（`<data>/plugins/state/<id>/`），跨版本保留 |
| `ctx.manifest / ctx.pluginId / ctx.version / ctx.log` | 契约与日志（日志已精简，前缀 `插件:<name>`） |

### ⚠️ requireModule 铁律

插件安装在数据目录（可能与源码目录分离，如 `FARM_DATA_DIR` 指向别处，或 pkg
打包版的 exe 旁），插件目录**向上解析不到宿主的 node_modules**。因此：

- 插件后端**禁止直接 `require('protobufjs')` 等宿主包**——运行时会
  `MODULE_NOT_FOUND`（源码目录下开发时不报错，最容易漏测）；
- 一律通过 `ctx.requireModule('protobufjs')` / `ctx.requireModule('long')` 获取
  （白名单支持子路径，如 `protobufjs/minimal`）；
- Node 内置模块（`fs`/`path` 等）可直接 require。

### frontend/plugin.mjs

```js
export function mount(el, host) {
  // host = { api, getAccountId(), window: { startMs, endMs }, onBack }
  // 用宿主 api 实例发请求（自动携带 x-admin-token / x-account-id）
  // window 为活动有效期（毫秒），常驻活动为 { startMs: 0, endMs: Number.MAX_SAFE_INTEGER }
  // 过期时宿主会卸载，插件内部也应自查退出（限时活动）
  // 返回 { unmount() }
}
```

- 预构建为**自包含 ESM**（Vue 运行时内联），宿主与插件双 Vue 实例共存；
  不要依赖跨实例的 Vue 响应性（宿主在切账号时会卸载重挂插件）；
- **样式**：插件面板可以复用宿主的 UnoCSS 原子类，但宿主 `web/uno.config.ts`
  的扫描范围必须包含 `../core/plugins/*/frontend/src/**`（已配置）；
  复用宿主 UI 组件（如 BaseButton）直接把组件文件复制进插件并去掉
  vue-router 等插件构建不需要的依赖，不要从 `@/` 路径引用；
- 素材引用 `assetPrefix` 前缀的绝对路径（如 `/activity/milk-tea/xxx.png`），
  由后端在运行时从插件目录提供；无素材的插件省略 assetPrefix。

### frontend 构建配置要点（vite.config）

```js
export default defineConfig({
  plugins: [vue()],
  define: {
    // Vue 的 esm-bundler 构建依赖打包器替换 process.env.NODE_ENV；lib 产物在
    // 浏览器直接运行，必须显式定义，否则运行时报 process is not defined
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VUE_OPTIONS_API': 'false',
  },
  build: {
    lib: { entry: 'src/main.js', formats: ['es'], fileName: () => 'plugin.mjs' },
    rollupOptions: { output: { assetFileNames: ... } },  // CSS 输出为 plugin.css
  },
})
```

## 4. 开发与打包流程

以 solar-terms（最简）或 milk-tea（完整）为模板复制目录后：

```bash
cd core/plugins/<slug>/frontend
npm install
npm run build            # 产出 dist/plugin.mjs + dist/plugin.css

cd ..
node pack.js             # 产出 dist/<slug>-<version>.zip
```

然后两种验证方式：

1. 管理面板「活动插件」tab 上传 zip（上传 = 安装 + 激活，立即生效）；
2. 或 curl：
   ```bash
   curl -X POST http://localhost:3007/api/plugins/upload \
     -H "x-admin-token: $TOKEN" -F "file=@dist/<slug>-<version>.zip"
   ```

### dev 前端代理

`web/vite.config.ts` 需要为插件的 assetPrefix 增加一条代理（如
`/activity/milk-tea` → `http://localhost:3007`）；`/plugins` 已有通用代理。
无素材的插件不需要额外代理。

### 排错速查

| 现象 | 原因 |
| --- | --- |
| 面板报 `process is not defined` | 构建缺 `define`（见上） |
| 面板报 `Unknown method` | worker 侧未注册该 api 方法：查启动日志有无 `register 失败` |
| 加载失败 `Cannot find module 'protobufjs'` | 插件直接 require 了宿主包，改走 `ctx.requireModule` |
| 活动页刷新变 JSON 404 | assetPrefix 处理器未放行（宿主已内置 next() 放行，勿改回） |
| 上传报素材 sha256 不匹配 | assets-map.json 与实际文件不一致，重新提取素材 |
| 上传报 `manifest.json 不是合法 JSON：Unexpected token '﻿'` | manifest 被 PowerShell Set-Content 加了 UTF-8 BOM，重打 |
| 上传报 `zip 条目数非法` | MAX_ENTRIES=5000 被超，调大 zip.js 常量（2026-10-27 之前是 2000） |
| 活动页不显示插件卡片 | **正常**：gameConfig.provides=true 的素材插件被 Activity.vue 过滤 |
| 图鉴能显示但背包种子/果实不显示 | **worker-host.js 漏了 registerExternalGameConfigProvider**（2026-10-27 已修复），重启后生效 |
| 上传 v1.1.0 后重启又变回 v1.0.0 | bootstrapBuiltins 会在"内置版本 ≥ 已安装版本"时覆盖。预置改版本号 |
| 静态资源 404 但磁盘有文件 | manifest.json 里声明的 `urlPrefix` 或文件名（含大小写）与磁盘不一致 |
| `/game-config` 下的中文文件名 404 | 宿主 admin.js provider fallback 先 `decodeURIComponent`（已修复） |

## 5. 卸载与过期行为

- **停用**：路由摘除、worker 卸载、素材 404、卡片与开关消失；保留文件可再启用。
- **卸载**：删除安装目录；其全部自动化开关在所有账号上强制关闭并同步 worker
  （与活动过期同一条路径）。插件私有状态保留。
- **活动过期**：manifest 时间窗之外，`disableHiddenActivityAutomation` 在读取时
  强制关闭开关，worker-manager 每 30 秒落盘并同步；重启不会回启。常驻活动
  （0/0 窗口）不参与窗口失效。
- **升级**：同 id 重复上传即升级；旧版本保留在 history，可「回滚」一键切回。

## 6. 与既有约定的关系

- **协议恢复**：字段不明的活动先走 `$qq-farm-activity-protocol-recovery` skill，
  得到官方生成代码后再按本指南封装成插件；proto 文件随插件打包。
- **素材映射**：`assets/assets-map.json` 沿用原 `web/public/activity/<slug>/assets.json`
  格式（file+sha256+url），上传时宿主逐条校验，防截断与错版。
- **内置活动**（非插件）仍需维持 `store.js TIMED_ACTIVITY_AUTOMATION_GROUPS` 与
  `web/src/constants/activity-windows.ts` 的手工同步；插件活动不再需要。
- **设置页**：插件开关卡片由 manifest 驱动自动渲染，两个设置页共享同一批
  key 与显隐规则；不要为插件开关手写独立卡片。
- **日志**：插件日志已精简（加载/停用/卸载/失败各一条）；诊断用堆栈只在
  排查时临时加，不要长期留在代码里。

## 7. 素材插件（gameConfig provider）

**部分插件**只提供活动植物增量、种子图标、植物阶段图，不提供活动面板、
自动化或协议服务。manifest 声明 `gameConfig.provides: true`，宿主激活时会把
安装目录下约定的文件**自动合并**进核心配置，前端直接复用 `/game-config/` 既有
访问前缀，**不再需要后端路由或 worker**。这是更新种子/作物完整链的"一条链路
自动生效"方案——活动只要增量条目和图片更新，重新打包上传插件即可。

### 契约

manifest 额外字段：

```json
{
  "gameConfig": { "provides": true, "urlPrefix": "/game-config" }
}
```

插件包结构（`core/scripts/pack-material-plugin.js` 会自动生成）：

```
<slug>.zip
├── manifest.json            // 声明 gameConfig.provides=true
├── backend/index.js         // stub：空 admin/worker register 即可
├── catalog/
│   └── EventPlants.json     // 活动植物增量表（与 core/src/gameConfig/EventPlants.json 同格式）
└── assets/
    ├── assets-map.json      // 宿主校验用
    ├── seed_images_named/*.png
    ├── seed_images_named/skinDetail/*.png
    └── plant_images/
        ├── manifest.json    // asset_name → { phase: url } 清单
        └── <AssetName>/N.png
```

### 宿主合并规则

`core/src/config/gameConfig.js` 的三处加载点会自动遍历已激活的素材 provider：

| 加载点 | 合并策略 |
| --- | --- |
| `loadPlantConfig` | 宿主 EventPlants.json 先读，provider 追加；seed_id/plant_id 已存在则跳过（宿主优先） |
| `loadSeedImages` | 宿主目录先索引，provider 的 `assets/seed_images_named/` 补充缺失的 id → URL 映射 |
| `loadPlantPhaseManifest` | 宿主 `plant_images/manifest.json` 先合并，provider 的 manifest 按 asset 追加缺失 phase |
| `loadSkinDetail` | 同上 |

> **重要：两个进程都要注册 provider**。主进程（`host.js.activate`）和 worker 进程
> （`worker-host.js.load`）都调 `gameConfig.registerExternalGameConfigProvider`，
> 否则主进程的 illustrated 能拿到图，但 worker 处理的 warehouse（背包）还是显示空。
> 2026-10-27 之前 worker-host.js 漏了这段，导致背包不显示；已修复，新插件自动走通。

`admin.js` 的 `/game-config` 静态路由在宿主目录没命中时，会依次查每个 provider
的 `assets/` 子目录作为回退；manifest 里写的 URL（形如
`/game-config/plant_images/Crop_9003/3.png`）不需要 provider 有独立前缀。

### 素材插件的特殊保护

- **禁止停用 / 卸载**：`host.js` 的 `disable()` 和 `uninstall()` 对
  `manifest.gameConfig.provides === true` 的插件直接 `throw`，前端
  `AdminPluginsPanel.vue` 隐藏操作按钮并显示琥珀色"🔒 素材插件禁止停用/卸载"
  提示。
- **活动页面不显示卡片**：`Activity.vue` 遍历 `pluginsStore.enabledPlugins`
  时跳过 `gameConfig.provides === true`，避免"QQ农场基础素材包"这类内部合并
  插件出现在用户可见的活动列表里。它只在设置页 → 活动插件 tab 里可见。

### 素材文件命名约定

宿主 `gameConfig.js` 的 hash 扫描逻辑对文件名命名**强依赖官方 assetName**，
建议严格按以下格式命名，让扫描器自动建立 ID 映射：

| 素材类型 | 文件名格式 | 来源说明 |
| --- | --- | --- |
| 种子/果实图 | `Crop_XXX_Seed.png` | Plant.asset_name（如 Crop_9003）+ `_Seed`。**背包和图鉴都用同一张**（官方 ItemInfo.icon_res 本就指向 plant bundle 的同一个 spriteFrame） |
| GUI 道具图标 | `icon_xxx.png` | item.icon_res 的 basename（GUI bundle extraRes） |
| 种子图（带 ID 前缀） | `29003_Crop_9003_Seed.png` | 批量提取时可能用，扫描器会从文件名里提取所有数字 token（29003 + 9003）注册到映射 |
| 阶段图 | `Crop_XXX/1.png` ~ `Crop_XXX/6.png` | 按官方 plant_images 目录结构 |
| 小屋装饰 | `icon_wuding05.png` / `icon_men05.png` 等 | 按 icon_res basename |

**为什么要官方 assetName 命名**：`gameConfig.js` 用文件名 hash + 所有数字 token
反向索引，**不依赖 ItemInfo 二次匹配**。只要磁盘上有 `Crop_9003_Seed.png`，
getItemImageById(29003)（种子 ID）和 getItemImageById(49003)（果实 ID）都能命中
（因为两者的 icon_res 指向同一个 plant bundle spriteFrame）。

### CDN 补图工作流（find-cdn-resource.js）

背包和图鉴缺图时，先用 `inspect:cdn` 查官方配置表确认 `icon_res` 和 `asset_name`，
再用 `find-cdn-resource.js` 从官方 miniapp CDN 下载：

```bash
cd core

# 1. 按 itemId 查官方配置表（确认 icon_res / type / bundle）
npm run inspect:cdn -- --table ItemInfo --id 1023   # 星砂
npm run inspect:cdn -- --table Plant --id 9003      # 查 asset_name

# 2. 按 Cocos 资源路径查 CDN URL
npm run inspect:cdn -- --path gui/texture/icon/icon_S2_stardust
npm run inspect:cdn -- --path model/v4/Crop_6030_Seed/spriteFrame
npm run inspect:cdn -- --path gui/texture/icon/icon_weatherBottle_1

# 3. 下载到 material-plugin 的 seed_images_named 目录
node scripts/find-cdn-resource.js \
  --path gui/texture/icon/icon_S2_stardust \
  --out plugins/material-plugin/assets/seed_images_named/icon_S2_stardust.png

# 4. 批量下载 GUI bundle 图标（extraRes bundle）
#    GUI bundle 路径通常是 gui/texture/icon/icon_xxx.png
#    plant bundle 路径通常是 model/v4/Crop_XXX_Seed/spriteFrame
```

`find-cdn-resource.js` 内部逻辑：
1. 扫描最新 QQ 农场 miniapp_src 目录（按 tsdk.wasm mtime 选最新）；
2. 查 miniapp_src 下的 Cocos 资源清单，从 bundle/path 组装 CDN URL；
3. 直接 fetch CDN URL，不经过 miniapp 运行时缓存；
4. 输出完整文件（不用解码 ASTC）。

**常见 bundle 映射**：

| 素材类型 | 官方 bundle | CDN path 前缀 |
| --- | --- | --- |
| 种子/作物图 | plant | `model/v4/Crop_XXX_Seed/spriteFrame` |
| GUI 道具图标 | extraRes | `gui/texture/icon/icon_xxx` |
| 活动面板 UI | 活动专属 bundle | 从活动 Prefab 查 |
| Spine/图集 | mainscene / delayRes | 同上 |

### 打包注意事项

#### manifest.json 编码

**绝对不能用 PowerShell `Set-Content` 写 manifest.json**——它会加 UTF-8 BOM
（`0xEF 0xBB 0xBF`），宿主 `JSON.parse` 直接报
`Unexpected token '﻿', "﻿{ "i"... is not valid JSON`。

**必须用 Node.js `fs.writeFileSync` 或 adm-zip**：

```js
// 正确做法：Node.js 写文件不加 BOM
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2), 'utf8');
```

或者直接用 adm-zip 构建 zip，它默认不加 BOM：

```js
const AdmZip = require('adm-zip');
const zip = new AdmZip();
zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
zip.writeZipSync('material-plugin.zip');
```

#### zip 条目上限

宿主 zip.js 校验 `MAX_ENTRIES = 5000`（2026-10-27 之前是 2000，导致 v1.1.0
素材包 2055 条目上传报"zip 条目数非法"）。打素材插件时如果文件较多，提前
确认条目数。

#### 预置目录 vs 上传版本

- 预置目录 `plugins/material-plugin/` 在 **bootstrapBuiltins** 里注入为 v1.0.0
- 用户上传到 `data/plugins/installed/material-plugin/1.x.y/` 后，
  **bootstrap 只在 "内置版本 ≥ 已安装版本" 时才覆盖**
- 所以用户上传的 v1.1.0 > 预置 v1.0.0 → 重启后**保留用户版本**
- 这条规则在 `host.js.bootstrapBuiltins` 里

### 更新完整链（指南第四节变成三步）

1. **刷新素材**：

   ```bash
   # macOS 从 QQ 容器缓存导出全部植物阶段图 + Spine 拆图 + ASTC 解码
   npm run extract:plant-phases -- --install-tool --download-missing --all

   # 只更新本次活动的新作物
   npm run extract:plant-phases -- --assets Crop_6030,Crop_9003
   ```

2. **补 EventPlants.json**：把新植物的 seed_id → plant_id → fruit_id → asset_name
   → size → 等级写进 `core/src/gameConfig/EventPlants.json`；宿主会合成对应的
   seedItem / fruitItem。

3. **打包上传素材插件**：

   ```bash
   # 一站式脚本：可选 extract + 打包 + 上传
   node scripts/update-material-plugin.js --bump-patch

   # macOS 完整刷新：缓存导出 + CDN 补 + 打包
   node scripts/update-material-plugin.js --extract --download-missing --install-tool --bump-patch

   # 宿主已运行时直接上传（自动升级同 id 插件，不重启生效）
   node scripts/update-material-plugin.js --bump-patch --upload --host http://localhost:3007 --token $TOKEN
   ```

### 典型目录合并示例

假设插件 `material-plugin` 里有 `catalog/EventPlants.json`：

```json
[{ "id": 1029003, "seed_id": 29003, "fruit_id": 49003,
   "asset_name": "Crop_9003", "name": "星语铃花", "size": 2 }]
```

激活后宿主日志：

```
[配置] 已合并活动植物配置 (34 种)       ← 宿主 33 + provider 1
素材插件 material-plugin@1.0.1 已接入植物/种子/阶段图合并链路
```

活动页 / 土地 / 图鉴 中 `getPlantBySeedId(29003)` 和
`getItemImageById(29003)` 立即生效，无需重启。

### 优先级与冲突

- **宿主目录优先**：`core/src/gameConfig/` 下已存在的条目不会被 provider 覆盖，
  避免误升级把现有植物配置回滚。要彻底替换请先改宿主文件。
- **多素材插件**：按 manifest 里的激活顺序追加；后到的只补缺失。不支持多个
  素材插件同时更新同一 asset_name，最后一个的追加 phase 生效。
- **停用 / 卸载**：`host.js` 的 `deactivate` 会同步调
  `gameConfig.unregisterExternalGameConfigProvider(dir)`，重新加载后 provider
  的条目从 Map 中移除，宿主条目仍保留。

### 参考实现

- 打包脚本：`core/scripts/pack-material-plugin.js`
- 更新脚本：`core/scripts/update-material-plugin.js`
- 宿主合并点：`core/src/config/gameConfig.js` 的
  `registerExternalGameConfigProvider` / `unregister…` / `getExternal…`
- 静态回退：`core/src/controllers/admin.js` 的 `/game-config` 中间件链末尾

## 8. 安全边界

插件后端是受信任管理员上传的任意 JS（权限等同宿主进程）。缓解措施：
上传仅限 admin / super_admin 角色；zip 严格校验（大小、条目数、路径穿越、
符号链接、素材 sha256）；能力经 ctx 桥接；安装留痕与版本回滚。
若未来需要第三方分发插件，需在此之上增加签名机制（本期不做）。
