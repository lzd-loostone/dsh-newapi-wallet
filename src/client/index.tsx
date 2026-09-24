/**
 * 侧边栏左下角入口：与「用量账本」同槽。点击弹出站点真实账本（今日实扣、
 * 按模型拆分带金额、输入/输出/缓存分桶金额、逐条明细），顶部是已配置的
 * New API 供应商卡片，令牌就在卡片里配置——不再依赖设置页的任何座位。
 * 金额一律人民币（¥）；访问令牌只经回环 POST 写进宿主 Config，永不回传浏览器。
 *
 * 本模块刻意不 import 任何 Harness Client 包：0.1.7 改过 primitives 的图标导出名，
 * 那次改名让整个座位被 retire。图标与「点外面收起」都自己实现。
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  AccountListItem,
  CallRecord,
  DailyPoint,
  Money,
  TodayModelRow,
  TokenBuckets,
  UsageAmounts,
  WalletBundle,
  WalletError,
  WalletPayload,
  WalletSnapshot,
} from '../shared.ts'

type SeatProps = PropsRuntime<'sidebar.footer.action'>

const PATH = '/api/newapi-wallet'
const LOGGER_KEY = 'loostone-newapi-wallet'
const DEFAULT_REFRESH_MS = 45_000
const STYLE_ID = 'loostone-newapi-wallet/panel.css'

const CSS = [
  "div:has(> [data-slot='sidebar.footer.action']){flex-wrap:wrap;gap:6px}",
  "[data-slot='sidebar.footer.action']:has(.gww_rail){flex:none;width:36px}",
  '.gww_layer{flex:0 0 100%;min-width:0;align-items:center;height:49px;margin:8px 0 0;display:flex;position:relative}',
  '.gww_badge{width:100%;min-width:0;height:49px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:0 8px 0 6px;font-family:inherit;font-size:14px;display:inline-flex;position:relative}',
  '.gww_badge:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
  '.gww_badge[data-active]{background:var(--dsw-alias-interactive-bg-hover)}',
  '.gww_badgeIcon{flex:none;display:inline-flex;align-items:center;position:relative}',
  '.gww_dot{position:absolute;top:-2px;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 1.5px var(--dsw-alias-bg-base);pointer-events:none}',
  '.gww_badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
  '.gww_badgeValue{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}',
  '.gww_layer.gww_rail{flex:none;width:36px;height:36px;margin:0;overflow:visible}',
  '.gww_layer.gww_rail .gww_badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;padding:0;overflow:visible}',
  '.gww_layer.gww_rail .gww_badgeIcon{position:static}',
  '.gww_layer.gww_rail .gww_dot{top:1px;right:1px}',
  '.gww_layer.gww_rail .gww_badgeLabel,.gww_layer.gww_rail .gww_badgeValue{display:none}',
  '.gww_panel{z-index:30;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background-color:Canvas;background-image:linear-gradient(rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1),rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1));width:380px;max-width:calc(100vw - 24px);max-height:76vh;box-shadow:var(--dsw-shadow-lv2);border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden;backdrop-filter:none;-webkit-backdrop-filter:none}',
  '.gww_header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:10px 12px;display:flex;gap:8px}',
  '.gww_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;white-space:nowrap}',
  '.gww_headerActions{align-items:center;gap:2px;display:flex;flex:none}',
  '.gww_iconButton{cursor:pointer;width:26px;height:26px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}',
  '.gww_iconButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.gww_iconButton[data-busy]{opacity:.5;cursor:default}',
  '.gww_body{flex:1;min-height:0;padding:12px 14px 14px;overflow-y:auto}',
  '.gww_content[data-loading]{opacity:.45}',
  '.gww_badgeValue[data-wait]{opacity:.55}',
  '.gww_who{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.gww_whoName{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}',
  '.gww_stat{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;min-width:0}',
  '.gww_statValue{color:var(--dsw-alias-label-primary);font-size:16px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gww_statLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-top:2px}',
  '.gww_section{margin-top:14px}',
  '.gww_sectionTitle{color:var(--dsw-alias-label-tertiary);margin:0 0 6px;font-size:11px;line-height:16px;font-weight:500}',
  '.gww_rows{display:flex;flex-direction:column}',
  '.gww_row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px}',
  '.gww_row:last-child{border-bottom:0}',
  '.gww_rowName{color:var(--dsw-alias-label-tertiary)}',
  '.gww_rowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
  '.gww_rowValue[data-wrap]{white-space:normal;text-align:right;max-width:68%;word-break:break-all}',
  '.gww_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:8px 0 0}',
  '.gww_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}',
  '.gww_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px;margin:8px 0 0}',
  '.gww_fail{margin:0 0 10px}',
  '.gww_fail .gww_warn{margin:0}',
  '.gww_fail .gww_note{margin:4px 0 0}',
  '.gww_fail .gww_retry{margin-top:6px}',
  '.gww_ok{color:var(--dsw-alias-state-success-primary)}',
  '.gww_footer{color:var(--dsw-alias-label-caption);border-top:1px solid var(--dsw-alias-border-l1);margin-top:14px;padding-top:8px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
  '.gww_retry{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:8px;padding:3px 10px;font:inherit;font-size:12px}',
  '.gww_cards{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;padding:0 0 8px;margin:0 0 10px;scrollbar-width:thin}',
  '.gww_card{flex:0 0 auto;min-width:136px;max-width:200px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}',
  '.gww_card[data-active]{border-color:var(--dsw-alias-label-tertiary)}',
  '.gww_cardPick{cursor:pointer;text-align:left;color:inherit;background:0 0;border:none;padding:8px 10px 6px;font-family:inherit;display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.gww_cardPick:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l1)}',
  '.gww_cardName{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_cardHost{color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_cardState{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}',
  '.gww_cardState[data-ok]{color:var(--dsw-alias-state-success-primary)}',
  '.gww_cardConfig{cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:none;border-top:1px solid var(--dsw-alias-border-l1);padding:4px 10px;font:inherit;font-size:11px;line-height:16px}',
  '.gww_cardConfig:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid)}',
  '.gww_dialogLayer{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgb(0 0 0 / .32)}',
  '.gww_dialog{box-sizing:border-box;width:320px;max-width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,Canvas);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:14px}',
  '.gww_dialogTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;margin:0 0 6px}',
  '.gww_fieldLabel{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:10px 0 4px}',
  '.gww_input{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font:inherit;font-size:12px}',
  '.gww_input:focus{outline:none;border-color:var(--dsw-alias-label-tertiary)}',
  '.gww_scopeRow{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:8px;cursor:pointer}',
  '.gww_dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
  '.gww_dialogActions .gww_retry{margin-top:0}',
  '.gww_primary{cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 14px;font:inherit;font-size:12px}',
  '.gww_primary:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
  '.gww_primary[data-busy]{opacity:.5;cursor:default}',
  '.gww_call{border-bottom:1px solid var(--dsw-alias-border-l1);padding:6px 0}',
  '.gww_call:last-child{border-bottom:0}',
  '.gww_callHead{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:18px}',
  '.gww_callModel{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_callAmount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none}',
  '.gww_callMeta{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin-top:2px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_heat{--gww-heat:#31a06b;display:flex;flex-direction:column;gap:6px}',
  '.gww_heat{--h0:var(--dsw-alias-bg-layer-3);--h1:#9be9a8;--h1:light-dark(#9be9a8,#0e4429);--h2:#40c463;--h2:light-dark(#40c463,#006d32);--h3:#30a14e;--h3:light-dark(#30a14e,#26a641);--h4:#216e39;--h4:light-dark(#216e39,#39d353)}',
  '.gww_heat{--t1:light-dark(#14532d,#d6f5e2);--t2:light-dark(#0b3a20,#eafff2);--t3:#062d16;--t4:light-dark(#ffffff,#052411)}',
  '.gww_heatHead{gap:5px;display:grid;grid-template-columns:repeat(7,1fr)}',
  '.gww_heatWd{text-align:center;color:var(--dsw-alias-label-caption);font-size:10px;line-height:12px}',
  '.gww_heatGrid{gap:5px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}',
  '.gww_heatCell{aspect-ratio:5/4;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);transition:transform .12s ease,box-shadow .12s ease}',
  '.gww_heatCell[data-tier="0"]{background:var(--h0)}',
  '.gww_heatCell[data-tier="1"]{color:var(--t1);background:var(--h1)}',
  '.gww_heatCell[data-tier="2"]{color:var(--t2);background:var(--h2)}',
  '.gww_heatCell[data-tier="3"]{color:var(--t3);background:var(--h3)}',
  '.gww_heatCell[data-tier="4"]{color:var(--t4);background:var(--h4)}',
  '.gww_heatCell[data-none]{border:1px dashed var(--dsw-alias-border-l2);background:0 0}',
  '.gww_heatCell[data-future]{border:none;background:0 0}',
  '.gww_heatCell[data-today]{box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--gww-heat) 85%,Canvas)}',
  '.gww_heatCell:not([data-future]){cursor:default;position:relative}',
  '.gww_heatCell:not([data-future]):hover{transform:scale(1.06);box-shadow:0 0 0 2px color-mix(in oklab,var(--gww-heat) 45%,transparent),0 2px 8px color-mix(in oklab,var(--gww-heat) 25%,transparent);z-index:2}',
  '.gww_tip{position:absolute;transform:translate(-50%,-100%);background:var(--dsw-alias-bg-overlay,Canvas);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:var(--dsw-shadow-lv2);padding:6px 9px;pointer-events:none;white-space:nowrap;z-index:6;display:flex;flex-direction:column;gap:1px}',
  '.gww_tipDate{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}',
  '.gww_tipVal{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums}',
  '.gww_tipSub{color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px}',
  '.gww_heatLegend{align-items:center;gap:4px;display:flex;justify-content:flex-end;color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}',
  '.gww_heatSwatch{width:10px;height:10px;border-radius:3px;display:inline-block}',
  '.gww_heatSwatch[data-lv="1"]{background:var(--h1)}',
  '.gww_heatSwatch[data-lv="2"]{background:var(--h2)}',
  '.gww_heatSwatch[data-lv="3"]{background:var(--h3)}',
  '.gww_heatSwatch[data-lv="4"]{background:var(--h4)}',
  '.gww_heatDash{width:10px;height:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:3px;display:inline-block;margin-left:6px}',
].join('')

function ensureCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = LOGGER_KEY
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** 金额展示：一律 ¥ 人民币。本插件的 Money 永远带 display（CNY）。 */
function fmtMoney(money: Money | undefined): string {
  if (money === undefined) return '—'
  if (typeof money.display === 'number') {
    const n = money.display
    return `¥${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`
  }
  // display 缺失时回退 quota 点数展示，绝不换算、绝不打印 $。
  return typeof money.quota === 'number' ? `${money.quota.toLocaleString()} 额度` : '—'
}

function fmtCount(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
}

/** 花费低于提示阈值时才打提示点（阈值见下一行）。 */
const LOW_CNY = 5

function isLowBalance(money: Money | undefined): boolean {
  if (money === undefined) return false
  if (typeof money.display === 'number' && Number.isFinite(money.display)) {
    return money.display < LOW_CNY
  }
  return false
}

function agoLabel(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 90) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function hostOf(origin: string): string {
  try {
    const url = new URL(origin)
    return url.port === '' ? url.hostname : `${url.hostname}:${url.port}`
  } catch {
    return origin
  }
}

/* ------------------------------------------------------------------ */
/* 图标：内联 SVG，不依赖任何 Harness Client 包                            */
/* ------------------------------------------------------------------ */

function IconWallet({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.75 6.5h12.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.25" cy="9.75" r="1" fill="currentColor" />
    </svg>
  )
}

function IconRefresh({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.47-3.54" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13.6 2.6v3.2h-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClose({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 取数：GET 读账本，POST 写令牌（都走本机回环路由）                        */
/* ------------------------------------------------------------------ */

async function loadWallet(route: string | undefined, signal: AbortSignal): Promise<WalletPayload> {
  const query = route !== undefined && route !== '' ? `?route=${encodeURIComponent(route)}` : ''
  const response = await fetch(PATH + query, { headers: { accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<WalletPayload>
}

/** 写令牌。route 缺省 = 写全局默认令牌，否则只写这条路由的覆盖。 */
async function saveAccessToken(body: { route?: string; accessToken: string }): Promise<void> {
  const response = await fetch(PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.ok) return
  const payload = await response.json().catch(() => undefined) as WalletError | undefined
  throw new Error(payload?.detail ?? saveErrorCopy(payload?.error))
}

function saveErrorCopy(error: string | undefined): string {
  if (error === 'no-settings') return '设置服务不可用，暂时存不了令牌。'
  if (error === 'settings-write-failed') return '写入设置文件失败。'
  if (error === 'forbidden') return '请求来源不被信任，已拒绝。'
  if (error === 'unsupported-media-type' || error === 'bad-request') return '请求格式不对。'
  return error !== undefined && error !== '' ? `保存失败：${error}` : '保存失败。'
}

function isBundle(value: WalletPayload | undefined): value is WalletBundle {
  return value !== undefined && 'accounts' in value
}

function isWalletError(value: WalletPayload | undefined): value is WalletError {
  return value !== undefined && 'ok' in value && value.ok === false
}

function walletErrorCopy(error: string): string {
  if (error === 'no-access-token') return '这条供应商还没配访问令牌。点卡片上的「配置令牌」填一个。'
  if (error === 'unknown-account') return '名单里没有这条路由。'
  if (error === 'no-provider') return '还没有配置带地址的模型路由。'
  if (error === 'no-newapi') return '已配置的模型路由里没有一条是 New API 站点。'
  if (error === 'timeout' || error === 'unreachable') return '连不上站点。'
  if (error === 'internal' || error === 'unexpected response') return '本机读取出错。'
  return `账本：${error}`
}

/** 点面板外面就收起。自己实现，省掉 primitives 依赖。 */
function useDismissOnOutsidePointer(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const onPointer = (event: Event): void => {
      const node = ref.current
      const target = event.target as Node | null
      if (node === null || target === null || node.contains(target)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [ref, open])
}

/* ------------------------------------------------------------------ */
/* 供应商卡片：横向滚动，每张卡自己配令牌                                  */
/* ------------------------------------------------------------------ */

function AccountCards({
  accounts,
  selected,
  onSelect,
  onConfigure,
}: {
  accounts: AccountListItem[]
  selected: string
  onSelect: (route: string) => void
  onConfigure: (route: string) => void
}) {
  if (accounts.length === 0) return null
  return (
    <div className="gww_cards" role="tablist" aria-label="New API 供应商">
      {accounts.map(account => (
        <div
          key={account.route}
          className="gww_card"
          {...account.route === selected ? { 'data-active': '' } : {}}
        >
          <button
            type="button"
            role="tab"
            className="gww_cardPick"
            aria-selected={account.route === selected}
            onClick={() => onSelect(account.route)}
          >
            <span className="gww_cardName">{account.displayName}</span>
            <span className="gww_cardHost">{account.host}</span>
            <span className="gww_cardState" {...account.hasAccessKey ? { 'data-ok': '' } : {}}>
              {account.hasAccessKey ? '令牌已配' : '未配令牌'}
              {account.isCurrent ? ' · 当前' : ''}
            </span>
          </button>
          <button type="button" className="gww_cardConfig" onClick={() => onConfigure(account.route)}>
            {account.hasAccessKey ? '改令牌' : '配置令牌'}
          </button>
        </div>
      ))}
    </div>
  )
}

/** 令牌弹窗：填/改这条供应商的访问令牌，或存成全局默认。 */
function TokenDialog({
  account,
  saving,
  failure,
  onSave,
  onClose,
}: {
  account: AccountListItem
  saving: boolean
  failure: string | undefined
  onSave: (token: string, scope: 'route' | 'global') => void
  onClose: () => void
}) {
  const [token, setToken] = useState('')
  const [scope, setScope] = useState<'route' | 'global'>('route')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const submit = (): void => {
    if (!saving) onSave(token.trim(), scope)
  }
  return (
    <div
      className="gww_dialogLayer"
      role="presentation"
      onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="gww_dialog" role="dialog" aria-modal="true" aria-label={`配置 ${account.displayName} 的访问令牌`}>
        <div className="gww_dialogTitle">配置访问令牌</div>
        <p className="gww_note">
          New API「访问令牌」，在站点用户中心生成——不是 sk- 模型密钥。保存后立即生效，不用重启。
        </p>
        <label className="gww_fieldLabel" htmlFor="gww_token">访问令牌</label>
        <input
          id="gww_token"
          ref={input}
          type="password"
          className="gww_input"
          value={token}
          autoComplete="off"
          placeholder={account.hasAccessKey ? '••••••••（留空保存即清除）' : '粘贴访问令牌'}
          onChange={event => setToken(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') submit() }}
        />
        <label className="gww_scopeRow">
          <input type="radio" name="gww_scope" checked={scope === 'route'} onChange={() => setScope('route')} />
          只用于 {account.displayName}
        </label>
        <label className="gww_scopeRow">
          <input type="radio" name="gww_scope" checked={scope === 'global'} onChange={() => setScope('global')} />
          作为所有供应商的默认令牌
        </label>
        {failure !== undefined && <p className="gww_error">{failure}</p>}
        <div className="gww_dialogActions">
          <button type="button" className="gww_retry" onClick={onClose}>取消</button>
          <button
            type="button"
            className="gww_primary"
            {...saving ? { 'data-busy': '' } : {}}
            onClick={submit}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BucketRows({
  title,
  buckets,
  amounts,
}: {
  title: string
  buckets: TokenBuckets
  amounts?: UsageAmounts
}) {
  const rows: Array<{ name: string; value: string; amount?: Money }> = [
    { name: '请求', value: fmtCount(buckets.requests) },
    { name: '输入(未缓存)', value: fmtCount(buckets.inputTokens), amount: amounts?.input },
    { name: '输出', value: fmtCount(buckets.outputTokens), amount: amounts?.output },
  ]
  if (buckets.cacheReadTokens !== undefined) rows.push({ name: '缓存命中', value: fmtCount(buckets.cacheReadTokens), amount: amounts?.cacheRead })
  if (buckets.totalTokens !== undefined) rows.push({ name: '合计 token', value: fmtCount(buckets.totalTokens), amount: amounts?.total })
  return (
    <div className="gww_section">
      <div className="gww_sectionTitle">{title}</div>
      <div className="gww_rows">
        {rows.map(row => (
          <div key={row.name} className="gww_row">
            <span className="gww_rowName">{row.name}</span>
            <span className="gww_rowValue">
              {row.value}
              {row.amount !== undefined && <>{' · '}{fmtMoney(row.amount)}</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelRows({ models }: { models: TodayModelRow[] }) {
  return (
    <div className="gww_section">
      <div className="gww_sectionTitle">今日按模型</div>
      <div className="gww_rows">
        {models.map(row => (
          <div
            key={row.model}
            className="gww_row"
            title={'token ' + fmtCount(row.tokens) + ' · 账本额度点 ' + fmtCount(row.quota)}
          >
            <span className="gww_rowName">{row.model}</span>
            <span className="gww_rowValue">
              {fmtMoney(row.amount ?? { quota: row.quota, display: row.quota === 0 ? 0 : undefined, currency: 'CNY' })}
              {' · '}
              {fmtCount(row.calls)} 次
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CallRows({ calls }: { calls: CallRecord[] }) {
  return (
    <div className="gww_section">
      <div className="gww_sectionTitle">最近调用</div>
      <div className="gww_rows">
        {calls.map((call, index) => {
          const meta = [
            clockLabel(call.createdAt),
            call.promptTokens !== undefined || call.completionTokens !== undefined
              ? `${fmtCount(call.promptTokens ?? 0)}→${fmtCount(call.completionTokens ?? 0)} tok`
              : undefined,
            call.cacheTokens !== undefined ? `缓存 ${fmtCount(call.cacheTokens)}` : undefined,
            call.tokenName !== undefined ? `令牌 ${call.tokenName}` : undefined,
            call.requestId !== undefined ? `#${call.requestId.slice(-8)}` : undefined,
          ].filter(value => value !== undefined)
          return (
            <div key={call.requestId ?? `${call.createdAt}-${index}`} className="gww_call">
              <div className="gww_callHead">
                <span className="gww_callModel">{call.model ?? '未知模型'}</span>
                <span className="gww_callAmount">{fmtMoney(call.amount)}</span>
              </div>
              <div className="gww_callMeta">{meta.join(' · ')}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 近 4 周消费热力图：行 0=本周（列 周一→周日），行 3=三周前。      */
/* 颜色 = 当日实扣（GitHub 贡献图色板，线性 20/45/70% 分 4 档）；   */
/* 格内显示日号（2/3/4…），每月 1 号显示「X月」；悬停弹卡，无点击。  */
/* ------------------------------------------------------------------ */

const HEAT_WEEKS = 4
const HEAT_WEEKDAY_CHARS = ['一', '二', '三', '四', '五', '六', '日']

function localDateStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

interface HeatCell {
  key: string
  dateStr: string
  weekday: string
  future: boolean
  point: DailyPoint | undefined
}

interface HeatTip {
  left: number
  top: number
  date: string
  weekday: string
  text: string
  sub: string | undefined
}

function HeatmapSection({ points }: { points: DailyPoint[] }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<HeatTip | undefined>(undefined)
  const byDate = new Map(points.map(point => [point.date, point]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayStr = localDateStr(today)
  const wdIndex = (today.getDay() + 6) % 7
  const maxQuota = points.reduce((acc, p) => (p.available && p.quota > acc ? p.quota : acc), 0)
  let totalCny = 0
  for (const p of points) {
    if (p.available && typeof p.amount?.display === 'number') totalCny += p.amount.display
  }
  // 线性阈值分档（占 28 天内最大值）：<20% / <45% / <70% / ≥70% → 1..4 档。
  // 之前用 √ 比例会把大多数天压进深档，深浅就"看不出差别"——别再压缩。
  const tierOf = (p: DailyPoint): number => {
    if (!p.available || p.quota <= 0 || maxQuota <= 0) return 0
    const r = p.quota / maxQuota
    return r >= 0.7 ? 4 : r >= 0.45 ? 3 : r >= 0.2 ? 2 : 1
  }
  const cells: HeatCell[] = []
  for (let row = 0; row < HEAT_WEEKS; row++) {
    for (let col = 0; col < 7; col++) {
      // 日历方向：行 0=三周前（最旧在上），最后一行=本周；列恒为周一→周日。
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - wdIndex - (HEAT_WEEKS - 1 - row) * 7 + col)
      const dateStr = localDateStr(d)
      cells.push({
        key: `${row}-${col}`,
        dateStr,
        weekday: '日一二三四五六'[d.getDay()] ?? '',
        future: dateStr > todayStr,
        point: byDate.get(dateStr),
      })
    }
  }
  const enter = (event: React.MouseEvent<HTMLDivElement>, cell: HeatCell): void => {
    const grid = gridRef.current
    if (grid === null) return
    const cr = event.currentTarget.getBoundingClientRect()
    const gr = grid.getBoundingClientRect()
    const p = cell.point
    let text: string
    let sub: string | undefined
    if (p === undefined || !p.available) {
      text = '无数据'
    } else {
      text = fmtMoney(p.amount ?? { quota: p.quota, display: p.quota === 0 ? 0 : undefined, currency: 'CNY' })
      sub = p.calls !== undefined ? `${fmtCount(p.calls)} 次调用` : undefined
    }
    setTip({
      left: Math.min(Math.max(cr.left - gr.left + cr.width / 2, 52), gr.width - 52),
      top: cr.top - gr.top - 6,
      date: cell.dateStr,
      weekday: cell.weekday,
      text,
      sub,
    })
  }
  const leave = (): void => setTip(undefined)
  return (
    <div className="gww_section">
      <div className="gww_sectionTitle">
        近 4 周逐日实扣 · 合计 {totalCny < 1 && totalCny > 0 ? totalCny.toFixed(4) : totalCny.toFixed(2)} 元
      </div>
      <div className="gww_heat">
        <div className="gww_heatHead">
          {HEAT_WEEKDAY_CHARS.map(wd => <span key={wd} className="gww_heatWd">{wd}</span>)}
        </div>
        <div className="gww_heatGrid" ref={gridRef} onMouseLeave={leave}>
          {cells.map(cell => cell.future ? (
            <div key={cell.key} className="gww_heatCell" data-future="" />
          ) : (
            <div
              key={cell.key}
              className="gww_heatCell"
              {...cell.point !== undefined && cell.point.available
                ? { 'data-tier': String(tierOf(cell.point)) }
                : { 'data-none': '' }}
              {...cell.dateStr === todayStr ? { 'data-today': '' } : {}}
              onMouseEnter={event => enter(event, cell)}
            >
              {cell.point !== undefined
                ? (cell.dateStr.endsWith('-01')
                  ? `${Number(cell.dateStr.slice(5, 7))}月`
                  : Number(cell.dateStr.slice(8)))
                : ''}
            </div>
          ))}
          {tip !== undefined && (
            <div className="gww_tip" style={{ left: tip.left, top: tip.top }}>
              <span className="gww_tipDate">{tip.date.slice(5).replace('-', '/')} · 周{tip.weekday}</span>
              <span className="gww_tipVal">{tip.text}</span>
              {tip.sub !== undefined && <span className="gww_tipSub">{tip.sub}</span>}
            </div>
          )}
        </div>
        <div className="gww_heatLegend">
          <span>少</span>
          {[1, 2, 3, 4].map(lv => (
            <span key={lv} className="gww_heatSwatch" data-lv={lv} />
          ))}
          <span>多</span>
          <span className="gww_heatDash" aria-hidden="true" />
          <span>无数据</span>
        </div>
      </div>
    </div>
  )
}

function WalletBody({
  snapshot,
  wallet,
  error,
  fail,
  accounts,
  selected,
  loading,
  onSelect,
  onConfigure,
  onRetry,
}: {
  snapshot: WalletSnapshot | undefined
  wallet: WalletSnapshot | WalletError | undefined
  error: string | undefined
  fail: { title: string; note?: string } | undefined
  accounts: AccountListItem[]
  selected: string
  loading: 'block' | 'dim' | false
  onSelect: (route: string) => void
  onConfigure: (route: string) => void
  onRetry: () => void
}) {
  const cards = (
    <AccountCards
      accounts={accounts}
      selected={selected}
      onSelect={onSelect}
      onConfigure={onConfigure}
    />
  )
  if (loading === 'block') {
    return (
      <div>
        {cards}
        <p className="gww_note">读取中…</p>
      </div>
    )
  }
  if (snapshot === undefined && fail !== undefined) {
    return (
      <div>
        {cards}
        <div className="gww_fail">
          <p className="gww_warn">{fail.title}</p>
          {fail.note !== undefined && <p className="gww_note">{fail.note}</p>}
          <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
        </div>
      </div>
    )
  }
  if (error !== undefined && snapshot === undefined) {
    return (
      <div>
        {cards}
        <p className="gww_error">读不到账本。</p>
        <p className="gww_note">{error}</p>
        <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
      </div>
    )
  }
  if (wallet?.ok === false && snapshot === undefined) {
    return (
      <div>
        {cards}
        <p className="gww_warn">{walletErrorCopy(wallet.error)}</p>
        {wallet.detail !== undefined && <p className="gww_note">{wallet.detail}</p>}
        <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
      </div>
    )
  }
  if (snapshot === undefined) {
    return (
      <div>
        {cards}
        <p className="gww_note">读取中…</p>
      </div>
    )
  }

  const who = [snapshot.displayName, 'New API', snapshot.keyName]
    .filter(value => value !== undefined && value !== '')
    .join(' · ')

  return (
    <div>
      {cards}
      {fail !== undefined && (
        <div className="gww_fail">
          <p className="gww_warn">{fail.title}</p>
          {fail.note !== undefined && <p className="gww_note">{fail.note}</p>}
          <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
        </div>
      )}
      {loading === 'dim' && <p className="gww_note">读取中…</p>}
      <div className="gww_content" {...loading === 'dim' ? { 'data-loading': '' } : {}}>
      <div className="gww_who">{who}</div>
      <div className="gww_whoName">
        {snapshot.model !== undefined ? snapshot.model : ''}
      </div>

      <div className="gww_stats">
        <div className="gww_stat" {...isLowBalance(snapshot.remaining) ? { 'data-low': '' } : {}}>
          <div className="gww_statValue">{fmtMoney(snapshot.remaining)}</div>
          <div className="gww_statLabel">余额</div>
        </div>
        <div className="gww_stat">
          <div className="gww_statValue">
            {snapshot.todayAvailable ? fmtMoney(snapshot.today) : '—'}
          </div>
          <div className="gww_statLabel">今日实扣</div>
        </div>
        <div className="gww_stat">
          <div className="gww_statValue">{fmtMoney(snapshot.used)}</div>
          <div className="gww_statLabel">累计已用</div>
        </div>
      </div>

      {snapshot.today !== undefined && snapshot.today.requests !== undefined && (
        <p className="gww_note">今日 {fmtCount(snapshot.today.requests)} 次调用</p>
      )}
      {!snapshot.todayAvailable && snapshot.todayUnavailableReason !== undefined && (
        <p className="gww_note">站点没有开放今日统计。</p>
      )}
      {snapshot.isAvailable === false && (
        <p className="gww_warn">这个账户当前不可用。</p>
      )}
      {snapshot.isAvailable === true && fail === undefined && (
        <p className="gww_note gww_ok">账户可用</p>
      )}

      {snapshot.todayModels !== undefined && snapshot.todayModels.length > 0 && (
        <ModelRows models={snapshot.todayModels} />
      )}

      {snapshot.todayTokens !== undefined && (
        <BucketRows title="今日用量" buckets={snapshot.todayTokens} amounts={snapshot.todayAmounts} />
      )}
      {snapshot.todayLogsPartial === true && (
        <p className="gww_note">今日账单超过 1000 条，token 与金额拆分按最近 1000 条统计。</p>
      )}
      {snapshot.dailyHistory !== undefined && snapshot.dailyHistory.length > 0 && (
        <HeatmapSection points={snapshot.dailyHistory} />
      )}
      {snapshot.recentCalls !== undefined && snapshot.recentCalls.length > 0 && (
        <CallRows calls={snapshot.recentCalls} />
      )}

      <div className="gww_footer" title={new Date(snapshot.fetchedAt).toLocaleString()}>
        {hostOf(snapshot.origin)} · {loading === 'dim'
          ? '读取中…'
          : fail !== undefined
            ? `上次读取 · ${agoLabel(snapshot.fetchedAt)}`
            : `${agoLabel(snapshot.fetchedAt)}从站点账本读取`}
      </div>
      </div>
    </div>
  )
}

function WalletSeat({ wide, useSessions }: SeatProps) {
  ensureCss()
  const [open, setOpen] = useState(false)
  const [inspectRoute, setInspectRoute] = useState<string | undefined>(undefined)
  const [bundle, setBundle] = useState<WalletBundle | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<'switch' | 'manual' | 'auto' | undefined>(undefined)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | undefined>(undefined)
  const [badgeValue, setBadgeValue] = useState('')
  const [tokenRoute, setTokenRoute] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [lastGood, setLastGood] = useState<Record<string, WalletSnapshot>>({})
  const lastGoodRef = useRef(lastGood)
  lastGoodRef.current = lastGood
  const root = useRef<HTMLDivElement>(null)
  const running = useSessions(state => state.ids.some(id => state.byId[id]?.running === true))

  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    loadWallet(inspectRoute, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        if (isWalletError(data)) {
          setError(walletErrorCopy(data.error))
          setBusy(false)
          return
        }
        if (!isBundle(data)) {
          setError(walletErrorCopy('unexpected response'))
          setBusy(false)
          return
        }
        setBundle(data)
        setBusy(false)
        if (data.wallet.ok === true) {
          setLastGood(prev => ({ ...prev, [data.wallet.route]: data.wallet }))
          setError(undefined)
          // 徽标显示今日实扣（人民币），让余额与消费一眼可见。
          setBadgeValue(fmtMoney(data.wallet.today))
        } else {
          setError(walletErrorCopy(data.wallet.error))
          const kept = lastGoodRef.current[data.selected]
          if (kept === undefined) setBadgeValue('')
        }
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setError(/^HTTP \d+$/.test(message) ? '本机或站点没有响应。' : message)
        setBusy(false)
      },
    )
    return () => controller.abort()
  }, [nonce, inspectRoute])

  // 自动刷新只在「有意义」的时候发生：有会话在跑（钱正在产生）或面板开着（你正在看数字）。
  // 空闲且关着时一次请求都不发——这是装饰性数字，不该白打自建网关。
  // 间隔取宿主下发的 bundle.refreshMs（源头是设置里的 newapi-wallet.refreshMs，改完即生效），
  // 缺省回落 DEFAULT_REFRESH_MS。与手动刷新撞车时，上一个 fetch 会被 AbortController 取消，不叠加。
  const pollMs = bundle?.refreshMs ?? DEFAULT_REFRESH_MS
  useEffect(() => {
    if (!running && !open) return undefined
    const timer = setInterval(() => {
      setPending('auto')
      setNonce(n => n + 1)
    }, pollMs)
    return () => clearInterval(timer)
  }, [running, open, pollMs])

  // 跑完那一刻刷一次；网关是异步落账的，立刻刷常常看不到最后一笔，所以约 20s 后再兜一次。
  // 这是单次定时器，不是常驻轮询——空闲时仍然一个请求都不发。
  const wasRunning = useRef(false)
  useEffect(() => {
    const finished = wasRunning.current && !running
    wasRunning.current = running
    if (!finished) return undefined
    setPending('auto')
    setNonce(n => n + 1)
    const timer = setTimeout(() => {
      setPending('auto')
      setNonce(n => n + 1)
    }, 20_000)
    return () => clearTimeout(timer)
  }, [running])

  useDismissOnOutsidePointer(root, open, () => setOpen(false))

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // 令牌弹窗开着时，Esc 先关弹窗，别把整个面板一起收掉。
      if (tokenRoute !== undefined) setTokenRoute(undefined)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, tokenRoute])

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = root.current?.getBoundingClientRect()
      if (rect === undefined) return
      setAnchor({
        left: wide === false
          ? Math.min(rect.right + 8, Math.max(12, window.innerWidth - 404))
          : Math.min(rect.left, Math.max(12, window.innerWidth - 404)),
        bottom: window.innerHeight - rect.top + 8,
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, wide])

  const selected = inspectRoute ?? bundle?.selected ?? ''
  const live = bundle?.wallet.ok === true ? bundle.wallet : undefined
  const snapshot: WalletSnapshot | undefined = live?.route === selected
    ? live
    : lastGood[selected]
  const routeReady = snapshot !== undefined && snapshot.route === selected
  const loading: 'block' | 'dim' | false = !busy
    ? false
    : !routeReady ? 'block' : pending === 'manual' ? 'dim' : false
  const failNote = bundle?.wallet.ok === false ? bundle.wallet.detail : error
  const fail = loading !== false || error === undefined
    ? undefined
    : snapshot !== undefined
      ? {
          title: '刷新失败，仍显示上次数字。',
          ...failNote !== undefined && failNote !== '' ? { note: failNote } : {},
        }
      : bundle?.wallet.ok === false
        ? {
            title: walletErrorCopy(bundle.wallet.error),
            ...bundle.wallet.detail !== undefined ? { note: bundle.wallet.detail } : {},
          }
        : { title: error }
  const low = snapshot !== undefined && loading !== 'block' && isLowBalance(snapshot.remaining)
  const reload = (): void => {
    if (busy) return
    setPending('manual')
    setNonce(n => n + 1)
  }

  const openTokenDialog = (route: string): void => {
    setSaveError(undefined)
    setTokenRoute(route)
  }

  const saveToken = (token: string, scope: 'route' | 'global'): void => {
    if (tokenRoute === undefined) return
    setSaving(true)
    setSaveError(undefined)
    const body = scope === 'global' ? { accessToken: token } : { route: tokenRoute, accessToken: token }
    saveAccessToken(body).then(
      () => {
        setSaving(false)
        setTokenRoute(undefined)
        // 保存后立刻重读：宿主 Config 的 volatile 引用即时生效，不用重启 DSH。
        setPending('manual')
        setNonce(n => n + 1)
      },
      (err: unknown) => {
        setSaving(false)
        setSaveError(err instanceof Error ? err.message : String(err))
      },
    )
  }

  const tokenAccount = tokenRoute !== undefined
    ? bundle?.accounts.find(account => account.route === tokenRoute)
    : undefined

  return (
    <div ref={root} className={wide === false ? 'gww_layer gww_rail' : 'gww_layer'}>
      <button
        type="button"
        className="gww_badge"
        {...open ? { 'data-active': '' } : {}}
        {...low ? { 'data-low': '' } : {}}
        title={low ? 'New API 账本 · 余额偏低' : 'New API 账本'}
        aria-label={low ? 'New API 账本，余额偏低' : 'New API 账本'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="gww_badgeIcon">
          <IconWallet size={wide === false ? 18 : 14} />
          {low && <span className="gww_dot" aria-hidden="true" />}
        </span>
        <span className="gww_badgeLabel">New API 账本</span>
        <span className="gww_badgeValue" {...loading === 'block' ? { 'data-wait': '' } : {}}>{badgeValue}</span>
      </button>
      {open && anchor !== undefined && (
        <div
          className="gww_panel"
          role="dialog"
          aria-label="New API 账本"
          style={{ left: anchor.left, bottom: anchor.bottom }}
        >
          <div className="gww_header">
            <span className="gww_title">New API 账本</span>
            <div className="gww_headerActions">
              <button
                type="button"
                className="gww_iconButton"
                {...busy ? { 'data-busy': '' } : {}}
                aria-label="刷新"
                onClick={reload}
              >
                <IconRefresh size={14} />
              </button>
              <button
                type="button"
                className="gww_iconButton"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                <IconClose size={16} />
              </button>
            </div>
          </div>
          <div className="gww_body">
            <WalletBody
              snapshot={snapshot}
              wallet={bundle?.wallet}
              error={error}
              fail={fail}
              accounts={bundle?.accounts ?? []}
              selected={selected}
              loading={loading}
              onSelect={(route) => {
                setPending('switch')
                setInspectRoute(route)
              }}
              onConfigure={openTokenDialog}
              onRetry={reload}
            />
          </div>
        </div>
      )}
      {tokenAccount !== undefined && (
        <TokenDialog
          account={tokenAccount}
          saving={saving}
          failure={saveError}
          onSave={saveToken}
          onClose={() => setTokenRoute(undefined)}
        />
      )}
    </div>
  )
}

export const name = LOGGER_KEY
export const inject = ['slots']

// 唯一入口就是这个侧边栏座位：不再往设置页插任何座位（0.1.7 已删掉 settingsScope 与
// settings.plugin.item 两样东西）。宿主仍会把本插件的 Config 投影成设置页表单，那只是
// 同一份数据的备用视图；正常路径是面板卡片上的「配置令牌」弹窗。
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: LOGGER_KEY,
    order: 25,
  }, WalletSeat))
}
