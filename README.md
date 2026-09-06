# @loostone/dsh-newapi-wallet

[DeepSeek Harness](https://github.com/deepseek-ai)（DSH）侧边栏的 **New API 网关账本**：显示当前路由在自建 [New API](https://github.com/Calcium-Ion/new-api) 网关上的**今日实际扣费**、按模型拆分、逐条消费明细与累计用量。

金额**只来自网关账本**，不做本地 `token × 单价` 估算。

派生自上游 MIT 项目 `dsh-gateway-wallet`（作者 MuAllen），派生说明与许可见 [NOTICES.txt](NOTICES.txt)，上游 [LICENSE](LICENSE) 全文原样保留。

## 为什么不是本地估算

一条真实调用的输入里通常大部分是**缓存命中**，而缓存命中按 `cache_ratio` 折价计费。用 `prompt + completion × 倍率` 直接乘单价会显著高估实际花费（缓存占比越高，偏差越大）。本插件因此只读网关已经算好的 `quota`，再按网关自身声明的换算常数显示为对应币种。

## 功能

- 侧边栏底部一个入口，徽标直接显示**今日实扣金额**
- 点开面板：今日花费与调用次数、今日 token 桶（输入 / 输出 / 缓存命中）、**今日按模型拆分**、最近若干条**逐条消费明细**（模型、单笔金额、token 构成、分组、令牌名）、账户累计与限流读数
- 多路由（多个上游网关）可切换查看
- 设置 → 插件 里一个可折叠卡片填访问令牌，**保存后即时生效，不用重启**
- 按需刷新：只在有会话运行、或面板打开时轮询；空闲且关闭时不发任何请求
- 站点没返回的字段就不显示对应行，并说明原因，不会静默换算成 0

## 安装

开源仓库，**全部写法都不需要 SSH 密钥或登录**（下面每条都在禁用 SSH 的环境里实测通过）：

```sh
# GitHub（推荐）：pnpm 会规范化为 hosted 规格，直接下载匿名 HTTPS tarball 并按 commit SHA 锁定
dsh plugin --profile web add "github:lzd-loostone/dsh-newapi-wallet#v0.1.5"

# 等价的显式 HTTPS git 地址（效果同上，锁文件里仍会记成 hosted 规格）
dsh plugin --profile web add "https://github.com/lzd-loostone/dsh-newapi-wallet.git#v0.1.5"

# 也可以直接给归档 tarball 地址
dsh plugin --profile web add "https://codeload.github.com/lzd-loostone/dsh-newapi-wallet/tar.gz/refs/tags/v0.1.5"

# Gitee 镜像（国内网络更稳；这条走 git over HTTPS，公开仓库匿名可读）
dsh plugin --profile web add "https://gitee.com/WB_LZD/dsh-newapi-wallet.git#v0.1.5"

# 或从内部 npm registry
dsh plugin --profile web add @loostone/dsh-newapi-wallet@0.1.5

# 或分发本地 tarball 文件
dsh plugin --profile web add <路径>\loostone-dsh-newapi-wallet-0.1.5.tgz
```

- **请钉 tag 或 commit**（`#v0.1.5`），不要写 `#main`/`#master`：pnpm 会把 tag 解析成具体 commit 并把 `codeload` 的 SHA 地址写进 `pnpm-lock.yaml`，同事之间装到的字节完全一致。
- 预构建产物 `lib/` 已入库，所以**安装不触发任何构建脚本**，也不会被 pnpm 的构建脚本策略拦截。
- 零运行时依赖。
- 用本地 `.tgz` 安装时注意：pnpm 会把它记成 `file:` 依赖，**装完那个文件不能删也不能挪**，否则以后每次 `dsh plugin` / `pnpm install` 都会因解析不到路径而失败。上面的 URL 方式无此约束。
- 装完或卸载后**需要重启 DSH**：bundle 只在启动时挂载，只刷新页面会因为 client roster 过期而白屏。

卸载：

```sh
dsh plugin --profile web remove @loostone/dsh-newapi-wallet
```

本插件不写任何私有数据文件，卸载即彻底清除。

## 配置

New API 网页端 **个人设置 → 访问令牌** 生成一串（**不是** `sk-` 开头的模型调用密钥）。

DSH **设置 → 插件**，展开「New API 账本」卡片填入；等价写法是直接写 `settings.yaml`：

```yaml
newapi-wallet:
  accessToken: '<New API 访问令牌>'
  routeAccessTokens:      # 可选：按 DSH 路由分别覆盖
    '<路由名>': '<该路由使用的访问令牌>'
  refreshMs: 60000        # 可选：自动刷新间隔，实际夹在 [10s, 10min]
```

⚠️ 访问令牌以**明文**存在设置文件里，请按密码对待：不要提交到仓库、不要贴进聊天或工单。未配置令牌时面板会明确提示去设置里填，而不是显示 0 假装正常。

网关地址与模型调用密钥仍来自 DSH 原有的 LLM 路由配置，本插件不复制一份、也不写回。

## 计费口径

不同 New API 实例的换算常数不一样，所以**运行时从网关 `/api/status` 读取**，不写死：

```
显示金额 = quota / quota_per_unit × usd_exchange_rate      （币种取 quota_display_type）
quota    = (未缓存输入 + 缓存命中 × cache_ratio + 输出 × completion_ratio) × model_ratio × group_ratio
```

`/api/pricing` 里的模型倍率只用于对照与展示参考，**不参与算钱**：面板上的每一笔都来自网关已经记账的结果。

## 使用的接口

| 接口 | 凭据 | 用途 |
| --- | --- | --- |
| `/api/status` | 匿名 | 读取换算常数与站点信息 |
| `/api/pricing` | 匿名 | 模型倍率（参考用） |
| `/api/user/self` | 访问令牌 | 账户、累计用量 |
| `/api/log/self/stat` | 访问令牌 | 当前窗口 quota / rpm / tpm |
| `/api/data/self` | 访问令牌 | 今日与区间花费、按模型拆分 |
| `/api/log/self` | 访问令牌 | 逐条消费明细 |
| `/api/usage/token/`、`/api/log/token` | — | 仅用于识别网关类型（路由存在即算命中，含被限流的情况），不参与取数 |

部分实例会对 token 级接口做限流，因此本插件不会把它们放进轮询路径。

## 开发

```sh
npm i --no-save --prefix .build-deps esbuild
node scripts/build.mjs        # 生成 lib/index.js 与 lib/client.js(+map)
DSH_TEST_TOKEN=<访问令牌> DSH_TEST_ORIGIN=<网关地址> node test/harness.mjs
```

`test/harness.mjs` 不启动 DSH：用最小假 Cordis 上下文加载构建产物，走完「设置注册 → 取令牌 → 请求网关 → 回环路由出账本」全链路，并断言响应体不含任何凭据。它需要两个环境变量，仓库里不含任何真实地址或密钥。

构建上有两处不能图省事：`@deepseek-ai/schemastery` 与其依赖必须**内联**进宿主半（宿主环境不提供）；前端 bundle 的 `__ModuleLoader__` id 必须等于**包名**。`scripts/build.mjs` 已经处理好，别退回上游的 `--external:@deepseek-ai/*`。

## 排错

- **设置页看不到卡片**：该座位（`settings.plugin.item`）是 keyed，`key` 必须等于宿主注册的设置命名空间（这里是 `newapi-wallet`）；卡片显示与否是「宿主 `settings.describe()` 服务的命名空间」与「已注册的卡片」的交集，不相交就静默不渲染。
- **命名空间注册了却没生效 / 卡片拿不到服务**：取服务必须用 `ctx.inject(['settings'], …)` **等待**，不能在 `apply()` 里 `ctx.get('settings')` 取一次——服务可能还没组合好。客户端取 `settingsScope` 同理。
- **改了 `dsh.client.inject` 或装卸插件后前端无变化**：需要重启 DSH（见上）。
- **金额与站点不一致**：先核对 `/api/status` 的 `quota_per_unit` / `usd_exchange_rate` / `quota_display_type` 是否被本插件读到；读不到时面板会说明而不是猜。
- **面板显示 forbidden**：本插件的只读路由只接受来自本机的请求。若你的 DSH 后端不是跑在本机，需要改走宿主 RPC。

## 已知限制

- 只统计经过网关的模型调用；网关未记账的请求不在内。金额以网关账本为准，不构成对账凭证。
- 访问令牌是用户级的：看到的是该令牌所属账户的花费，不是整组总额（需要组总额请用管理账户的令牌）。
- 逐条明细与 DSH 本地消息目前按时间 + 模型对应，尚未与 `request_id` 严格绑定。
- New API 若改版接口字段，对应行留空并说明原因，不会静默换算。

## 许可与免责声明

MIT。上游 `dsh-gateway-wallet` 的 MIT 许可与版权声明完整保留于 [LICENSE](LICENSE)。

本软件按「现状」提供，与 DeepSeek、New API 及各中转服务无隶属或背书关系，作者不对使用本插件造成的损失承担责任。
