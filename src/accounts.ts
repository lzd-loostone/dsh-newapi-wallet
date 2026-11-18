/**
 * 多账号：把配置里「账号键 → { 名字, 令牌 }」解析成按顺序的账号列表，并给出不泄露明文的稳定指纹。
 *
 * 为什么键和名字分开：键是稳定 id（cache 键、写入路径都用它），名字是用户随时可改的显示名。
 * 改名只写 name 子路径，令牌不动——这是宿主 applyPathOp 的稀疏合并给的保证。
 *
 * 为什么指纹要哈希：账本缓存键、日志里都不能出现令牌明文。
 */
import { createHash } from 'node:crypto'

export interface WalletAccount {
  /** 配置里的稳定键（形如 a1）。 */
  key: string
  /** 用户起的显示名；为空时回退「账号N」。 */
  name: string
  /** 访问令牌明文，只在宿主进程内使用，绝不进快照。 */
  token: string
}

/** 上限：再多就是误填，且每账号每轮都要翻账本。 */
const MAX_ACCOUNTS = 8

/** 令牌的稳定短指纹（sha256 前 8 位），用于缓存键与日志。 */
export function accountKeyForToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8)
}

function readEntry(value: unknown): { name: string; token: string } {
  if (value === null || typeof value !== 'object') return { name: '', token: '' }
  const entry = value as { name?: unknown; token?: unknown }
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  const token = typeof entry.token === 'string' ? entry.token.trim() : ''
  return { name, token }
}

/**
 * 解析账号列表。规则：
 *   - 空令牌的条目直接丢弃（配置页留空 = 该行没填令牌，不该占一个账号）；
 *   - 同一个令牌出现两次只保留第一条（缓存键、合并都会重复计数）；
 *   - 名字为空回退「账号N」，N 是它在结果里的序号；
 *   - 超过 8 个截断；
 *   - 一条都没有时，才把旧版单令牌 accessToken 迁移成「默认账号」。
 */
export function parseAccounts(config: { accounts?: unknown; accessToken?: unknown } | undefined): WalletAccount[] {
  const out: WalletAccount[] = []
  const seen = new Set<string>()
  const dict = config?.accounts
  if (dict !== null && typeof dict === 'object' && !Array.isArray(dict)) {
    for (const [key, value] of Object.entries(dict as Record<string, unknown>)) {
      if (out.length >= MAX_ACCOUNTS) break
      const entry = readEntry(value)
      if (entry.token === '' || seen.has(entry.token)) continue
      seen.add(entry.token)
      out.push({ key, name: entry.name !== '' ? entry.name : `账号${out.length + 1}`, token: entry.token })
    }
  }
  if (out.length === 0) {
    const legacy = typeof config?.accessToken === 'string' ? config.accessToken.trim() : ''
    if (legacy !== '') out.push({ key: 'legacy', name: '默认账号', token: legacy })
  }
  return out
}
