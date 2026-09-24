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
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var PATH = "/api/newapi-wallet";
var LOGGER_KEY = "loostone-newapi-wallet";
var DEFAULT_REFRESH_MS = 45e3;
var STYLE_ID = "loostone-newapi-wallet/panel.css";
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
  ".gww_panel{z-index:30;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background-color:Canvas;background-image:linear-gradient(rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1),rgb(from var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base)) r g b / 1));width:380px;max-width:calc(100vw - 24px);max-height:76vh;box-shadow:var(--dsw-shadow-lv2);border-radius:12px;flex-direction:column;display:flex;position:fixed;overflow:hidden;backdrop-filter:none;-webkit-backdrop-filter:none}",
  ".gww_header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:10px 12px;display:flex;gap:8px}",
  ".gww_title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;white-space:nowrap}",
  ".gww_headerActions{align-items:center;gap:2px;display:flex;flex:none}",
  ".gww_iconButton{cursor:pointer;width:26px;height:26px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}",
  ".gww_iconButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
  ".gww_iconButton[data-busy]{opacity:.5;cursor:default}",
  ".gww_body{flex:1;min-height:0;padding:12px 14px 14px;overflow-y:auto}",
  ".gww_content[data-loading]{opacity:.45}",
  ".gww_badgeValue[data-wait]{opacity:.55}",
  ".gww_who{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
  ".gww_whoName{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}",
  ".gww_stat{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;min-width:0}",
  ".gww_statValue{color:var(--dsw-alias-label-primary);font-size:16px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".gww_statLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-top:2px}",
  ".gww_section{margin-top:14px}",
  ".gww_sectionTitle{color:var(--dsw-alias-label-tertiary);margin:0 0 6px;font-size:11px;line-height:16px;font-weight:500}",
  ".gww_rows{display:flex;flex-direction:column}",
  ".gww_row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px}",
  ".gww_row:last-child{border-bottom:0}",
  ".gww_rowName{color:var(--dsw-alias-label-tertiary)}",
  ".gww_rowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",
  ".gww_rowValue[data-wrap]{white-space:normal;text-align:right;max-width:68%;word-break:break-all}",
  ".gww_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:8px 0 0}",
  ".gww_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}",
  ".gww_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px;margin:8px 0 0}",
  ".gww_fail{margin:0 0 10px}",
  ".gww_fail .gww_warn{margin:0}",
  ".gww_fail .gww_note{margin:4px 0 0}",
  ".gww_fail .gww_retry{margin-top:6px}",
  ".gww_ok{color:var(--dsw-alias-state-success-primary)}",
  ".gww_footer{color:var(--dsw-alias-label-caption);border-top:1px solid var(--dsw-alias-border-l1);margin-top:14px;padding-top:8px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}",
  ".gww_retry{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:8px;padding:3px 10px;font:inherit;font-size:12px}",
  ".gww_cards{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;padding:0 0 8px;margin:0 0 10px;scrollbar-width:thin}",
  ".gww_card{flex:0 0 auto;min-width:136px;max-width:200px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}",
  ".gww_card[data-active]{border-color:var(--dsw-alias-label-tertiary)}",
  ".gww_cardPick{cursor:pointer;text-align:left;color:inherit;background:0 0;border:none;padding:8px 10px 6px;font-family:inherit;display:flex;flex-direction:column;gap:2px;min-width:0}",
  ".gww_cardPick:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l1)}",
  ".gww_cardName{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_cardHost{color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_cardState{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}",
  ".gww_cardState[data-ok]{color:var(--dsw-alias-state-success-primary)}",
  ".gww_cardConfig{cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:none;border-top:1px solid var(--dsw-alias-border-l1);padding:4px 10px;font:inherit;font-size:11px;line-height:16px}",
  ".gww_cardConfig:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid)}",
  ".gww_dialogLayer{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgb(0 0 0 / .32)}",
  ".gww_dialog{box-sizing:border-box;width:320px;max-width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,Canvas);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:14px}",
  ".gww_dialogTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;margin:0 0 6px}",
  ".gww_fieldLabel{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:10px 0 4px}",
  ".gww_input{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font:inherit;font-size:12px}",
  ".gww_input:focus{outline:none;border-color:var(--dsw-alias-label-tertiary)}",
  ".gww_scopeRow{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:8px;cursor:pointer}",
  ".gww_dialogActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}",
  ".gww_dialogActions .gww_retry{margin-top:0}",
  ".gww_primary{cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 14px;font:inherit;font-size:12px}",
  ".gww_primary:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}",
  ".gww_primary[data-busy]{opacity:.5;cursor:default}",
  ".gww_call{border-bottom:1px solid var(--dsw-alias-border-l1);padding:6px 0}",
  ".gww_call:last-child{border-bottom:0}",
  ".gww_callHead{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:18px}",
  ".gww_callModel{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_callAmount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none}",
  ".gww_callMeta{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin-top:2px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".gww_heat{--gww-heat:#31a06b;display:flex;flex-direction:column;gap:6px}",
  ".gww_heat{--h0:var(--dsw-alias-bg-layer-3);--h1:#9be9a8;--h1:light-dark(#9be9a8,#0e4429);--h2:#40c463;--h2:light-dark(#40c463,#006d32);--h3:#30a14e;--h3:light-dark(#30a14e,#26a641);--h4:#216e39;--h4:light-dark(#216e39,#39d353)}",
  ".gww_heat{--t1:light-dark(#14532d,#d6f5e2);--t2:light-dark(#0b3a20,#eafff2);--t3:#062d16;--t4:light-dark(#ffffff,#052411)}",
  ".gww_heatHead{gap:5px;display:grid;grid-template-columns:repeat(7,1fr)}",
  ".gww_heatWd{text-align:center;color:var(--dsw-alias-label-caption);font-size:10px;line-height:12px}",
  ".gww_heatGrid{gap:5px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}",
  ".gww_heatCell{aspect-ratio:5/4;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);transition:transform .12s ease,box-shadow .12s ease}",
  '.gww_heatCell[data-tier="0"]{background:var(--h0)}',
  '.gww_heatCell[data-tier="1"]{color:var(--t1);background:var(--h1)}',
  '.gww_heatCell[data-tier="2"]{color:var(--t2);background:var(--h2)}',
  '.gww_heatCell[data-tier="3"]{color:var(--t3);background:var(--h3)}',
  '.gww_heatCell[data-tier="4"]{color:var(--t4);background:var(--h4)}',
  ".gww_heatCell[data-none]{border:1px dashed var(--dsw-alias-border-l2);background:0 0}",
  ".gww_heatCell[data-future]{border:none;background:0 0}",
  ".gww_heatCell[data-today]{box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--gww-heat) 85%,Canvas)}",
  ".gww_heatCell:not([data-future]){cursor:default;position:relative}",
  ".gww_heatCell:not([data-future]):hover{transform:scale(1.06);box-shadow:0 0 0 2px color-mix(in oklab,var(--gww-heat) 45%,transparent),0 2px 8px color-mix(in oklab,var(--gww-heat) 25%,transparent);z-index:2}",
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
  ".gww_heatDash{width:10px;height:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:3px;display:inline-block;margin-left:6px}"
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
async function loadWallet(route, signal) {
  const query = route !== void 0 && route !== "" ? `?route=${encodeURIComponent(route)}` : "";
  const response = await fetch(PATH + query, { headers: { accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function saveAccessToken(body) {
  const response = await fetch(PATH, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => void 0);
  throw new Error(payload?.detail ?? saveErrorCopy(payload?.error));
}
function saveErrorCopy(error) {
  if (error === "no-settings") return "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u6682\u65F6\u5B58\u4E0D\u4E86\u4EE4\u724C\u3002";
  if (error === "settings-write-failed") return "\u5199\u5165\u8BBE\u7F6E\u6587\u4EF6\u5931\u8D25\u3002";
  if (error === "forbidden") return "\u8BF7\u6C42\u6765\u6E90\u4E0D\u88AB\u4FE1\u4EFB\uFF0C\u5DF2\u62D2\u7EDD\u3002";
  if (error === "unsupported-media-type" || error === "bad-request") return "\u8BF7\u6C42\u683C\u5F0F\u4E0D\u5BF9\u3002";
  return error !== void 0 && error !== "" ? `\u4FDD\u5B58\u5931\u8D25\uFF1A${error}` : "\u4FDD\u5B58\u5931\u8D25\u3002";
}
function isBundle(value) {
  return value !== void 0 && "accounts" in value;
}
function isWalletError(value) {
  return value !== void 0 && "ok" in value && value.ok === false;
}
function walletErrorCopy(error) {
  if (error === "no-access-token") return "\u8FD9\u6761\u4F9B\u5E94\u5546\u8FD8\u6CA1\u914D\u8BBF\u95EE\u4EE4\u724C\u3002\u70B9\u5361\u7247\u4E0A\u7684\u300C\u914D\u7F6E\u4EE4\u724C\u300D\u586B\u4E00\u4E2A\u3002";
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
function AccountCards({
  accounts,
  selected,
  onSelect,
  onConfigure
}) {
  if (accounts.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_cards", role: "tablist", "aria-label": "New API \u4F9B\u5E94\u5546", children: accounts.map((account) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "gww_card",
      ...account.route === selected ? { "data-active": "" } : {},
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            role: "tab",
            className: "gww_cardPick",
            "aria-selected": account.route === selected,
            onClick: () => onSelect(account.route),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_cardName", children: account.displayName }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_cardHost", children: account.host }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_cardState", ...account.hasAccessKey ? { "data-ok": "" } : {}, children: [
                account.hasAccessKey ? "\u4EE4\u724C\u5DF2\u914D" : "\u672A\u914D\u4EE4\u724C",
                account.isCurrent ? " \xB7 \u5F53\u524D" : ""
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_cardConfig", onClick: () => onConfigure(account.route), children: account.hasAccessKey ? "\u6539\u4EE4\u724C" : "\u914D\u7F6E\u4EE4\u724C" })
      ]
    },
    account.route
  )) });
}
function TokenDialog({
  account,
  saving,
  failure,
  onSave,
  onClose
}) {
  const [token, setToken] = (0, import_react.useState)("");
  const [scope, setScope] = (0, import_react.useState)("route");
  const input = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    input.current?.focus();
  }, []);
  const submit = () => {
    if (!saving) onSave(token.trim(), scope);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: "gww_dialogLayer",
      role: "presentation",
      onPointerDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_dialog", role: "dialog", "aria-modal": "true", "aria-label": `\u914D\u7F6E ${account.displayName} \u7684\u8BBF\u95EE\u4EE4\u724C`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_dialogTitle", children: "\u914D\u7F6E\u8BBF\u95EE\u4EE4\u724C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "New API\u300C\u8BBF\u95EE\u4EE4\u724C\u300D\uFF0C\u5728\u7AD9\u70B9\u7528\u6237\u4E2D\u5FC3\u751F\u6210\u2014\u2014\u4E0D\u662F sk- \u6A21\u578B\u5BC6\u94A5\u3002\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\uFF0C\u4E0D\u7528\u91CD\u542F\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "gww_fieldLabel", htmlFor: "gww_token", children: "\u8BBF\u95EE\u4EE4\u724C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "gww_token",
            ref: input,
            type: "password",
            className: "gww_input",
            value: token,
            autoComplete: "off",
            placeholder: account.hasAccessKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\uFF08\u7559\u7A7A\u4FDD\u5B58\u5373\u6E05\u9664\uFF09" : "\u7C98\u8D34\u8BBF\u95EE\u4EE4\u724C",
            onChange: (event) => setToken(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") submit();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "gww_scopeRow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "radio", name: "gww_scope", checked: scope === "route", onChange: () => setScope("route") }),
          "\u53EA\u7528\u4E8E ",
          account.displayName
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "gww_scopeRow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "radio", name: "gww_scope", checked: scope === "global", onChange: () => setScope("global") }),
          "\u4F5C\u4E3A\u6240\u6709\u4F9B\u5E94\u5546\u7684\u9ED8\u8BA4\u4EE4\u724C"
        ] }),
        failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_error", children: failure }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_dialogActions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onClose, children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "gww_primary",
              ...saving ? { "data-busy": "" } : {},
              onClick: submit,
              children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
            }
          )
        ] })
      ] })
    }
  );
}
function BucketRows({
  title,
  buckets,
  amounts
}) {
  const rows = [
    { name: "\u8BF7\u6C42", value: fmtCount(buckets.requests) },
    { name: "\u8F93\u5165(\u672A\u7F13\u5B58)", value: fmtCount(buckets.inputTokens), amount: amounts?.input },
    { name: "\u8F93\u51FA", value: fmtCount(buckets.outputTokens), amount: amounts?.output }
  ];
  if (buckets.cacheReadTokens !== void 0) rows.push({ name: "\u7F13\u5B58\u547D\u4E2D", value: fmtCount(buckets.cacheReadTokens), amount: amounts?.cacheRead });
  if (buckets.totalTokens !== void 0) rows.push({ name: "\u5408\u8BA1 token", value: fmtCount(buckets.totalTokens), amount: amounts?.total });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: title }),
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
function ModelRows({ models }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: "\u4ECA\u65E5\u6309\u6A21\u578B" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_rows", children: models.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: "gww_row",
        title: "token " + fmtCount(row.tokens) + " \xB7 \u8D26\u672C\u989D\u5EA6\u70B9 " + fmtCount(row.quota),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_rowName", children: row.model }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gww_rowValue", children: [
            fmtMoney(row.amount ?? { quota: row.quota, display: row.quota === 0 ? 0 : void 0, currency: "CNY" }),
            " \xB7 ",
            fmtCount(row.calls),
            " \u6B21"
          ] })
        ]
      },
      row.model
    )) })
  ] });
}
function CallRows({ calls }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_sectionTitle", children: "\u6700\u8FD1\u8C03\u7528" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_rows", children: calls.map((call, index) => {
      const meta = [
        clockLabel(call.createdAt),
        call.promptTokens !== void 0 || call.completionTokens !== void 0 ? `${fmtCount(call.promptTokens ?? 0)}\u2192${fmtCount(call.completionTokens ?? 0)} tok` : void 0,
        call.cacheTokens !== void 0 ? `\u7F13\u5B58 ${fmtCount(call.cacheTokens)}` : void 0,
        call.tokenName !== void 0 ? `\u4EE4\u724C ${call.tokenName}` : void 0,
        call.requestId !== void 0 ? `#${call.requestId.slice(-8)}` : void 0
      ].filter((value) => value !== void 0);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_call", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_callHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_callModel", children: call.model ?? "\u672A\u77E5\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gww_callAmount", children: fmtMoney(call.amount) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_callMeta", children: meta.join(" \xB7 ") })
      ] }, call.requestId ?? `${call.createdAt}-${index}`);
    }) })
  ] });
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
      "\u8FD1 4 \u5468\u9010\u65E5\u5B9E\u6263 \xB7 \u5408\u8BA1 ",
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
  wallet,
  error,
  fail,
  accounts,
  selected,
  loading,
  onSelect,
  onConfigure,
  onRetry
}) {
  const cards = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    AccountCards,
    {
      accounts,
      selected,
      onSelect,
      onConfigure
    }
  );
  if (loading === "block") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      cards,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u8BFB\u53D6\u4E2D\u2026" })
    ] });
  }
  if (snapshot === void 0 && fail !== void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      cards,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_fail", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: fail.title }),
        fail.note !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: fail.note }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
      ] })
    ] });
  }
  if (error !== void 0 && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      cards,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_error", children: "\u8BFB\u4E0D\u5230\u8D26\u672C\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
    ] });
  }
  if (wallet?.ok === false && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      cards,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: walletErrorCopy(wallet.error) }),
      wallet.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: wallet.detail }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
    ] });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      cards,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u8BFB\u53D6\u4E2D\u2026" })
    ] });
  }
  const who = [snapshot.displayName, "New API", snapshot.keyName].filter((value) => value !== void 0 && value !== "").join(" \xB7 ");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    cards,
    fail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_fail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: fail.title }),
      fail.note !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: fail.note }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gww_retry", onClick: onRetry, children: "\u91CD\u8BD5" })
    ] }),
    loading === "dim" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u8BFB\u53D6\u4E2D\u2026" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_content", ...loading === "dim" ? { "data-loading": "" } : {}, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_who", children: who }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_whoName", children: snapshot.model !== void 0 ? snapshot.model : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stats", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_stat", ...isLowBalance(snapshot.remaining) ? { "data-low": "" } : {}, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gww_statValue", children: fmtMoney(snapshot.remaining) }),
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
      ] }),
      snapshot.today !== void 0 && snapshot.today.requests !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "gww_note", children: [
        "\u4ECA\u65E5 ",
        fmtCount(snapshot.today.requests),
        " \u6B21\u8C03\u7528"
      ] }),
      !snapshot.todayAvailable && snapshot.todayUnavailableReason !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u7AD9\u70B9\u6CA1\u6709\u5F00\u653E\u4ECA\u65E5\u7EDF\u8BA1\u3002" }),
      snapshot.isAvailable === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_warn", children: "\u8FD9\u4E2A\u8D26\u6237\u5F53\u524D\u4E0D\u53EF\u7528\u3002" }),
      snapshot.isAvailable === true && fail === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note gww_ok", children: "\u8D26\u6237\u53EF\u7528" }),
      snapshot.todayModels !== void 0 && snapshot.todayModels.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelRows, { models: snapshot.todayModels }),
      snapshot.todayTokens !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BucketRows, { title: "\u4ECA\u65E5\u7528\u91CF", buckets: snapshot.todayTokens, amounts: snapshot.todayAmounts }),
      snapshot.todayLogsPartial === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gww_note", children: "\u4ECA\u65E5\u8D26\u5355\u8D85\u8FC7 1000 \u6761\uFF0Ctoken \u4E0E\u91D1\u989D\u62C6\u5206\u6309\u6700\u8FD1 1000 \u6761\u7EDF\u8BA1\u3002" }),
      snapshot.dailyHistory !== void 0 && snapshot.dailyHistory.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeatmapSection, { points: snapshot.dailyHistory }),
      snapshot.recentCalls !== void 0 && snapshot.recentCalls.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CallRows, { calls: snapshot.recentCalls }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gww_footer", title: new Date(snapshot.fetchedAt).toLocaleString(), children: [
        hostOf(snapshot.origin),
        " \xB7 ",
        loading === "dim" ? "\u8BFB\u53D6\u4E2D\u2026" : fail !== void 0 ? `\u4E0A\u6B21\u8BFB\u53D6 \xB7 ${agoLabel(snapshot.fetchedAt)}` : `${agoLabel(snapshot.fetchedAt)}\u4ECE\u7AD9\u70B9\u8D26\u672C\u8BFB\u53D6`
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
  const [tokenRoute, setTokenRoute] = (0, import_react.useState)(void 0);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [saveError, setSaveError] = (0, import_react.useState)(void 0);
  const [lastGood, setLastGood] = (0, import_react.useState)({});
  const lastGoodRef = (0, import_react.useRef)(lastGood);
  lastGoodRef.current = lastGood;
  const root = (0, import_react.useRef)(null);
  const running = useSessions((state) => state.ids.some((id) => state.byId[id]?.running === true));
  (0, import_react.useEffect)(() => {
    const controller = new AbortController();
    setBusy(true);
    loadWallet(inspectRoute, controller.signal).then(
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
  }, [nonce, inspectRoute]);
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
      if (event.key !== "Escape") return;
      if (tokenRoute !== void 0) setTokenRoute(void 0);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tokenRoute]);
  (0, import_react.useLayoutEffect)(() => {
    if (!open) return void 0;
    const place = () => {
      const rect = root.current?.getBoundingClientRect();
      if (rect === void 0) return;
      setAnchor({
        left: wide === false ? Math.min(rect.right + 8, Math.max(12, window.innerWidth - 404)) : Math.min(rect.left, Math.max(12, window.innerWidth - 404)),
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
  const openTokenDialog = (route) => {
    setSaveError(void 0);
    setTokenRoute(route);
  };
  const saveToken = (token, scope) => {
    if (tokenRoute === void 0) return;
    setSaving(true);
    setSaveError(void 0);
    const body = scope === "global" ? { accessToken: token } : { route: tokenRoute, accessToken: token };
    saveAccessToken(body).then(
      () => {
        setSaving(false);
        setTokenRoute(void 0);
        setPending("manual");
        setNonce((n) => n + 1);
      },
      (err) => {
        setSaving(false);
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    );
  };
  const tokenAccount = tokenRoute !== void 0 ? bundle?.accounts.find((account) => account.route === tokenRoute) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: root, className: wide === false ? "gww_layer gww_rail" : "gww_layer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "gww_badge",
        ...open ? { "data-active": "" } : {},
        ...low ? { "data-low": "" } : {},
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
              wallet: bundle?.wallet,
              error,
              fail,
              accounts: bundle?.accounts ?? [],
              selected,
              loading,
              onSelect: (route) => {
                setPending("switch");
                setInspectRoute(route);
              },
              onConfigure: openTokenDialog,
              onRetry: reload
            }
          ) })
        ]
      }
    ),
    tokenAccount !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      TokenDialog,
      {
        account: tokenAccount,
        saving,
        failure: saveError,
        onSave: saveToken,
        onClose: () => setTokenRoute(void 0)
      }
    )
  ] });
}
var name = LOGGER_KEY;
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: LOGGER_KEY,
    order: 25
  }, WalletSeat));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
