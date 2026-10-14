/**
 * @loostone/dsh-newapi-wallet 客户端半。
 *
 * 两件事：
 *  1. 侧边栏左下角的「账本」座位：点开是两列面板，各自滚动。
 *     左列——金额三卡 → 近 4 周热力图 → 今日按模型 → 今日按令牌（两列表**全天口径**，
 *     且每行可点选：点一下筛右侧，再点同一行取消）；
 *     右列——已筛提示条 → 今日用量四桶 → 最近调用（内部滚动）。
 *     左列只负责「选」，自身永不收窄——否则点一行就再也点不回别的分组。
 *  2. 「插件」页里本插件的配置表单（plugins.bundle.config 槽）：一个访问令牌
 *     输入框 + 一个刷新间隔。令牌写走官方 config form（form.mutate → settings.update），
 *     所以面板里不再需要任何配置入口——供应商卡片与令牌弹窗已在 0.2.2 删除。
 *
 * 本模块刻意不 import 任何 Harness Client 包（除纯类型）：0.1.7 改过 primitives 的
 * 图标导出名，那次改名让整个座位被 retire。图标与「点外面收起」都自己实现。
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CallRecord,
  DailyPoint,
  Money,
  TodayGroupRow,
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
const PACKAGE_NAME = '@loostone/dsh-newapi-wallet'
const DEFAULT_REFRESH_MS = 45_000
const STYLE_ID = 'loostone-newapi-wallet/panel.css'

/**
 * 配置页的两半：状态面与写入面。**两者都不是宿主经槽投递的**——
 * dsh-client-ui-plugin-manager 渲染 plugins.bundle.config 时只传 { view }（lib/client.js:2522），
 * 从不传 form（form 只给「行」和「官方插件」两个槽，见同文件 :3509 / :3541）。
 * 所以本插件自己去 ctx.configForms 取表单，见文件末尾 apply()。
 *
 * 状态必须走「标准 hook 座位」（注册项 inject() 的 hooks），由渲染器绑成
 * useWalletConfigForm 并订阅宿主更新。直接读一次 getSnapshot() 会永远停在
 * loading——那时表单还没从宿主取回值，而且之后的变化没有通道通知已挂载的组件。
 */
interface ConfigFormState {
  status: 'loading' | 'ready' | 'unavailable'
  value: Record<string, unknown> | undefined
  revision: number | undefined
  writable: boolean
}

type ConfigOp = { op: 'set' | 'unset'; path: string[]; value?: unknown }

/**
 * configForms 服务里一张宿主表单的形态（dsh-client-ui-settings 的 ConfigFormController）。
 * 只声明我们真正调用的三件事——本模块刻意不 import 那个包的值与类型。
 */
interface ConfigPageForm {
  getSnapshot(): ConfigFormState
  subscribe(listener: () => void): () => void
  mutate(ops: ConfigOp[], expectedRevision?: number): Promise<boolean>
}

/** 客户端上下文里我们真正用到的服务；ClientContext 是纯类型导入，这里做窄化。 */
interface WalletClientCtx {
  slots: ClientContext['slots']
  inject(services: string[], callback: (scoped: WalletClientCtx) => void): unknown
  readonly configForms?: { get(ns: string): ConfigPageForm | undefined }
}

interface ConfigPageProps {
  view: 'summary' | 'page'
  /** 注册项 inject() 的 hooks 座位，渲染器绑成这个名字的 Hook。 */
  useWalletConfigForm?: (select: (state: ConfigFormState) => ConfigFormState) => ConfigFormState
  /** 同一注册项投递的写入动作（宿主表单的 mutate）。 */
  mutate?: (ops: ConfigOp[], expectedRevision?: number) => Promise<boolean>
}

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
  // 面板：680 宽、78vh 高，整体不滚动，滚动交给两列内部
  '.gww_panel{z-index:30;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background-color:Canvas;background-image:linear-gradient(rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1),rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1));width:680px;max-width:calc(100vw - 24px);height:78vh;box-shadow:var(--dsw-shadow-lv2);border-radius:14px;flex-direction:column;display:flex;position:fixed;overflow:hidden;backdrop-filter:none;-webkit-backdrop-filter:none}',
  '.gww_header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:center;min-height:46px;padding:10px 14px;display:flex;gap:8px}',
  '.gww_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px;white-space:nowrap}',
  '.gww_headerActions{align-items:center;gap:2px;display:flex;flex:none}',
  '.gww_iconButton{cursor:pointer;width:26px;height:26px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}',
  '.gww_iconButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.gww_iconButton[data-busy]{opacity:.5;cursor:default}',
  '.gww_body{flex:1;min-height:0;display:flex;flex-direction:column}',
  '.gww_content[data-loading]{opacity:.5}',
  '.gww_badgeValue[data-wait]{opacity:.55}',
  // 两列：左列稍窄（数字+热力图），右列稍宽（四桶+明细要放长文本）
  '.gww_cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,272px) minmax(0,1fr);gap:0}',
  '.gww_colL{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px;overflow-y:auto;scrollbar-width:thin;border-right:1px solid var(--dsw-alias-border-l1)}',
  '.gww_colL::-webkit-scrollbar{width:7px}',
  '.gww_colL::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}',
  '.gww_colR{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px}',
  // 区块
  '.gww_section{margin-top:14px}',
  '.gww_sectionTitle{color:var(--dsw-alias-label-tertiary);margin:0 0 6px;font-size:11px;line-height:16px;font-weight:500}',
  '.gww_rows{display:flex;flex-direction:column}',
  '.gww_row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px}',
  '.gww_row:last-child{border-bottom:0}',
  '.gww_rowName{color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_rowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none}',
  '.gww_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:8px 0 0}',
  '.gww_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}',
  '.gww_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px;margin:8px 0 0}',
  '.gww_fail{margin:0 0 10px}',
  '.gww_fail .gww_warn{margin:0}',
  '.gww_fail .gww_note{margin:4px 0 0}',
  '.gww_fail .gww_retry{margin-top:6px}',
  '.gww_ok{color:var(--dsw-alias-state-success-primary)}',
  '.gww_retry{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:8px;padding:3px 10px;font:inherit;font-size:12px}',
  '.gww_retry:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // 金额三卡：竖向排列更省宽度，数字更醒目
  '.gww_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
  '.gww_stat{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 9px;min-width:0;background:var(--dsw-alias-bg-layer-3)}',
  '.gww_statValue{color:var(--dsw-alias-label-primary);font-size:15px;line-height:21px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gww_statValue[data-low]{color:var(--dsw-alias-state-warn-primary)}',
  '.gww_statLabel{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  // 分组行（今日按模型 / 今日按令牌）：整行是个按钮，可点选，带占比条
  '.gww_model{display:flex;flex-direction:column;gap:3px;padding:6px;margin:0 -6px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:0 0;font:inherit;text-align:left;width:calc(100% + 12px);cursor:pointer}',
  '.gww_model:last-child{border-bottom:0}',
  '.gww_model:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.gww_model[data-on]{background:var(--dsw-alias-interactive-bg-hover-solid);box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary)}',
  '.gww_modelTop{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:12px;line-height:17px}',
  '.gww_modelName{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gww_model[data-on] .gww_modelName{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.gww_modelValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none;font-weight:500}',
  '.gww_modelBar{height:3px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}',
  '.gww_modelBar>i{display:block;height:100%;border-radius:2px;background:color-mix(in oklab,var(--dsw-alias-label-tertiary) 70%,transparent)}',
  '.gww_modelMeta{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}',
  // 已筛提示条：筛选条删掉后，这里是「当前筛了什么」的唯一说明，✕ 一键清除
  '.gww_applied{flex:none;display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:0 0 9px;margin:0 0 2px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.gww_appliedLabel{flex:0 0 auto;color:var(--dsw-alias-label-caption);font-size:10px;line-height:16px;user-select:none}',
  '.gww_chip{cursor:pointer;flex:0 0 auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-label-tertiary);border-radius:999px;padding:2px 9px;font:inherit;font-size:11px;line-height:17px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
  '.gww_chip:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // 最近调用：只有这个区域内部滚动
  '.gww_scrollFix{flex:1;min-height:0;display:flex;flex-direction:column;margin-top:14px}',
  '.gww_callsScroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;margin:0 -6px;padding:0 6px}',
  '.gww_callsScroll::-webkit-scrollbar{width:7px}',
  '.gww_callsScroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}',
  '.gww_call{padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.gww_call:last-child{border-bottom:0}',
  // 单笔恰好两行、每行两格：左格居左（过长省略号截断，不挤走右格），右格居右，两行右边缘对齐。
  '.gww_callGrid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;align-items:baseline;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}',
  '.gww_callCell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  // input / output 并排在第二行左格：第一列固定 16ch（够放「input: 999.999K」），
  // 于是每张卡片的 output: 都从同一个 x 开始，跨行对齐。窄了先收列宽，不换行、不重叠。
  '.gww_callIO{display:grid;grid-template-columns:minmax(0,16ch) auto;gap:0 10px}',
  '.gww_callAmount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:500;text-align:right;white-space:nowrap}',
  // 金额左侧的模型名：比金额暗一档，钱是这张卡唯一的高亮。
  '.gww_callModel{color:var(--dsw-alias-label-caption);margin-right:8px}',
  // 命中率配色：≥96% 绿 / 80~96% 黄 / <80% 红。黄档没有对应 alias，用主题的静态 amber。
  '.gww_tokCache{text-align:right;white-space:nowrap}',
  '.gww_tokCache[data-level="ok"]{color:var(--dsw-alias-state-success-primary)}',
  '.gww_tokCache[data-level="warn"]{color:var(--dsw-static-amber-500,#f59e0b)}',
  '.gww_tokCache[data-level="bad"]{color:var(--dsw-alias-state-error-primary)}',
  // margin-top:auto：左列内容不够高时贴住列底，内容超了自然跟在最后一个区块后面。
  '.gww_footer{color:var(--dsw-alias-label-caption);flex:none;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
  // 热力图
  '.gww_heat{--gww-heat:#31a06b;display:flex;flex-direction:column;gap:6px}',
  '.gww_heat{--h0:var(--dsw-alias-bg-layer-3);--h1:#9be9a8;--h1:light-dark(#9be9a8,#0e4429);--h2:#40c463;--h2:light-dark(#40c463,#006d32);--h3:#30a14e;--h3:light-dark(#30a14e,#26a641);--h4:#216e39;--h4:light-dark(#216e39,#39d353)}',
  '.gww_heat{--t1:light-dark(#14532d,#d6f5e2);--t2:light-dark(#0b3a20,#eafff2);--t3:#062d16;--t4:light-dark(#ffffff,#052411)}',
  '.gww_heatHead{gap:4px;display:grid;grid-template-columns:repeat(7,1fr)}',
  '.gww_heatWd{text-align:center;color:var(--dsw-alias-label-caption);font-size:10px;line-height:12px}',
  '.gww_heatGrid{gap:4px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}',
  '.gww_heatCell{aspect-ratio:5/4;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);transition:transform .12s ease,box-shadow .12s ease}',
  '.gww_heatCell[data-tier="0"]{background:var(--h0)}',
  '.gww_heatCell[data-tier="1"]{color:var(--t1);background:var(--h1)}',
  '.gww_heatCell[data-tier="2"]{color:var(--t2);background:var(--h2)}',
  '.gww_heatCell[data-tier="3"]{color:var(--t3);background:var(--h3)}',
  '.gww_heatCell[data-tier="4"]{color:var(--t4);background:var(--h4)}',
  '.gww_heatCell[data-none]{border:1px dashed var(--dsw-alias-border-l2);background:0 0}',
  '.gww_heatCell[data-future]{border:none;background:0 0}',
  '.gww_heatCell[data-today]{box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--gww-heat) 85%,Canvas)}',
  '.gww_heatCell:not([data-future]){cursor:default;position:relative}',
  '.gww_heatCell:not([data-future]):hover{transform:scale(1.08);box-shadow:0 0 0 2px color-mix(in oklab,var(--gww-heat) 45%,transparent),0 2px 8px color-mix(in oklab,var(--gww-heat) 25%,transparent);z-index:2}',
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
  // 插件配置页
  '.gww_cfg{display:flex;flex-direction:column;gap:10px;max-width:440px}',
  '.gww_cfgLabel{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}',
  '.gww_cfgHint{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin:0}',
  '.gww_cfgInput{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:6px 9px;font:inherit;font-size:12px}',
  '.gww_cfgInput:focus{outline:none;border-color:var(--dsw-alias-label-tertiary)}',
  '.gww_cfgRow{display:flex;align-items:center;gap:8px}',
  '.gww_cfgBtn{cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 14px;font:inherit;font-size:12px}',
  '.gww_cfgBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.gww_cfgBtn[data-busy]{opacity:.5;cursor:default}',
  '.gww_cfgMsg{font-size:12px;line-height:18px;margin:0}',
  '.gww_cfgMsg[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}',
  '.gww_cfgMsg[data-tone="err"]{color:var(--dsw-alias-state-error-primary)}',
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

/**
 * 大数字压缩：2,846,508 → 2.847M。四桶那几行用它，省出横向空间。
 * 单位按用户要求用 K / M / B，**不用「万 / 亿」**：20W → 200K、1.456M、12.123B。
 * 导出只为让离线 harness 断言格式；宿主与页面都不消费这个导出。
 */
export function fmtTokens(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value < 1e3) return String(Math.round(value))
  const scales: Array<[number, string]> = [[1e3, 'K'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T']]
  let tier = 0
  for (let i = 0; i < scales.length; i++) if (value >= scales[i][0]) tier = i
  // 进位保护：999,999 除以 K 会四舍五入成「1000K」，升一档才是「1M」。
  while (tier < scales.length - 1 && Number((value / scales[tier][0]).toFixed(3)) >= 1000) tier += 1
  const [scale, suffix] = scales[tier]
  return Number((value / scale).toFixed(3)) + suffix
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
/* 取数：只读 GET（写令牌已移到「插件」页的官方配置表单）                     */
/* ------------------------------------------------------------------ */

/** 筛选只影响右侧「今日用量」与「最近调用」；服务端据此收窄账本聚合口径。 */
interface WalletFilter {
  model?: string
  token?: string
}

async function loadWallet(
  route: string | undefined,
  filter: WalletFilter,
  signal: AbortSignal,
): Promise<WalletPayload> {
  const params = new URLSearchParams()
  if (route !== undefined && route !== '') params.set('route', route)
  if (filter.model !== undefined) params.set('model', filter.model)
  if (filter.token !== undefined) params.set('token', filter.token)
  const query = params.toString()
  const response = await fetch(query === '' ? PATH : PATH + '?' + query, {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<WalletPayload>
}

function isBundle(value: WalletPayload | undefined): value is WalletBundle {
  return value !== undefined && 'accounts' in value
}

function isWalletError(value: WalletPayload | undefined): value is WalletError {
  return value !== undefined && 'ok' in value && value.ok === false
}

function walletErrorCopy(error: string): string {
  if (error === 'no-access-token') return '还没配 New API 访问令牌。在左侧栏「插件」页里找到本插件，填进「访问令牌」即可。'
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
/* 展示组件                                                             */
/* ------------------------------------------------------------------ */

/** 金额三卡：余额 / 今日实扣 / 累计已用。数字用 tabular-nums 对齐。 */
function StatCards({ snapshot }: { snapshot: WalletSnapshot }) {
  const low = isLowBalance(snapshot.remaining)
  return (
    <div className="gww_stats">
      <div className="gww_stat">
        <div className="gww_statValue" {...low ? { 'data-low': '' } : {}}>{fmtMoney(snapshot.remaining)}</div>
        <div className="gww_statLabel">余额</div>
      </div>
      <div className="gww_stat">
        <div className="gww_statValue">{snapshot.todayAvailable ? fmtMoney(snapshot.today) : '—'}</div>
        <div className="gww_statLabel">今日实扣</div>
      </div>
      <div className="gww_stat">
        <div className="gww_statValue">{fmtMoney(snapshot.used)}</div>
        <div className="gww_statLabel">累计已用</div>
      </div>
    </div>
  )
}

/**
 * 今日用量的四桶。每行左侧名称、右侧「token · ¥」，金额与 token 同源。
 * 四行之和恒等于「合计 token」那一行（服务端已按行回缩保证）。
 */
function BucketRows({
  buckets,
  amounts,
}: {
  buckets: TokenBuckets
  amounts?: UsageAmounts
}) {
  const rows: Array<{ name: string; value: string; amount?: Money }> = [
    { name: '请求', value: fmtCount(buckets.requests) },
    { name: '输入(未缓存)', value: fmtTokens(buckets.inputTokens), amount: amounts?.input },
    { name: '输出', value: fmtTokens(buckets.outputTokens), amount: amounts?.output },
  ]
  if (buckets.cacheReadTokens !== undefined) rows.push({ name: '缓存命中', value: fmtTokens(buckets.cacheReadTokens), amount: amounts?.cacheRead })
  // 缓存写入与缓存命中是两桶：写入按原价计费，命中才打折。旧版把写入并进「输入」，会虚高。
  if (buckets.cacheWriteTokens !== undefined) rows.push({ name: '缓存写入', value: fmtTokens(buckets.cacheWriteTokens), amount: amounts?.cacheWrite })
  if (buckets.totalTokens !== undefined) rows.push({ name: '合计 token', value: fmtTokens(buckets.totalTokens), amount: amounts?.total })
  return (
    <div className="gww_section" style={{ marginTop: 0 }}>
      <div className="gww_sectionTitle">今日用量</div>
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

/**
 * 分组列表（今日按模型 / 今日按令牌共用）。每行是一条占比条 + 金额 + 次数。
 *
 * 整行是个按钮：点一下把右侧筛成这一行，再点同一行取消。列表本身恒为全天口径，
 * 不会因为筛了谁而收窄——它是「候选」，不是「结果」。
 */
function GroupList({
  title,
  rows,
  dim,
  selected,
  onPick,
}: {
  title: string
  rows: TodayGroupRow[]
  dim: 'model' | 'token'
  selected: string | undefined
  onPick: (dim: 'model' | 'token', value: string) => void
}) {
  if (rows.length === 0) return null
  const max = rows.reduce((acc, row) => (row.quota > acc ? row.quota : acc), 0)
  return (
    <div className="gww_section">
      <div className="gww_sectionTitle">{title}</div>
      <div className="gww_rows">
        {rows.map(row => (
          <button
            key={row.name}
            type="button"
            className="gww_model"
            {...selected === row.name ? { 'data-on': '' } : {}}
            onClick={() => onPick(dim, row.name)}
            aria-pressed={selected === row.name}
            title={
              (selected === row.name ? '再点一次取消筛选 · ' : '点一下筛右侧 · ')
              + 'token ' + fmtCount(row.tokens) + ' · 账本额度点 ' + fmtCount(row.quota)
            }
          >
            <div className="gww_modelTop">
              <span className="gww_modelName">{row.name}</span>
              <span className="gww_modelValue">
                {fmtMoney(row.amount ?? { quota: row.quota, display: row.quota === 0 ? 0 : undefined, currency: 'CNY' })}
              </span>
            </div>
            <div className="gww_modelBar">
              <i style={{ width: max > 0 ? Math.max((row.quota / max) * 100, 2) + '%' : '0%' }} />
            </div>
            <div className="gww_modelMeta">{fmtCount(row.calls)} 次</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 左侧点选的纯逻辑：同值再点 = 取消该维度，异值 = 设置该维度并保留另一维度。
 * 导出只为让离线 harness 断言行为；宿主与页面都消费这个函数本身。
 */
export function nextFilter(
  current: { model?: string; token?: string },
  dim: 'model' | 'token',
  value: string,
): { model?: string; token?: string } {
  const next: { model?: string; token?: string } = {}
  const model = dim === 'model' ? (current.model === value ? undefined : value) : current.model
  const token = dim === 'token' ? (current.token === value ? undefined : value) : current.token
  if (model !== undefined && model !== '') next.model = model
  if (token !== undefined && token !== '') next.token = token
  return next
}

/**
 * 已筛提示条。左侧点选取代了两行 chip 筛选条，所以「现在筛了什么、怎么撤」必须
 * 在右侧明说——否则筛选变成隐形状态。点 ✕ 清掉该维度，点「清除」清全部。
 */
function AppliedBar({
  filter,
  onPick,
}: {
  filter: { model?: string; token?: string } | undefined
  onPick: (dim: 'model' | 'token', value: string) => void
}) {
  const model = filter?.model
  const token = filter?.token
  if (model === undefined && token === undefined) return null
  return (
    <div className="gww_applied">
      <span className="gww_appliedLabel">已筛</span>
      {model !== undefined && (
        <button type="button" className="gww_chip" onClick={() => onPick('model', model)} title="取消模型筛选">
          模型 {model} ✕
        </button>
      )}
      {token !== undefined && (
        <button type="button" className="gww_chip" onClick={() => onPick('token', token)} title="取消令牌筛选">
          令牌 {token} ✕
        </button>
      )}
    </div>
  )
}

/**
 * 单笔的缓存命中栏。命中率 = 缓存读取 ÷ 输入总量（输入总量含缓存，与「今日用量」同口径）。
 * 三档：≥96% 绿（ok）、80~96% 黄（warn）、<80% 红（bad）。没有缓存可展示时返回 undefined，
 * 该栏留空——写「缓存 0」只是噪声。导出仅为让离线 harness 断言口径与档位。
 */
export function cacheHint(call: Pick<CallRecord, 'promptTokens' | 'cacheTokens'>): { text: string; level: 'ok' | 'warn' | 'bad' } | undefined {
  const cached = call.cacheTokens
  if (typeof cached !== 'number' || !Number.isFinite(cached) || cached <= 0) return undefined
  const prompt = call.promptTokens
  if (typeof prompt !== 'number' || !Number.isFinite(prompt) || prompt <= 0) return undefined
  const hit = Math.min(cached / prompt, 1)
  const percent = Number((hit * 100).toFixed(1))
  return {
    text: `缓存 ${fmtTokens(cached)} · ${percent}%`,
    level: percent >= 96 ? 'ok' : percent >= 80 ? 'warn' : 'bad',
  }
}

function CallRows({ calls }: { calls: CallRecord[] }) {
  return (
    <div className="gww_rows">
      {calls.map((call, index) => {
        const hint = cacheHint(call)
        // 没读到用量的行（网关偶发缺字段）不摆 0，写 —，免得看起来像「真的用了 0」。
        const usage = call.promptTokens !== undefined || call.completionTokens !== undefined
        return (
          <div key={call.requestId ?? `${call.createdAt}-${index}`} className="gww_call">
            <div className="gww_callGrid">
              <span className="gww_callCell">
                {clockLabel(call.createdAt)}
                {call.tokenName !== undefined ? ` - ${call.tokenName}` : ''}
              </span>
              <span className="gww_callAmount">
                {call.model !== undefined && <span className="gww_callModel">{call.model}{' '}</span>}
                {fmtMoney(call.amount)}
              </span>
              <span className="gww_callCell gww_callIO">
                <span>input: {usage ? fmtTokens(call.promptTokens ?? 0) : '—'}</span>
                <span>output: {usage ? fmtTokens(call.completionTokens ?? 0) : '—'}</span>
              </span>
              <span className="gww_tokCache" data-level={hint?.level}>{hint?.text}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 近 4 周消费热力图：最后一行=本周（列 周一→周日），最上一行=三周前。 */
/* 颜色 = 当日实扣（线性 20/45/70% 分 4 档）；格内日号，每月 1 号显示「X月」。 */
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
  // 用 √ 比例会把大多数天压进深档，深浅就"看不出差别"——别再压缩。
  const tierOf = (p: DailyPoint): number => {
    if (!p.available || p.quota <= 0 || maxQuota <= 0) return 0
    const r = p.quota / maxQuota
    return r >= 0.7 ? 4 : r >= 0.45 ? 3 : r >= 0.2 ? 2 : 1
  }
  const cells: HeatCell[] = []
  for (let row = 0; row < HEAT_WEEKS; row++) {
    for (let col = 0; col < 7; col++) {
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
        近 4 周实扣 · 合计 {totalCny < 1 && totalCny > 0 ? totalCny.toFixed(4) : totalCny.toFixed(2)} 元
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

/* ------------------------------------------------------------------ */
/* 主面板                                                               */
/* ------------------------------------------------------------------ */

/**
 * 面板正文（纯函数组件，不持状态）。导出只为让离线 harness 能渲染并断言
 * 「左侧两个列表都在 + 点行会带对参数回调」；宿主只经 WalletSeat 消费它。
 */
export function WalletBody({
  snapshot,
  error,
  fail,
  loading,
  onRetry,
  onPick,
}: {
  snapshot: WalletSnapshot | undefined
  error: string | undefined
  fail: { title: string; note?: string } | undefined
  loading: 'block' | 'dim' | false
  onRetry: () => void
  onPick: (dim: 'model' | 'token', value: string) => void
}) {
  if (loading === 'block' || (snapshot === undefined && fail === undefined && error === undefined)) {
    return <p className="gww_note">读取中…</p>
  }
  if (snapshot === undefined) {
    return (
      <div className="gww_fail">
        <p className="gww_warn">{fail?.title ?? '读不到账本。'}</p>
        {fail?.note !== undefined && <p className="gww_note">{fail.note}</p>}
        {fail === undefined && error !== undefined && <p className="gww_note">{error}</p>}
        <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
      </div>
    )
  }

  const truncated = snapshot.todayLogsTruncated === true && snapshot.todayLedgerRows !== undefined
  return (
    <div className="gww_cols gww_content" {...loading === 'dim' ? { 'data-loading': '' } : {}}>
      {/* 左列：金额三卡 → 热力图 → 今日按模型 / 今日按令牌（全天口径，行可点选） */}
      <div className="gww_colL">
        <StatCards snapshot={snapshot} />

        {!snapshot.todayAvailable && snapshot.todayUnavailableReason !== undefined && (
          <p className="gww_note">站点没有开放今日统计。</p>
        )}
        {snapshot.isAvailable === false && <p className="gww_warn">这个账户当前不可用。</p>}

        {snapshot.dailyHistory !== undefined && snapshot.dailyHistory.length > 0 && (
          <HeatmapSection points={snapshot.dailyHistory} />
        )}

        {snapshot.todayModels !== undefined && snapshot.todayModels.length > 0 && (
          <GroupList
            title="今日按模型"
            rows={snapshot.todayModels}
            dim="model"
            selected={snapshot.filter?.model}
            onPick={onPick}
          />
        )}

        {snapshot.todayTokenRows !== undefined && snapshot.todayTokenRows.length > 0 && (
          <GroupList
            title="今日按令牌"
            rows={snapshot.todayTokenRows}
            dim="token"
            selected={snapshot.filter?.token}
            onPick={onPick}
          />
        )}

        <div className="gww_footer" title={new Date(snapshot.fetchedAt).toLocaleString()}>
          {hostOf(snapshot.origin)} · {truncated ? `今日 ${fmtCount(snapshot.todayLedgerRows)} 行，已统计 ${fmtCount(snapshot.todayLogRows ?? 0)} 行 · ` : ''}
          {loading === 'dim'
            ? '读取中…'
            : fail !== undefined
              ? `上次读取 · ${agoLabel(snapshot.fetchedAt)}`
              : `${agoLabel(snapshot.fetchedAt)}从站点账本读取`}
        </div>
      </div>

      {/* 右列：已筛提示 → 今日用量 → 最近调用（本区内部滚动） */}
      <div className="gww_colR">
        {fail !== undefined && (
          <div className="gww_fail">
            <p className="gww_warn">{fail.title}</p>
            {fail.note !== undefined && <p className="gww_note">{fail.note}</p>}
            <button type="button" className="gww_retry" onClick={onRetry}>重试</button>
          </div>
        )}

        <AppliedBar filter={snapshot.filter} onPick={onPick} />

        {snapshot.todayTokens !== undefined && (
          <BucketRows buckets={snapshot.todayTokens} amounts={snapshot.todayAmounts} />
        )}

        {snapshot.recentCalls !== undefined && snapshot.recentCalls.length > 0 && (
          <div className="gww_scrollFix">
            <div className="gww_sectionTitle">最近调用</div>
            <div className="gww_callsScroll">
              <CallRows calls={snapshot.recentCalls} />
            </div>
          </div>
        )}

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
  const [filter, setFilter] = useState<WalletFilter>({})
  const [lastGood, setLastGood] = useState<Record<string, WalletSnapshot>>({})
  const lastGoodRef = useRef(lastGood)
  lastGoodRef.current = lastGood
  const root = useRef<HTMLDivElement>(null)
  const running = useSessions(state => state.ids.some(id => state.byId[id]?.running === true))

  // 筛选变化即重新取数；序列化后比较，避免对象引用每次渲染都变。
  const filterKey = (filter.model ?? '') + '\u0000' + (filter.token ?? '')
  const applyFilter = (next: WalletFilter): void => {
    const key = (next.model ?? '') + '\u0000' + (next.token ?? '')
    if (key === filterKey) return
    setPending('switch')
    setFilter(next)
  }
  // 左侧点选：同值再点即取消该维度，另一维度保留（逻辑在 nextFilter 里，可离线断言）。
  const pickFilter = (dim: 'model' | 'token', value: string): void => {
    applyFilter(nextFilter(filter, dim, value))
  }

  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    loadWallet(inspectRoute, filter, controller.signal).then(
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
    // filter 是对象，直接进依赖数组会因每次渲染的新引用而无限重取；用序列化键比较。
  }, [nonce, inspectRoute, filterKey])

  // 自动刷新只在「有意义」的时候发生：有会话在跑（钱正在产生）或面板开着（你正在看数字）。
  // 空闲且关着时一次请求都不发——这是装饰性数字，不该白打自建网关。
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
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const rect = root.current?.getBoundingClientRect()
      if (rect === undefined) return
      setAnchor({
        left: wide === false
          ? Math.min(rect.right + 8, Math.max(12, window.innerWidth - 704))
          : Math.min(rect.left, Math.max(12, window.innerWidth - 704)),
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

  return (
    <div ref={root} className={wide === false ? 'gww_layer gww_rail' : 'gww_layer'}>
      <button
        type="button"
        className="gww_badge"
        {...open ? { 'data-active': '' } : {}}
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
              error={error}
              fail={fail}
              loading={loading}
              onRetry={reload}
              onPick={pickFilter}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 「插件」页里本插件的配置表单                                          */
/*                                                                     */
/* 宿主 dsh-client-ui-plugin-manager 声明 plugins.bundle.config 槽，key 必须是 */
/* 包名；只有注册了这个槽，「插件」页才会把本插件列进「可配置」并按需渲染下面这段。 */
/* 写入走官方 config form（form.mutate → settings.update），所以：               */
/*   - 不需要自建写接口（0.2.2 已删掉 POST /api/newapi-wallet）；                */
/*   - role('secret') 的字段由宿主脱敏，值永远不会回到浏览器，输入框只能写不能读。 */
/* ------------------------------------------------------------------ */

/** 卡片上的一行说明（bundle 配置只会以 page 形态渲染，这里兜底）。 */
function PluginConfigSummary() {
  return <span>New API 账本：余额、今日实扣与用量分桶</span>
}

/** 表单座位缺失时的替身：让 Hook 调用顺序恒定，同时明确「没有写入通道」。 */
const MISSING_FORM_STATE: ConfigFormState = { status: 'unavailable', value: undefined, revision: undefined, writable: false }
function missingFormHook(select: (state: ConfigFormState) => ConfigFormState): ConfigFormState {
  return select(MISSING_FORM_STATE)
}
const identityFormState = (state: ConfigFormState): ConfigFormState => state

function PluginConfigForm({ useWalletConfigForm, mutate }: ConfigPageProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | undefined>(undefined)

  // Hooks 必须无条件先调用，所以缺失时用替身，而不是提前 return。
  const state = (useWalletConfigForm ?? missingFormHook)(identityFormState)
  if (mutate === undefined) {
    return <p className="gww_cfgHint">这个部署没有暴露设置写入通道，无法在此配置。</p>
  }
  if (state.status === 'loading') return <p className="gww_cfgHint">读取中…</p>

  // accessToken 是 role('secret')，宿主会把它从 value / base / user **三层**都摘掉
  // （dsh-settings 的 redactSecrets），只在一个 `secrets` 侧信道里留下 {path, set}。
  // 而客户端的 ConfigForm.derive() 只搬运 value/base/user/user，**不搬运 secrets**
  // （实测 dsh-client-ui-settings/lib/client.js 的 derive() 里没有它）。
  // 结论：这一层拿不到任何「是否已配置」的信号，所以不要猜——只陈述令牌只写不读，
  // 把真实状态交给面板：那边读不到令牌会明确说「还没配访问令牌」。
  const writable = state.writable !== false

  const run = async (ops: readonly ConfigOp[], okText: string): Promise<void> => {
    setBusy(true)
    setMsg(undefined)
    try {
      const accepted = await mutate(ops, state.revision)
      setMsg(accepted
        ? { tone: 'ok', text: okText }
        : { tone: 'err', text: '宿主拒绝了这次写入。' })
      if (accepted) setDraft('')
    } catch (failure) {
      setMsg({ tone: 'err', text: failure instanceof Error ? failure.message : String(failure) })
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    const token = draft.trim()
    if (token === '') {
      setMsg({ tone: 'err', text: '先填一个访问令牌；要清除已存的令牌请点「清除」。' })
      return
    }
    void run([{ op: 'set', path: ['accessToken'], value: token }], '已保存。面板下一次刷新就会用上新令牌。')
  }

  return (
    <div className="gww_cfg">
      <div>
        <label className="gww_cfgLabel" htmlFor="gww_cfg_token">访问令牌</label>
        <p className="gww_cfgHint">
          New API 站点「个人设置 → 访问令牌」里生成的那一串，<strong>不是</strong> sk- 开头的模型密钥。
          令牌<strong>只写不读</strong>——宿主按 <code>role('secret')</code> 脱敏，保存后不会回显，
          这里也不显示「是否已配置」。想知道配没配，看侧边栏账本面板：没配它会直接说。
        </p>
      </div>
      <input
        id="gww_cfg_token"
        type="password"
        className="gww_cfgInput"
        value={draft}
        autoComplete="off"
        disabled={busy || !writable}
        placeholder="粘贴访问令牌（留空点「清除」可删除已存的）"
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') save() }}
      />
      <div className="gww_cfgRow">
        <button
          type="button"
          className="gww_cfgBtn"
          {...busy ? { 'data-busy': '' } : {}}
          disabled={busy || !writable}
          onClick={save}
        >
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="gww_cfgBtn"
          disabled={busy || !writable}
          onClick={() => { void run([{ op: 'unset', path: ['accessToken'] }], '已清除。') }}
        >
          清除
        </button>
        {!writable && <span className="gww_cfgHint">当前 profile 不接受写入。</span>}
      </div>
      {msg !== undefined && <p className="gww_cfgMsg" data-tone={msg.tone}>{msg.text}</p>}
    </div>
  )
}

function PluginConfigPage(props: ConfigPageProps) {
  // bundle 配置槽只以 page 形态渲染；summary 是官方卡片的兜底文案。
  return props.view === 'summary' ? <PluginConfigSummary /> : <PluginConfigForm {...props} />
}

export const name = LOGGER_KEY
// 只把 slots 列为硬依赖：账本面板是主功能，不该因为某个部署没有设置界面就整块消失。
// configForms 用 ctx.inject 按需接（http.ts 对 webServer 也是这么做的）。
export const inject = ['slots']

/**
 * 两个座位：
 *   sidebar.footer.action —— 左下角「账本」入口（唯一的面板入口）。
 *   plugins.bundle.config —— 「插件」页里本插件的配置表单（令牌在这里填）。
 * 面板本身不再有任何配置入口：供应商卡片与令牌弹窗 0.2.2 已删。
 *
 * 配置槽的写入面由本插件自己接：宿主渲染这个槽时只传 { view }，**从不传 form**
 * （dsh-client-ui-plugin-manager lib/client.js:2522；form 只给 plugins.row.config 与
 * plugins.item）。官方唯一占这个槽的 voice-input 也是自己 inject() 一个写入面
 * （dsh-experimental-client-ui-voice-input lib/client.js:5798）。照做，别再等宿主喂。
 * configForms.get() 的入参是**profile 条目 id**（本插件为 LOGGER_KEY），不是包名。
 */
export function apply(ctx: WalletClientCtx): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: LOGGER_KEY,
    order: 25,
  }, WalletSeat))
  // 写入通道来自 dsh-client-ui-settings 的 configForms 服务。等它就位再挂配置座位：
  // 服务缺席的部署只会少一张配置页，账本面板照常工作。
  ctx.inject(['configForms'], (scoped) => {
    const form = scoped.configForms?.get(LOGGER_KEY)
    scoped.slots.inject('plugins.bundle.config', () => scoped.slots.register({
      name: 'plugins.bundle.config',
      key: PACKAGE_NAME,
      order: 25,
      // 状态走标准 hook 座位（渲染器绑成 useWalletConfigForm 并订阅宿主更新），
      // 写入动作走普通 prop。两者都必须在这里给——槽里拿不到。
      inject: () => ({
        hooks: form !== undefined ? { walletConfigForm: form } : {},
        mutate: form !== undefined ? (ops: ConfigOp[], revision?: number) => form.mutate(ops, revision) : undefined,
      }),
    }, PluginConfigPage))
  })
}