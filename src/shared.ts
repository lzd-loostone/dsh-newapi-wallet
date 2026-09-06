/**
 * Host / client 共享的钱包快照。金额只来自网关账本，不含本地估价。
 * 访问令牌（New API 访问令牌）与 sk- 模型密钥都绝不进入浏览器，只以脱敏形态出现。
 */

/** 网关账本里的一笔金额。本部署展示币种为 CNY，字段永远带 currency: 'CNY'。 */
export interface Money {
  /** NewAPI 内部额度（quota 点数，非人民币）。 */
  quota?: number
  /**
   * 美元。仅当站点真的公布了非 1 的 usd_exchange_rate 时才填写；
   * 本公司网关汇率为 1，此字段通常缺省。界面永不打印 "$"。
   */
  usd?: number
  /** 展示金额（人民币）。quota / quota_per_unit × usd_exchange_rate。 */
  display?: number
  /** 展示用币种，本 fork 恒为 'CNY'。 */
  currency?: string
}

/** 站点账本里的 token 桶。缺字段表示该路由没配密钥或站点没公布，不是 0。 */
export interface TokenBuckets {
  requests?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
}

/** 今日按模型拆分的一行（来自 /api/data/self 的聚合行）。 */
export interface TodayModelRow {
  model: string
  /** 该模型今日实扣 quota 点数。 */
  quota: number
  /** 该模型今日调用次数。 */
  calls: number
  /** 该模型今日 token 消耗（token_used 合计）。 */
  tokens?: number
}

/** 逐条消费明细里的一笔（来自 /api/log/self?type=2）。 */
export interface CallRecord {
  /** 创建时间（毫秒）。 */
  createdAt: number
  model?: string
  /** 本笔实扣 quota 点数。 */
  quota?: number
  /** 本笔实扣金额（人民币）。 */
  amount?: Money
  promptTokens?: number
  completionTokens?: number
  /** 命中缓存的 prompt token 数（从 other JSON 字符串里解析）。 */
  cacheTokens?: number
  requestId?: string
  group?: string
  tokenName?: string
}

export interface WalletSnapshot {
  ok: true
  fetchedAt: number
  /** DSH 当前默认路由。 */
  route: string
  /** 路由显示名。 */
  displayName: string
  /** 当前默认模型。 */
  model?: string
  /** 网关侧账户标识（display_name）。 */
  keyName?: string
  /** 脱敏 sk- key，如 sk-••••5a2d；只说明「配了模型密钥」，不用于查账。 */
  keyHint?: string
  origin: string
  /** 认出的账本程序。 */
  scheme?: 'newapi'
  /** 剩余余额（/api/user/self 的 quota）。 */
  remaining?: Money
  /** 累计已用（/api/user/self 的 used_quota）。 */
  used?: Money
  /** 今日消费（实扣）。读不到则省略。 */
  today?: Money & { requests?: number }
  todayTokens?: TokenBuckets
  totalTokens?: TokenBuckets
  /** 今日按模型拆分。 */
  todayModels?: TodayModelRow[]
  /** 最近逐条消费明细（最新在前）。 */
  recentCalls?: CallRecord[]
  rate?: { rpm?: number; tpm?: number }
  todayAvailable: boolean
  todayUnavailableReason?: string
  isAvailable?: boolean
}

export interface WalletError {
  ok: false
  error: string
  detail?: string
}

/** 浏览器可见的账户条目。完整令牌与 sk- key 都不会出现。 */
export interface AccountListItem {
  route: string
  displayName: string
  origin: string
  host: string
  /** 脱敏 sk- key 提示；只说明「这条路由配了模型密钥」。 */
  keyHint?: string
  /** 该路由是否配置了 sk- 模型密钥（供请求模型用，不用于查账）。 */
  hasCredential: boolean
  /** 该路由是否配置了 New API 访问令牌（查账凭据）。 */
  hasAccessKey: boolean
  /** DSH 当前默认模型所在的路由。 */
  isCurrent: boolean
}

/** 一次回环响应：账户名单 + 选中路由的账本 + 浏览器轮询间隔。 */
export interface WalletBundle {
  accounts: AccountListItem[]
  selected: string
  /** 毫秒；由宿从设置 newapi-wallet.refreshMs 解析并夹到 [10s,10min] 后下发。 */
  refreshMs?: number
  wallet: WalletSnapshot | WalletError
}

export type WalletPayload = WalletBundle | WalletError
