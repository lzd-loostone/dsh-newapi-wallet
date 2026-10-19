window.__ModuleLoader__.load({ id: "@loostone/dsh-newapi-wallet", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  WalletBody: () => WalletBody,
  apply: () => apply,
  cacheHint: () => cacheHint,
  fmtTokens: () => fmtTokens,
  inject: () => inject,
  name: () => name,
  nextFilter: () => nextFilter
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var PATH = "/api/newapi-wallet";
var LOGGER_KEY = "loostone-newapi-wallet";
var PACKAGE_NAME = "@loostone/dsh-newapi-wallet";
var DEFAULT_REFRESH_MS = 45e3;
var STYLE_ID = "loostone-newapi-wallet/panel.css";
var PANEL_WIDTH = 720;
var CSS = [
  "div:has(> [data-slot='sidebar.footer.action']){flex-wrap:wrap;gap:6px}",
  "[data-slot='sidebar.footer.action']:has(.gww_rail){flex:none;width:36px}",
  ".gww_layer{flex:0 0 100%;min-width:0;align-items:center;height:49px;margin:8px 0 0;display:flex;position:relative}",
  ".gww_badge{width:100%;min-width:0;height:49px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:0 8px 0 6px;font-family:inherit;font-size:14px;display:inline-flex;position:relative}",
  ".gww_badge:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}",
  ".gww_badge[data-active]{background:var(--dsw-alias-interactive-bg-hover)}",
  ".gww_badgeIcon{flex:none;display:inline-flex;align-items:center;position:relative}",
  ".gww_dot{position:absolute;top:-2px;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 1.5px var(--dsw-alias-bg-base);pointer-events:none}",
  ".gww_badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
  ".gww_badgeValue{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}",
  ".gww_layer.gww_rail{flex:none;width:36px;height:36px;margin:0;overflow:visible}",
  ".gww_layer.gww_rail .gww_badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;padding:0;overflow:visible}",
  ".gww_layer.gww_rail .gww_badgeIcon{position:static}",
  ".gww_layer.gww_rail .gww_dot{top:1px;right:1px}",
  ".gww_layer.gww_rail .gww_badgeLabel,.gww_layer.gww_rail .gww_badgeValue{display:none}",
  // 面板：PANEL_WIDTH 宽、78vh 高，整体不滚动，滚动交给两列内部
  `.gww_panel{z-index:30;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background-color:Canvas;background-image:linear-gradient(rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1),rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1));width:${PANEL_WIDTH}px;max-width:calc(100vw - 24px);height:78vh;box-shadow:var(--dsw-shadow-lv2);border-radius:14px;flex-direction:column;display:flex;position:fixed;overflow:hidden;backdrop-filter:none;-webkit-backdrop-filter:none}`,
  ".gww_header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:center;min-height:46px;padding:10px 14px;display:flex;gap:8px}",
  ".gww_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px;white-space:nowrap}",
  ".gww_headerActions{align-items:center;gap:2px;display:flex;flex:none}",
  ".gww_iconButton{cursor:pointer;width:26px;height:26px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}",
  ".gww_iconButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".gww_iconButton[data-busy]{opacity:.5;cursor:default}",
  ".gww_body{flex:1;min-height:0;display:flex;flex-direction:column}",
  ".gww_content[data-loading]{opacity:.5}",
  ".gww_badgeValue[data-wait]{opacity:.55}",
  // 两列：左列 320 放三张金额卡（单卡文字宽 =（320 − 列内边距 28 − 两处间隙 12）/ 3 − 卡片内边距 18 ≈ 75px），
  // 右列剩下的 400 装四桶与明细。320 是「¥1,234.56」在偏宽中文字体（雅黑 15px 粗体 73.3px）下不省略的下限；
  // 更长的金额（¥12,345.67 起）仍会被省略号截断，那时改成一列竖排三卡，不要再加宽左列。
  ".gww_cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:0}",
  ".gww_colL{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px;overflow-y:auto;scrollbar-width:thin;border-right:1px solid var(--dsw-alias-border-l1)}",
  ".gww_colL::-webkit-scrollbar{width:7px}",
  ".gww_colL::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}",
  ".gww_colR{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px}",
  // 区块
  ".gww_section{margin-top:14px}",
  ".gww_sectionTitle{color:var(--dsw-alias-label-tertiary);margin:0 0 6px;font-size:11px;line-height:16px;font-weight:500}",
  ".gww_rows{display:flex;flex-direction:column}",
  ".gww_row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px}",
  ".gww_row:last-child{border-bottom:0}",
  ".gww_rowName{color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_rowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none}",
  ".gww_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:8px 0 0}",
  ".gww_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}",
  ".gww_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px;margin:8px 0 0}",
  ".gww_fail{margin:0 0 10px}",
  ".gww_fail .gww_warn{margin:0}",
  ".gww_fail .gww_note{margin:4px 0 0}",
  ".gww_fail .gww_retry{margin-top:6px}",
  ".gww_ok{color:var(--dsw-alias-state-success-primary)}",
  ".gww_retry{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:8px;padding:3px 10px;font:inherit;font-size:12px}",
  ".gww_retry:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  // 金额三卡：三列等宽横排（竖排会把左列顶部推高约 100px）。等宽卡里数字必须放得下，见 .gww_cols 的列宽说明。
  ".gww_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}",
  ".gww_stat{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 9px;min-width:0;background:var(--dsw-alias-bg-layer-3)}",
  ".gww_statValue{color:var(--dsw-alias-label-primary);font-size:15px;line-height:21px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".gww_statValue[data-low]{color:var(--dsw-alias-state-warn-primary)}",
  ".gww_statLabel{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  // 分组行（今日按模型 / 今日按令牌）：整行是个按钮，可点选，带占比条
  ".gww_model{display:flex;flex-direction:column;gap:3px;padding:6px;margin:0 -6px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:0 0;font:inherit;text-align:left;width:calc(100% + 12px);cursor:pointer}",
  ".gww_model:last-child{border-bottom:0}",
  ".gww_model:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".gww_model[data-on]{background:var(--dsw-alias-interactive-bg-hover-solid);box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary)}",
  ".gww_modelTop{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:12px;line-height:17px}",
  ".gww_modelName{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_model[data-on] .gww_modelName{color:var(--dsw-alias-label-primary);font-weight:500}",
  ".gww_modelValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none;font-weight:500}",
  ".gww_modelBar{height:3px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}",
  ".gww_modelBar>i{display:block;height:100%;border-radius:2px;background:color-mix(in oklab,var(--dsw-alias-label-tertiary) 70%,transparent)}",
  ".gww_modelMeta{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}",
  // 已筛提示条：筛选条删掉后，这里是「当前筛了什么」的唯一说明，✕ 一键清除
  ".gww_applied{flex:none;display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:0 0 9px;margin:0 0 2px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".gww_appliedLabel{flex:0 0 auto;color:var(--dsw-alias-label-caption);font-size:10px;line-height:16px;user-select:none}",
  ".gww_chip{cursor:pointer;flex:0 0 auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-label-tertiary);border-radius:999px;padding:2px 9px;font:inherit;font-size:11px;line-height:17px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}",
  ".gww_chip:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  // 最近调用：只有这个区域内部滚动
  ".gww_scrollFix{flex:1;min-height:0;display:flex;flex-direction:column;margin-top:14px}",
  ".gww_callsScroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;margin:0 -6px;padding:0 6px}",
  ".gww_callsScroll::-webkit-scrollbar{width:7px}",
  ".gww_callsScroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}",
  ".gww_call{padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".gww_call:last-child{border-bottom:0}",
  // 单笔恰好两行、每行两格：左格居左（过长省略号截断，不挤走右格），右格居右，两行右边缘对齐。
  ".gww_callGrid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;align-items:baseline;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}",
  ".gww_callCell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  // input / output 并排在第二行左格：第一列固定 16ch（够放「input: 999.999K」），
  // 于是每张卡片的 output: 都从同一个 x 开始，跨行对齐。窄了先收列宽，不换行、不重叠。
  ".gww_callIO{display:grid;grid-template-columns:minmax(0,16ch) auto;gap:0 10px}",
  ".gww_callAmount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:500;text-align:right;white-space:nowrap}",
  // 金额左侧的模型名：比金额暗一档，钱是这张卡唯一的高亮。
  ".gww_callModel{color:var(--dsw-alias-label-caption);margin-right:8px}",
  // 命中率配色：≥96% 绿 / 80~96% 黄 / <80% 红。黄档没有对应 alias，用主题的静态 amber。
  ".gww_tokCache{text-align:right;white-space:nowrap}",
  '.gww_tokCache[data-level="ok"]{color:var(--dsw-alias-state-success-primary)}',
  '.gww_tokCache[data-level="warn"]{color:var(--dsw-static-amber-500,#f59e0b)}',
  '.gww_tokCache[data-level="bad"]{color:var(--dsw-alias-state-error-primary)}',
  // margin-top:auto：左列内容不够高时贴住列底，内容超了自然跟在最后一个区块后面。
  ".gww_footer{color:var(--dsw-alias-label-caption);flex:none;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}",
  // 热力图
  ".gww_heat{--gww-heat:#31a06b;display:flex;flex-direction:column;gap:6px}",
  ".gww_heat{--h0:var(--dsw-alias-bg-layer-3);--h1:#9be9a8;--h1:light-dark(#9be9a8,#0e4429);--h2:#40c463;--h2:light-dark(#40c463,#006d32);--h3:#30a14e;--h3:light-dark(#30a14e,#26a641);--h4:#216e39;--h4:light-dark(#216e39,#39d353)}",
  ".gww_heat{--t1:light-dark(#14532d,#d6f5e2);--t2:light-dark(#0b3a20,#eafff2);--t3:#062d16;--t4:light-dark(#ffffff,#052411)}",
  ".gww_heatHead{gap:4px;display:grid;grid-template-columns:repeat(7,1fr)}",
  ".gww_heatWd{text-align:center;color:var(--dsw-alias-label-caption);font-size:10px;line-height:12px}",
  ".gww_heatGrid{gap:4px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}",
  ".gww_heatCell{aspect-ratio:5/4;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);transition:transform .12s ease,box-shadow .12s ease}",
  '.gww_heatCell[data-tier="0"]{background:var(--h0)}',
  '.gww_heatCell[data-tier="1"]{color:var(--t1);background:var(--h1)}',
  '.gww_heatCell[data-tier="2"]{color:var(--t2);background:var(--h2)}',
  '.gww_heatCell[data-tier="3"]{color:var(--t3);background:var(--h3)}',
  '.gww_heatCell[data-tier="4"]{color:var(--t4);background:var(--h4)}',
  ".gww_heatCell[data-none]{border:1px dashed var(--dsw-alias-border-l2);background:0 0}",
  ".gww_heatCell[data-future]{border:none;background:0 0}",
  ".gww_heatCell[data-today]{box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--gww-heat) 85%,Canvas)}",
  ".gww_heatCell:not([data-future]){cursor:default;position:relative}",
  ".gww_heatCell:not([data-future]):hover{transform:scale(1.08);box-shadow:0 0 0 2px color-mix(in oklab,var(--gww-heat) 45%,transparent),0 2px 8px color-mix(in oklab,var(--gww-heat) 25%,transparent);z-index:2}",
  ".gww_tip{position:absolute;transform:translate(-50%,-100%);background:var(--dsw-alias-bg-overlay,Canvas);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:var(--dsw-shadow-lv2);padding:6px 9px;pointer-events:none;white-space:nowrap;z-index:6;display:flex;flex-direction:column;gap:1px}",
  ".gww_tipDate{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}",
  ".gww_tipVal{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums}",
  ".gww_tipSub{color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px}",
  ".gww_heatLegend{align-items:center;gap:4px;display:flex;justify-content:flex-end;color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}",
  ".gww_heatSwatch{width:10px;height:10px;border-radius:3px;display:inline-block}",
  '.gww_heatSwatch[data-lv="1"]{background:var(--h1)}',
  '.gww_heatSwatch[data-lv="2"]{background:var(--h2)}',
  '.gww_heatSwatch[data-lv="3"]{background:var(--h3)}',
  '.gww_heatSwatch[data-lv="4"]{background:var(--h4)}',
  ".gww_heatDash{width:10px;height:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:3px;display:inline-block;margin-left:6px}",
  // 插件配置页
  ".gww_cfg{display:flex;flex-direction:column;gap:10px;max-width:440px}",
  ".gww_cfgLabel{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}",
  ".gww_cfgHint{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin:0}",
  ".gww_cfgInput{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:6px 9px;font:inherit;font-size:12px}",
  ".gww_cfgInput:focus{outline:none;border-color:var(--dsw-alias-label-tertiary)}",
  ".gww_cfgRow{display:flex;align-items:center;gap:8px}",
  ".gww_cfgBtn{cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 14px;font:inherit;font-size:12px}",
  ".gww_cfgBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".gww_cfgBtn[data-busy]{opacity:.5;cursor:default}",
  ".gww_cfgMsg{font-size:12px;line-height:18px;margin:0}",
  '.gww_cfgMsg[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}',
  '.gww_cfgMsg[data-tone="err"]{color:var(--dsw-alias-state-error-primary)}'
].join("");
function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = LOGGER_KEY;
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
function fmtMoney(money) {
  if (money === void 0) return "\u2014";
  if (typeof money.display === "number") {
    const n = money.display;
    return `\xA5${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
  }
  return typeof money.quota === "number" ? `${money.quota.toLocaleString()} \u989D\u5EA6` : "\u2014";
}
function fmtCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "\u2014";
}
function fmtTokens(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
  if (value < 1e3) return String(Math.round(value));
  const scales = [[1e3, "K"], [1e6, "M"], [1e9, "B"], [1e12, "T"]];
  let tier = 0;
  for (let i = 0; i < scales.length; i++) if (value >= scales[i][0]) tier = i;
  while (tier < scales.length - 1 && Number((value / scales[tier][0]).toFixed(3)) >= 1e3) tier += 1;
  const [scale, suffix] = scales[tier];
  return Number((value / scale).toFixed(3)) + suffix;
}
var LOW_CNY = 5;
function isLowBalance(money) {
  if (money === void 0) return false;
  if (typeof money.display === "number" && Number.isFinite(money.display)) {
    return money.display < LOW_CNY;
  }
  return false;
}
function agoLabel(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1e3));
  if (seconds < 90) return "\u521A\u521A";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
  return `${Math.round(hours / 24)} \u5929\u524D`;
}
function clockLabel(at) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function hostOf(origin) {
  try {
    const url = new URL(origin);
    return url.port === "" ? url.hostname : `${url.hostname}:${url.port}`;
  } catch {
    return origin;
  }
}
function IconWallet({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1.75", y: "3.25", width: "12.5", height: "9.5", rx: "2", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1.75 6.5h12.5", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "11.25", cy: "9.75", r: "1", fill: "currentColor" })
  ] });
}
function IconRefresh({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13 8a5 5 0 1 1-1.47-3.54", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13.6 2.6v3.2h-3.2", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}
function IconClose({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }) });
}
async function loadWallet(route, filter, signal) {
  const params = new URLSearchParams();
  if (route !== void 0 && route !== "") params.set("route", route);
  if (filter.model !== void 0) params.set("model", filter.model);
  if (filter.token !== void 0) params.set("token", filter.token);
  const query = params.toString();
  const response = await fetch(query === "" ? PATH : PATH + "?" + query, {
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function isBundle(value) {
  return value !== void 0 && "accounts" in value;
}
function isWalletError(value) {
  return value !== void 0 && "ok" in value && value.ok === false;
}
function walletErrorCopy(error) {
  if (error === "no-access-token") return "\u8FD8\u6CA1\u914D New API \u8BBF\u95EE\u4EE4\u724C\u3002\u5728\u5DE6\u4FA7\u680F\u300C\u63D2\u4EF6\u300D\u9875\u91CC\u627E\u5230\u672C\u63D2\u4EF6\uFF0C\u586B\u8FDB\u300C\u8BBF\u95EE\u4EE4\u724C\u300D\u5373\u53EF\u3002";
  if (error === "unknown-account") return "\u540D\u5355\u91CC\u6CA1\u6709\u8FD9\u6761\u8DEF\u7531\u3002";
  if (error === "no-provider") return "\u8FD8\u6CA1\u6709\u914D\u7F6E\u5E26\u5730\u5740\u7684\u6A21\u578B\u8DEF\u7531\u3002";
  if (error === "no-newapi") return "\u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u8DEF\u7531\u91CC\u6CA1\u6709\u4E00\u6761\u662F New API \u7AD9\u70B9\u3002";
  if (error === "timeout" || error === "unreachable") return "\u8FDE\u4E0D\u4E0A\u7AD9\u70B9\u3002";
  if (error === "internal" || error === "unexpected response") return "\u672C\u673A\u8BFB\u53D6\u51FA\u9519\u3002";
  return `\u8D26\u672C\uFF1A${error}`;
}
function useDismissOnOutsidePointer(ref, open, close) {
  const closeRef = (0, import_react.useRef)(close);
  closeRef.current = close;
  (0, import_react.useEffect)(() => {
    if (!open || typeof document === "undefined") return void 0;
    const onPointer = (event) => {
      const node = ref.current;
      const target = event.target;
      if (node === null || target === null || node.contains(target)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [ref, open]);
}
function StatCards({ snapshot }) {
  const low = isLowBalance(snapshot.remaining);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stats", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stat", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statValue", ...low ? { "data-low": "" } : {}, children: fmtMoney(snapshot.remaining) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statLabel", children: "\u4F59\u989D" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stat", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statValue", children: snapshot.todayAvailable ? fmtMoney(snapshot.today) : "\u2014" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statLabel", children: "\u4ECA\u65E5\u5B9E\u6263" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stat", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statValue", children: fmtMoney(snapshot.used) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statLabel", children: "\u7D2F\u8BA1\u5DF2\u7528" })
    ] })
  ] });
}
function BucketRows({
  buckets,
  amounts
}) {
  const rows = [
    { name: "\u8BF7\u6C42", value: fmtCount(buckets.requests) },
    { name: "\u8F93\u5165(\u672A\u7F13\u5B58)", value: fmtTokens(buckets.inputTokens), amount: amounts?.input },
    { name: "\u8F93\u51FA", value: fmtTokens(buckets.outputTokens), amount: amounts?.output }
  ];
  if (buckets.cacheReadTokens !== void 0) rows.push({ name: "\u7F13\u5B58\u547D\u4E2D", value: fmtTokens(buckets.cacheReadTokens), amount: amounts?.cacheRead });
  if (buckets.cacheWriteTokens !== void 0) rows.push({ name: "\u7F13\u5B58\u5199\u5165", value: fmtTokens(buckets.cacheWriteTokens), amount: amounts?.cacheWrite });
  if (buckets.totalTokens !== void 0) rows.push({ name: "\u5408\u8BA1 token", value: fmtTokens(buckets.totalTokens), amount: amounts?.total });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", style: { marginTop: 0 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: "\u4ECA\u65E5\u7528\u91CF" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_rows", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_rowName", children: row.name }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_rowValue", children: [
        row.value,
        row.amount !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          " \xB7 ",
          fmtMoney(row.amount)
        ] })
      ] })
    ] }, row.name)) })
  ] });
}
function GroupList({
  title,
  rows,
  dim,
  selected,
  onPick
}) {
  if (rows.length === 0) return null;
  const max = rows.reduce((acc, row) => row.quota > acc ? row.quota : acc, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_rows", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "gww_model",
        ...selected === row.name ? { "data-on": "" } : {},
        onClick: () => onPick(dim, row.name),
        "aria-pressed": selected === row.name,
        title: (selected === row.name ? "\u518D\u70B9\u4E00\u6B21\u53D6\u6D88\u7B5B\u9009 \xB7 " : "\u70B9\u4E00\u4E0B\u7B5B\u53F3\u4FA7 \xB7 ") + "token " + fmtCount(row.tokens) + " \xB7 \u8D26\u672C\u989D\u5EA6\u70B9 " + fmtCount(row.quota),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_modelTop", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_modelName", children: row.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_modelValue", children: fmtMoney(row.amount ?? { quota: row.quota, display: row.quota === 0 ? 0 : void 0, currency: "CNY" }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_modelBar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: max > 0 ? Math.max(row.quota / max * 100, 2) + "%" : "0%" } }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_modelMeta", children: [
            fmtCount(row.calls),
            " \u6B21"
          ] })
        ]
      },
      row.name
    )) })
  ] });
}
function nextFilter(current, dim, value) {
  const next = {};
  const model = dim === "model" ? current.model === value ? void 0 : value : current.model;
  const token = dim === "token" ? current.token === value ? void 0 : value : current.token;
  if (model !== void 0 && model !== "") next.model = model;
  if (token !== void 0 && token !== "") next.token = token;
  return next;
}
function AppliedBar({
  filter,
  onPick
}) {
  const model = filter?.model;
  const token = filter?.token;
  if (model === void 0 && token === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_applied", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_appliedLabel", children: "\u5DF2\u7B5B" }),
    model !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "gww_chip", onClick: () => onPick("model", model), title: "\u53D6\u6D88\u6A21\u578B\u7B5B\u9009", children: [
      "\u6A21\u578B ",
      model,
      " \u2715"
    ] }),
    token !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "gww_chip", onClick: () => onPick("token", token), title: "\u53D6\u6D88\u4EE4\u724C\u7B5B\u9009", children: [
      "\u4EE4\u724C ",
      token,
      " \u2715"
    ] })
  ] });
}
function cacheHint(call) {
  const cached = call.cacheTokens;
  if (typeof cached !== "number" || !Number.isFinite(cached) || cached <= 0) return void 0;
  const prompt = call.promptTokens;
  if (typeof prompt !== "number" || !Number.isFinite(prompt) || prompt <= 0) return void 0;
  const hit = Math.min(cached / prompt, 1);
  const percent = Number((hit * 100).toFixed(1));
  return {
    text: `\u7F13\u5B58 ${fmtTokens(cached)} \xB7 ${percent}%`,
    level: percent >= 96 ? "ok" : percent >= 80 ? "warn" : "bad"
  };
}
function CallRows({ calls }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_rows", children: calls.map((call, index) => {
    const hint = cacheHint(call);
    const usage = call.promptTokens !== void 0 || call.completionTokens !== void 0;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_call", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_callGrid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_callCell", children: [
        clockLabel(call.createdAt),
        call.tokenName !== void 0 ? ` - ${call.tokenName}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_callAmount", children: [
        call.model !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_callModel", children: [
          call.model,
          " "
        ] }),
        fmtMoney(call.amount)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_callCell gww_callIO", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "input: ",
          usage ? fmtTokens(call.promptTokens ?? 0) : "\u2014"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "output: ",
          usage ? fmtTokens(call.completionTokens ?? 0) : "\u2014"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_tokCache", "data-level": hint?.level, children: hint?.text })
    ] }) }, call.requestId ?? `${call.createdAt}-${index}`);
  }) });
}
var HEAT_WEEKS = 4;
var HEAT_WEEKDAY_CHARS = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
function localDateStr(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function HeatmapSection({ points }) {
  const gridRef = (0, import_react.useRef)(null);
  const [tip, setTip] = (0, import_react.useState)(void 0);
  const byDate = new Map(points.map((point) => [point.date, point]));
  const now = /* @__PURE__ */ new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = localDateStr(today);
  const wdIndex = (today.getDay() + 6) % 7;
  const maxQuota = points.reduce((acc, p) => p.available && p.quota > acc ? p.quota : acc, 0);
  let totalCny = 0;
  for (const p of points) {
    if (p.available && typeof p.amount?.display === "number") totalCny += p.amount.display;
  }
  const tierOf = (p) => {
    if (!p.available || p.quota <= 0 || maxQuota <= 0) return 0;
    const r = p.quota / maxQuota;
    return r >= 0.7 ? 4 : r >= 0.45 ? 3 : r >= 0.2 ? 2 : 1;
  };
  const cells = [];
  for (let row = 0; row < HEAT_WEEKS; row++) {
    for (let col = 0; col < 7; col++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - wdIndex - (HEAT_WEEKS - 1 - row) * 7 + col);
      const dateStr = localDateStr(d);
      cells.push({
        key: `${row}-${col}`,
        dateStr,
        weekday: "\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D"[d.getDay()] ?? "",
        future: dateStr > todayStr,
        point: byDate.get(dateStr)
      });
    }
  }
  const enter = (event, cell) => {
    const grid = gridRef.current;
    if (grid === null) return;
    const cr = event.currentTarget.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    const p = cell.point;
    let text;
    let sub;
    if (p === void 0 || !p.available) {
      text = "\u65E0\u6570\u636E";
    } else {
      text = fmtMoney(p.amount ?? { quota: p.quota, display: p.quota === 0 ? 0 : void 0, currency: "CNY" });
      sub = p.calls !== void 0 ? `${fmtCount(p.calls)} \u6B21\u8C03\u7528` : void 0;
    }
    setTip({
      left: Math.min(Math.max(cr.left - gr.left + cr.width / 2, 52), gr.width - 52),
      top: cr.top - gr.top - 6,
      date: cell.dateStr,
      weekday: cell.weekday,
      text,
      sub
    });
  };
  const leave = () => setTip(void 0);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_sectionTitle", children: [
      "\u8FD1 4 \u5468\u5B9E\u6263 \xB7 \u5408\u8BA1 ",
      totalCny < 1 && totalCny > 0 ? totalCny.toFixed(4) : totalCny.toFixed(2),
      " \u5143"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_heat", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_heatHead", children: HEAT_WEEKDAY_CHARS.map((wd) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_heatWd", children: wd }, wd)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_heatGrid", ref: gridRef, onMouseLeave: leave, children: [
        cells.map((cell) => cell.future ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_heatCell", "data-future": "" }, cell.key) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            className: "gww_heatCell",
            ...cell.point !== void 0 && cell.point.available ? { "data-tier": String(tierOf(cell.point)) } : { "data-none": "" },
            ...cell.dateStr === todayStr ? { "data-today": "" } : {},
            onMouseEnter: (event) => enter(event, cell),
            children: cell.point !== void 0 ? cell.dateStr.endsWith("-01") ? `${Number(cell.dateStr.slice(5, 7))}\u6708` : Number(cell.dateStr.slice(8)) : ""
          },
          cell.key
        )),
        tip !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_tip", style: { left: tip.left, top: tip.top }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_tipDate", children: [
            tip.date.slice(5).replace("-", "/"),
            " \xB7 \u5468",
            tip.weekday
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_tipVal", children: tip.text }),
          tip.sub !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_tipSub", children: tip.sub })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_heatLegend", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5C11" }),
        [1, 2, 3, 4].map((lv) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_heatSwatch", "data-lv": lv }, lv)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u591A" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_heatDash", "aria-hidden": "true" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u65E0\u6570\u636E" })
      ] })
    ] })
  ] });
}
function WalletBody({
  snapshot,
  error,
  fail,
  loading,
  onRetry,
  onPick
}) {
  if (loading === "block" || snapshot === void 0 && fail === void 0 && error === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u8BFB\u53D6\u4E2D\u2026" });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_fail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: fail?.title ?? "\u8BFB\u4E0D\u5230\u8D26\u672C\u3002" }),
      fail?.note !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: fail.note }),
      fail === void 0 && error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
    ] });
  }
  const truncated = snapshot.todayLogsTruncated === true && snapshot.todayLedgerRows !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_cols gww_content", ...loading === "dim" ? { "data-loading": "" } : {}, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_colL", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCards, { snapshot }),
      !snapshot.todayAvailable && snapshot.todayUnavailableReason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u7AD9\u70B9\u6CA1\u6709\u5F00\u653E\u4ECA\u65E5\u7EDF\u8BA1\u3002" }),
      snapshot.isAvailable === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: "\u8FD9\u4E2A\u8D26\u6237\u5F53\u524D\u4E0D\u53EF\u7528\u3002" }),
      snapshot.dailyHistory !== void 0 && snapshot.dailyHistory.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeatmapSection, { points: snapshot.dailyHistory }),
      snapshot.todayModels !== void 0 && snapshot.todayModels.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        GroupList,
        {
          title: "\u4ECA\u65E5\u6309\u6A21\u578B",
          rows: snapshot.todayModels,
          dim: "model",
          selected: snapshot.filter?.model,
          onPick
        }
      ),
      snapshot.todayTokenRows !== void 0 && snapshot.todayTokenRows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        GroupList,
        {
          title: "\u4ECA\u65E5\u6309\u4EE4\u724C",
          rows: snapshot.todayTokenRows,
          dim: "token",
          selected: snapshot.filter?.token,
          onPick
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_footer", title: new Date(snapshot.fetchedAt).toLocaleString(), children: [
        hostOf(snapshot.origin),
        " \xB7 ",
        truncated ? `\u4ECA\u65E5 ${fmtCount(snapshot.todayLedgerRows)} \u884C\uFF0C\u5DF2\u7EDF\u8BA1 ${fmtCount(snapshot.todayLogRows ?? 0)} \u884C \xB7 ` : "",
        loading === "dim" ? "\u8BFB\u53D6\u4E2D\u2026" : fail !== void 0 ? `\u4E0A\u6B21\u8BFB\u53D6 \xB7 ${agoLabel(snapshot.fetchedAt)}` : `${agoLabel(snapshot.fetchedAt)}\u4ECE\u7AD9\u70B9\u8D26\u672C\u8BFB\u53D6`
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_colR", children: [
      fail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_fail", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: fail.title }),
        fail.note !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: fail.note }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppliedBar, { filter: snapshot.filter, onPick }),
      snapshot.todayTokens !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BucketRows, { buckets: snapshot.todayTokens, amounts: snapshot.todayAmounts }),
      snapshot.recentCalls !== void 0 && snapshot.recentCalls.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_scrollFix", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: "\u6700\u8FD1\u8C03\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_callsScroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CallRows, { calls: snapshot.recentCalls }) })
      ] })
    ] })
  ] });
}
function WalletSeat({ wide, useSessions }) {
  ensureCss();
  const [open, setOpen] = (0, import_react.useState)(false);
  const [inspectRoute, setInspectRoute] = (0, import_react.useState)(void 0);
  const [bundle, setBundle] = (0, import_react.useState)(void 0);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [nonce, setNonce] = (0, import_react.useState)(0);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [pending, setPending] = (0, import_react.useState)(void 0);
  const [anchor, setAnchor] = (0, import_react.useState)(void 0);
  const [badgeValue, setBadgeValue] = (0, import_react.useState)("");
  const [filter, setFilter] = (0, import_react.useState)({});
  const [lastGood, setLastGood] = (0, import_react.useState)({});
  const lastGoodRef = (0, import_react.useRef)(lastGood);
  lastGoodRef.current = lastGood;
  const root = (0, import_react.useRef)(null);
  const running = useSessions((state) => state.ids.some((id) => state.byId[id]?.running === true));
  const filterKey = (filter.model ?? "") + "\0" + (filter.token ?? "");
  const applyFilter = (next) => {
    const key = (next.model ?? "") + "\0" + (next.token ?? "");
    if (key === filterKey) return;
    setPending("switch");
    setFilter(next);
  };
  const pickFilter = (dim, value) => {
    applyFilter(nextFilter(filter, dim, value));
  };
  (0, import_react.useEffect)(() => {
    const controller = new AbortController();
    setBusy(true);
    loadWallet(inspectRoute, filter, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        if (isWalletError(data)) {
          setError(walletErrorCopy(data.error));
          setBusy(false);
          return;
        }
        if (!isBundle(data)) {
          setError(walletErrorCopy("unexpected response"));
          setBusy(false);
          return;
        }
        setBundle(data);
        setBusy(false);
        if (data.wallet.ok === true) {
          setLastGood((prev) => ({ ...prev, [data.wallet.route]: data.wallet }));
          setError(void 0);
          setBadgeValue(fmtMoney(data.wallet.today));
        } else {
          setError(walletErrorCopy(data.wallet.error));
          const kept = lastGoodRef.current[data.selected];
          if (kept === void 0) setBadgeValue("");
        }
      },
      (err) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(/^HTTP \d+$/.test(message) ? "\u672C\u673A\u6216\u7AD9\u70B9\u6CA1\u6709\u54CD\u5E94\u3002" : message);
        setBusy(false);
      }
    );
    return () => controller.abort();
  }, [nonce, inspectRoute, filterKey]);
  const pollMs = bundle?.refreshMs ?? DEFAULT_REFRESH_MS;
  (0, import_react.useEffect)(() => {
    if (!running && !open) return void 0;
    const timer = setInterval(() => {
      setPending("auto");
      setNonce((n) => n + 1);
    }, pollMs);
    return () => clearInterval(timer);
  }, [running, open, pollMs]);
  const wasRunning = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    const finished = wasRunning.current && !running;
    wasRunning.current = running;
    if (!finished) return void 0;
    setPending("auto");
    setNonce((n) => n + 1);
    const timer = setTimeout(() => {
      setPending("auto");
      setNonce((n) => n + 1);
    }, 2e4);
    return () => clearTimeout(timer);
  }, [running]);
  useDismissOnOutsidePointer(root, open, () => setOpen(false));
  (0, import_react.useEffect)(() => {
    if (!open) return void 0;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  (0, import_react.useLayoutEffect)(() => {
    if (!open) return void 0;
    const place = () => {
      const rect = root.current?.getBoundingClientRect();
      if (rect === void 0) return;
      setAnchor({
        left: wide === false ? Math.min(rect.right + 8, Math.max(12, window.innerWidth - (PANEL_WIDTH + 24))) : Math.min(rect.left, Math.max(12, window.innerWidth - (PANEL_WIDTH + 24))),
        bottom: window.innerHeight - rect.top + 8
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, wide]);
  const selected = inspectRoute ?? bundle?.selected ?? "";
  const live = bundle?.wallet.ok === true ? bundle.wallet : void 0;
  const snapshot = live?.route === selected ? live : lastGood[selected];
  const routeReady = snapshot !== void 0 && snapshot.route === selected;
  const loading = !busy ? false : !routeReady ? "block" : pending === "manual" ? "dim" : false;
  const failNote = bundle?.wallet.ok === false ? bundle.wallet.detail : error;
  const fail = loading !== false || error === void 0 ? void 0 : snapshot !== void 0 ? {
    title: "\u5237\u65B0\u5931\u8D25\uFF0C\u4ECD\u663E\u793A\u4E0A\u6B21\u6570\u5B57\u3002",
    ...failNote !== void 0 && failNote !== "" ? { note: failNote } : {}
  } : bundle?.wallet.ok === false ? {
    title: walletErrorCopy(bundle.wallet.error),
    ...bundle.wallet.detail !== void 0 ? { note: bundle.wallet.detail } : {}
  } : { title: error };
  const low = snapshot !== void 0 && loading !== "block" && isLowBalance(snapshot.remaining);
  const reload = () => {
    if (busy) return;
    setPending("manual");
    setNonce((n) => n + 1);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: root, className: wide === false ? "gww_layer gww_rail" : "gww_layer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "gww_badge",
        ...open ? { "data-active": "" } : {},
        title: low ? "New API \u8D26\u672C \xB7 \u4F59\u989D\u504F\u4F4E" : "New API \u8D26\u672C",
        "aria-label": low ? "New API \u8D26\u672C\uFF0C\u4F59\u989D\u504F\u4F4E" : "New API \u8D26\u672C",
        "aria-expanded": open,
        onClick: () => setOpen((value) => !value),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_badgeIcon", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconWallet, { size: wide === false ? 18 : 14 }),
            low && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_dot", "aria-hidden": "true" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_badgeLabel", children: "New API \u8D26\u672C" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_badgeValue", ...loading === "block" ? { "data-wait": "" } : {}, children: badgeValue })
        ]
      }
    ),
    open && anchor !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: "gww_panel",
        role: "dialog",
        "aria-label": "New API \u8D26\u672C",
        style: { left: anchor.left, bottom: anchor.bottom },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_title", children: "New API \u8D26\u672C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_headerActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "gww_iconButton",
                  ...busy ? { "data-busy": "" } : {},
                  "aria-label": "\u5237\u65B0",
                  onClick: reload,
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconRefresh, { size: 14 })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "gww_iconButton",
                  "aria-label": "\u5173\u95ED",
                  onClick: () => setOpen(false),
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconClose, { size: 16 })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_body", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            WalletBody,
            {
              snapshot,
              error,
              fail,
              loading,
              onRetry: reload,
              onPick: pickFilter
            }
          ) })
        ]
      }
    )
  ] });
}
function PluginConfigSummary() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "New API \u8D26\u672C\uFF1A\u4F59\u989D\u3001\u4ECA\u65E5\u5B9E\u6263\u4E0E\u7528\u91CF\u5206\u6876" });
}
var MISSING_FORM_STATE = { status: "unavailable", value: void 0, revision: void 0, writable: false };
function missingFormHook(select) {
  return select(MISSING_FORM_STATE);
}
var identityFormState = (state) => state;
function PluginConfigForm({ useWalletConfigForm, mutate }) {
  const [draft, setDraft] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [msg, setMsg] = (0, import_react.useState)(void 0);
  const state = (useWalletConfigForm ?? missingFormHook)(identityFormState);
  if (mutate === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_cfgHint", children: "\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u6709\u66B4\u9732\u8BBE\u7F6E\u5199\u5165\u901A\u9053\uFF0C\u65E0\u6CD5\u5728\u6B64\u914D\u7F6E\u3002" });
  }
  if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_cfgHint", children: "\u8BFB\u53D6\u4E2D\u2026" });
  const writable = state.writable !== false;
  const run = async (ops, okText) => {
    setBusy(true);
    setMsg(void 0);
    try {
      const accepted = await mutate(ops, state.revision);
      setMsg(accepted ? { tone: "ok", text: okText } : { tone: "err", text: "\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u5199\u5165\u3002" });
      if (accepted) setDraft("");
    } catch (failure) {
      setMsg({ tone: "err", text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const token = draft.trim();
    if (token === "") {
      setMsg({ tone: "err", text: "\u5148\u586B\u4E00\u4E2A\u8BBF\u95EE\u4EE4\u724C\uFF1B\u8981\u6E05\u9664\u5DF2\u5B58\u7684\u4EE4\u724C\u8BF7\u70B9\u300C\u6E05\u9664\u300D\u3002" });
      return;
    }
    void run([{ op: "set", path: ["accessToken"], value: token }], "\u5DF2\u4FDD\u5B58\u3002\u9762\u677F\u4E0B\u4E00\u6B21\u5237\u65B0\u5C31\u4F1A\u7528\u4E0A\u65B0\u4EE4\u724C\u3002");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_cfg", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "gww_cfgLabel", htmlFor: "gww_cfg_token", children: "\u8BBF\u95EE\u4EE4\u724C" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "gww_cfgHint", children: [
        "New API \u7AD9\u70B9\u300C\u4E2A\u4EBA\u8BBE\u7F6E \u2192 \u8BBF\u95EE\u4EE4\u724C\u300D\u91CC\u751F\u6210\u7684\u90A3\u4E00\u4E32\uFF0C",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u4E0D\u662F" }),
        " sk- \u5F00\u5934\u7684\u6A21\u578B\u5BC6\u94A5\u3002 \u4EE4\u724C",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u53EA\u5199\u4E0D\u8BFB" }),
        "\u2014\u2014\u5BBF\u4E3B\u6309 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "role('secret')" }),
        " \u8131\u654F\uFF0C\u4FDD\u5B58\u540E\u4E0D\u4F1A\u56DE\u663E\uFF0C \u8FD9\u91CC\u4E5F\u4E0D\u663E\u793A\u300C\u662F\u5426\u5DF2\u914D\u7F6E\u300D\u3002\u60F3\u77E5\u9053\u914D\u6CA1\u914D\uFF0C\u770B\u4FA7\u8FB9\u680F\u8D26\u672C\u9762\u677F\uFF1A\u6CA1\u914D\u5B83\u4F1A\u76F4\u63A5\u8BF4\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id: "gww_cfg_token",
        type: "password",
        className: "gww_cfgInput",
        value: draft,
        autoComplete: "off",
        disabled: busy || !writable,
        placeholder: "\u7C98\u8D34\u8BBF\u95EE\u4EE4\u724C\uFF08\u7559\u7A7A\u70B9\u300C\u6E05\u9664\u300D\u53EF\u5220\u9664\u5DF2\u5B58\u7684\uFF09",
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") save();
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_cfgRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "gww_cfgBtn",
          ...busy ? { "data-busy": "" } : {},
          disabled: busy || !writable,
          onClick: save,
          children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "gww_cfgBtn",
          disabled: busy || !writable,
          onClick: () => {
            void run([{ op: "unset", path: ["accessToken"] }], "\u5DF2\u6E05\u9664\u3002");
          },
          children: "\u6E05\u9664"
        }
      ),
      !writable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_cfgHint", children: "\u5F53\u524D profile \u4E0D\u63A5\u53D7\u5199\u5165\u3002" })
    ] }),
    msg !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_cfgMsg", "data-tone": msg.tone, children: msg.text })
  ] });
}
function PluginConfigPage(props) {
  return props.view === "summary" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PluginConfigSummary, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PluginConfigForm, { ...props });
}
var name = LOGGER_KEY;
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: LOGGER_KEY,
    order: 25
  }, WalletSeat));
  ctx.inject(["configForms"], (scoped) => {
    const form = scoped.configForms?.get(LOGGER_KEY);
    scoped.slots.inject("plugins.bundle.config", () => scoped.slots.register({
      name: "plugins.bundle.config",
      key: PACKAGE_NAME,
      order: 25,
      // 状态走标准 hook 座位（渲染器绑成 useWalletConfigForm 并订阅宿主更新），
      // 写入动作走普通 prop。两者都必须在这里给——槽里拿不到。
      inject: () => ({
        hooks: form !== void 0 ? { walletConfigForm: form } : {},
        mutate: form !== void 0 ? (ops, revision) => form.mutate(ops, revision) : void 0
      })
    }, PluginConfigPage));
  });
}
return module.exports; } });
//# sourceMappingURL=client.js.map
