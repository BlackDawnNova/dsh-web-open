// @dsh-external/dsh-web-open 客户端半边:拦截会话/页面里的外部链接点击,
// 改为在 DSH 内嵌浏览器窗口中打开(不再跳系统浏览器或新标签)。
// 双模式:Electron 壳走 main.js 补丁的固定端口命令服务(http://127.0.0.1:13777);
// DSH Web 架构(纯 Node+Web)走同源主端口 webServer 路由 + SSE,
// 并在 GUI 内嵌浮动浏览器窗口中呈现页面(功能完整移植自旧 Electron webbox:
// 多标签拖拽排序/favicon/前进后退/刷新停止/地址栏搜索引擎/下载管理(进度·速度·
// 暂停·续传·取消·自动重试·完成音效与通知)/设置(语言·搜索引擎·提示音)/外部打开/
// 网络错误页/新标签起始页/Ctrl+滚轮缩放)。
// 模式探测:请求 13777 状态端点,800ms 无响应即视为 web 模式。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-web-open",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    // ---------- 模式探测:Electron 补丁服务存在 → 'electron';否则 'web' ----------
    var modePromise = new Promise(function (resolve) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var done = false;
      var t = setTimeout(function () { if (ctrl) ctrl.abort(); if (!done) { done = true; resolve("web"); } }, 800);
      function settle(m) { if (!done) { done = true; clearTimeout(t); resolve(m); } }
      fetch("http://127.0.0.1:13777/__dsh_webbox_state__", { mode: "cors", signal: ctrl ? ctrl.signal : undefined })
        .then(function () { settle("electron"); })
        .catch(function () { settle("web"); });
    });

    function webEndpoint(suffix) {
      var ep = location ? location.origin : "";
      return ep + suffix;
    }

    // ---------- i18n(移植自旧版 WEBBOX_T,语言跟随设置,auto=浏览器语言) ----------
    var I18N = {
      zh: {
        newTab: "新建标签", back: "后退", fwd: "前进", reload: "刷新/停止", settings: "设置", download: "下载", external: "在系统浏览器打开",
        history: "历史", bookmark: "收藏",
        urlPlaceholder: "输入网址或搜索词, 回车打开",
        settingsTitle: "浏览器设置", langLabel: "界面语言", langAuto: "跟随系统", engineLabel: "默认搜索引擎(地址栏搜索用)", dingLabel: "下载完成提示音", dingB: "柔和叮咚", dingA: "清亮双音", closePanel: "关闭", webNote: "Web 模式说明: 下载保存位置由浏览器决定; 暂停后从断点续传(需站点支持 Range); Ctrl+滚轮缩放页面。快捷键: Alt+Q 聚焦地址栏 · Ctrl+T 新标签 · Ctrl+W 关闭标签 · Ctrl+Shift+T 恢复关闭的标签(窗口打开时生效)。",
        histTitle: "历史记录", histEmpty: "暂无历史记录", histClear: "清空历史", histImport: "导入旧版数据", histImported: "已导入",
        bkTitle: "收藏夹", bkEmpty: "暂无收藏", bkClear: "清空收藏", bkAdd: "收藏本页", bkRemove: "取消收藏", bkAdded: "已收藏", bkRemoved: "已取消收藏",
        dlTitle: "下载", dlRefresh: "刷新", dlClear: "清空已完成", dlEmpty: "暂无下载记录", st_downloading: "下载中", st_completed: "完成", st_interrupted: "失败", st_cancelled: "已取消",
        dlPause: "暂停", dlResume: "继续", dlCancel: "取消", dlRedo: "重新下载", dlCopy: "复制链接", dlSize: "大小", dlSpeed: "速度",
        dlDoneTitle: "下载完成", dlDoneBody: " 已下载", copyOk: "链接已复制", copyFail: "复制失败",
        errTitle: "无法访问此网站", errRetry: "重试", errExternal: "在系统浏览器打开",
        startHint: "输入网址或搜索词, 回车打开",
      },
      en: {
        newTab: "New tab", back: "Back", fwd: "Forward", reload: "Reload/Stop", settings: "Settings", download: "Downloads", external: "Open in system browser",
        history: "History", bookmark: "Bookmark",
        urlPlaceholder: "Enter URL or search, press Enter",
        settingsTitle: "Browser Settings", langLabel: "Language", langAuto: "Follow system", engineLabel: "Default search engine (address bar)", dingLabel: "Download chime", dingB: "Soft ding-dong", dingA: "Bright chime", closePanel: "Close", webNote: "Web mode notes: save location decided by the browser; pause resumes from breakpoint (needs server Range support); Ctrl+wheel zooms the page. Shortcuts (while window is open): Alt+Q focus address bar, Ctrl+T new tab, Ctrl+W close tab, Ctrl+Shift+T reopen closed tab.",
        histTitle: "History", histEmpty: "No history yet", histClear: "Clear history", histImport: "Import legacy data", histImported: "Imported",
        bkTitle: "Bookmarks", bkEmpty: "No bookmarks yet", bkClear: "Clear bookmarks", bkAdd: "Bookmark this page", bkRemove: "Remove bookmark", bkAdded: "Bookmarked", bkRemoved: "Bookmark removed",
        dlTitle: "Downloads", dlRefresh: "Refresh", dlClear: "Clear completed", dlEmpty: "No downloads yet", st_downloading: "Downloading", st_completed: "Completed", st_interrupted: "Failed", st_cancelled: "Cancelled",
        dlPause: "Pause", dlResume: "Resume", dlCancel: "Cancel", dlRedo: "Redownload", dlCopy: "Copy link", dlSize: "Size", dlSpeed: "Speed",
        dlDoneTitle: "Download complete", dlDoneBody: " downloaded", copyOk: "Link copied", copyFail: "Copy failed",
        errTitle: "This site can't be reached", errRetry: "Retry", errExternal: "Open in system browser",
        startHint: "Enter URL or search, press Enter",
      },
    };
    var ENGINES = {
      bing: "https://www.bing.com/search?q=",
      baidu: "https://www.baidu.com/s?wd=",
      google: "https://www.google.com/search?q=",
      sogou: "https://www.sogou.com/web?query=",
    };

    function readSettings() {
      try {
        var s = JSON.parse(localStorage.getItem("dsh-webbox-settings") || "{}") || {};
        if (!s.searchEngine) s.searchEngine = "bing";
        if (!s.lang) s.lang = "auto";
        if (!s.dingSound) s.dingSound = "b";
        return s;
      } catch (e) { return { searchEngine: "bing", lang: "auto", dingSound: "b" }; }
    }
    function writeSettings(patch) {
      var s = readSettings();
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) s[k] = patch[k];
      try { localStorage.setItem("dsh-webbox-settings", JSON.stringify(s)); } catch (e) {}
      renderChrome(); // 语言变化立即生效
      return s;
    }
    function langNow() {
      var l = readSettings().lang;
      if (l !== "auto") return l;
      try { return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en"; } catch (e) { return "zh"; }
    }
    function T(k) { return (I18N[langNow()] || I18N.zh)[k] || k; }

    // 地址栏输入:URL 直接导航,否则走默认搜索引擎(移植自旧版 webboxResolveInput)
    function resolveInput(input) {
      var v = String(input || "").trim();
      if (v === "") return null;
      if (/^https?:\/\//i.test(v)) return v;
      if (v.indexOf(".") >= 0 && !/\s/.test(v)) return "https://" + v;
      var engine = ENGINES[readSettings().searchEngine] || ENGINES.bing;
      return engine + encodeURIComponent(v);
    }

    // ---------- 下载完成提示音(移植旧版 a/b 两种,AudioContext 合成) ----------
    var audioCtx = null;
    function playDing() {
      try {
        var soft = readSettings().dingSound !== "a";
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        var t0 = audioCtx.currentTime;
        var f1 = soft ? 659 : 988, f2 = soft ? 880 : 1319;
        var mk = function (f, t, d, g) {
          var o = audioCtx.createOscillator();
          o.type = "sine"; o.frequency.value = f;
          var gn = audioCtx.createGain();
          gn.gain.setValueAtTime(0.0001, t);
          gn.gain.linearRampToValueAtTime(g, t + 0.02);
          gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(gn); gn.connect(audioCtx.destination);
          o.start(t); o.stop(t + d + 0.05);
        };
        mk(f1, t0, soft ? 0.22 : 0.09, 0.25);
        mk(f2, t0 + (soft ? 0.25 : 0.12), soft ? 0.26 : 0.16, 0.25);
      } catch (e) {}
    }
    // 下载完成系统通知(权限被拒则静默)
    function notifyDone(name) {
      try {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") {
          new Notification(T("dlDoneTitle"), { body: name + T("dlDoneBody") });
        } else if (Notification.permission === "default") {
          Notification.requestPermission().then(function (p) {
            if (p === "granted") new Notification(T("dlDoneTitle"), { body: name + T("dlDoneBody") });
          }).catch(function () {});
        }
      } catch (e) {}
    }

    // ---------- 内嵌浮动浏览器窗口(web 模式) ----------
    // 页面经服务端代理(/__dsh_web_open__/proxy)拉取并剥离 X-Frame-Options/CSP。
    // sandbox 刻意不开 allow-same-origin:避免被打开的网页摸到 DSH GUI 自身 DOM。
    var win = null;
    var tabs = []; // {key,url,title,frame,tabEl,back:[],fwd:[],loading,zoom,iconNode}
    var activeKey = null;
    var tabSeq = 0;
    var STYLE_ID = "dsh-webbox-style";
    var downloads = []; // {id,url,name,state,received,total,speed,paused,_retry,chunks,ctrl,doneAt}
    var panelOpen = null; // 'downloads' | 'settings' | 'history' | 'bookmarks' | null
    var dlRefreshTimer = null;
    var history = []; // {url,title,t} 浏览历史
    var bookmarks = []; // {url,title,t} 收藏夹
    var closedTabs = []; // 最近关闭的标签 {url,title},Ctrl+Shift+T 恢复
    var HIST_KEY = "dsh-webbox-history";
    var BK_KEY = "dsh-webbox-bookmarks";
    var SESSION_KEY = "dsh-webbox-session";
    var histBtn, favBtn, histPanel, bkPanel, histList, bkList;

    function loadArray(key) {
      try {
        var a = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(a) ? a : [];
      } catch (e) { return []; }
    }
    function loadHist() { history = loadArray(HIST_KEY); }
    function saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0, 200))); } catch (e) {} }
    function loadBk() { bookmarks = loadArray(BK_KEY); }
    function saveBk() { try { localStorage.setItem(BK_KEY, JSON.stringify(bookmarks.slice(0, 200))); } catch (e) {} }
    function recordHistory(url, title) {
      if (!url || /^data:|about:/i.test(url)) return;
      for (var i = 0; i < history.length; i++) if (history[i].url === url) history.splice(i, 1);
      history.unshift({ url: url, title: title || "", t: Date.now() });
      saveHist();
    }
    function toggleFav(url, title) {
      loadBk();
      for (var i = 0; i < bookmarks.length; i++) {
        if (bookmarks[i].url === url) {
          bookmarks.splice(i, 1);
          saveBk();
          renderChrome();
          return;
        }
      }
      bookmarks.unshift({ url: url, title: title || "", t: Date.now() });
      saveBk();
      renderChrome();
    }
    function updateFavBtn() {
      if (!favBtn) return;
      var t = activeTab();
      var on = false;
      if (t) for (var i = 0; i < bookmarks.length; i++) if (bookmarks[i].url === t.url) { on = true; break; }
      favBtn.style.color = on ? "#f9a825" : "";
      favBtn.textContent = on ? "\u2605" : "\u2606";
    }
    // 会话快照:意外刷新 GUI 后恢复上次打开的标签(× 关闭窗口时清除)
    function saveSnapshot() {
      try {
        var snap = tabs.filter(function (t) { return !/^data:/i.test(t.url); }).map(function (t) { return { url: t.url, title: t.title }; });
        localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
      } catch (e) {}
    }
    function clearSnapshot() {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    }
    function restoreSession() {
      var snap = loadArray(SESSION_KEY);
      if (!snap.length) return;
      clearSnapshot();
      for (var i = 0; i < snap.length; i++) {
        if (snap[i] && /^https?:\/\//i.test(snap[i].url)) openTab(snap[i].url, snap[i].title || "");
      }
      clearSnapshot(); // openTab 内部会写回快照,恢复完成后清掉,避免下次刷新重复弹出
    }
    function restoreClosedTab() {
      if (!closedTabs.length) return;
      var c = closedTabs.pop();
      openTab(c.url, c.title || "");
    }

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent =
        "#dsh-webbox-window{position:fixed;right:24px;bottom:24px;width:920px;max-width:94vw;height:640px;max-height:84vh;" +
        "z-index:2147483600;display:flex;flex-direction:column;background:#181825;color:#cdd6f4;" +
        "border:1px solid #313244;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden;" +
        "font:13px/1.4 system-ui,sans-serif;}" +
        "#dsh-webbox-window[hidden]{display:none!important}" +
        ".dsh-webbox-bar{display:flex;align-items:center;gap:6px;padding:6px 8px 0;flex:0 0 auto;cursor:default}" +
        ".dsh-webbox-tabs{display:flex;gap:4px;overflow-x:auto;flex:1 1 auto;min-width:0;scrollbar-width:none}" +
        ".dsh-webbox-tabs::-webkit-scrollbar{display:none}" +
        ".dsh-webbox-newtab{flex:0 0 auto;width:24px;height:24px;border-radius:6px;background:transparent;" +
        "border:1px solid #45475a;color:#cdd6f4;font-size:15px;cursor:pointer;line-height:1}" +
        ".dsh-webbox-newtab:hover{background:#313244}" +
        ".dsh-webbox-tab{display:flex;align-items:center;gap:5px;max-width:200px;padding:5px 8px;background:#11111b;" +
        "border:1px solid #313244;border-bottom:none;border-radius:8px 8px 0 0;color:#cdd6f4;font-size:12px;font-weight:600;" +
        "cursor:pointer;flex:0 1 auto;min-width:64px;overflow:hidden}" +
        ".dsh-webbox-tab.active{background:#313244;color:#fff}" +
        ".dsh-webbox-tab .fic{width:14px;height:14px;border-radius:3px;flex:none}" +
        ".dsh-webbox-tab .ficd{font-size:12px;color:#89b4fa;flex:none}" +
        ".dsh-webbox-tab .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:0}" +
        ".dsh-webbox-tab .tx{margin-left:2px;border-radius:4px;padding:0 4px;font-size:11px;font-weight:400;flex:none}" +
        ".dsh-webbox-tab .tx:hover{background:#6c7086}" +
        ".dsh-webbox-nav{display:flex;align-items:center;gap:6px;padding:6px 8px;flex:0 0 auto;background:#181825}" +
        ".dsh-webbox-nav .nb{background:transparent;border:1px solid #45475a;color:#cdd6f4;border-radius:6px;" +
        "width:28px;height:26px;cursor:pointer;font-size:13px;flex:none;line-height:1}" +
        ".dsh-webbox-nav .nb:hover:not(:disabled){background:#313244}" +
        ".dsh-webbox-nav .nb:disabled{opacity:.35;cursor:default}" +
        ".dsh-webbox-nav .nb.danger:hover{background:#dc2626}" +
        ".dsh-webbox-url{flex:1;min-width:60px;background:#11111b;border:1px solid #45475a;color:#cdd6f4;border-radius:6px;" +
        "height:26px;padding:0 10px;font-size:13px;outline:none}" +
        ".dsh-webbox-url:focus{border-color:#89b4fa}" +
        ".dsh-webbox-badge{position:relative}" +
        ".dsh-webbox-badge .cnt{position:absolute;top:-5px;right:-5px;min-width:14px;height:14px;padding:0 3px;border-radius:8px;" +
        "background:#f59e0b;color:#111;font-size:10px;font-weight:700;line-height:14px;text-align:center;display:none}" +
        ".dsh-webbox-body{flex:1 1 auto;position:relative;background:#fff;min-height:0}" +
        ".dsh-webbox-frame{position:absolute;inset:0;width:100%;height:100%;border:none;background:#fff;display:none}" +
        ".dsh-webbox-frame.active{display:block}" +
        ".dsh-webbox-panel{position:absolute;top:0;right:0;bottom:0;width:320px;background:#1e1e2e;z-index:5;" +
        "border-left:1px solid #313244;display:none;flex-direction:column;font-size:12px;color:#cdd6f4;box-shadow:-6px 0 20px rgba(0,0,0,.3)}" +
        ".dsh-webbox-panel.open{display:flex}" +
        ".dsh-webbox-panel h3{margin:0;padding:12px 14px 8px;font-size:13px;font-weight:600;color:#a6adc8}" +
        ".dsh-webbox-panel .pc{margin:0 14px 10px;display:flex;gap:6px;align-items:center}" +
        ".dsh-webbox-panel .pc button{background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;" +
        "padding:4px 10px;font-size:11px;cursor:pointer}" +
        ".dsh-webbox-panel .pc button:hover{background:#45475a}" +
        ".dsh-webbox-panel .pc .sp{flex:1}" +
        ".dsh-webbox-dl{flex:1 1 auto;overflow-y:auto;padding:0 14px 14px}" +
        ".dsh-webbox-dl .row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #313244;flex-wrap:wrap}" +
        ".dsh-webbox-dl .nm{flex:1 1 100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
        ".dsh-webbox-dl .nm2{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}" +
        ".dsh-webbox-dl .nm2:hover{color:#fff}" +
        ".dsh-webbox-dl .mg{display:flex;align-items:center;gap:8px;flex:1 1 100%}" +
        ".dsh-webbox-dl .st{font-size:11px;padding:1px 8px;border-radius:10px;flex:none}" +
        ".st-downloading{background:#3a3a2a;color:#f9a825}" +
        ".st-completed{background:#1e3a2a;color:#a6e3a1}" +
        ".st-interrupted,.st-cancelled{background:#3a1e1e;color:#f38ba8}" +
        ".dsh-webbox-dl .pg{flex:1;height:6px;background:#313244;border-radius:3px;overflow:hidden;position:relative}" +
        ".dsh-webbox-dl .pg i{display:block;height:100%;background:#f9a825;width:0}" +
        ".dsh-webbox-dl .pg.ind i{position:absolute;top:0;bottom:0;width:40%;background:linear-gradient(90deg,#3a4466,#5a6490,#3a4466);" +
        "background-size:200% 100%;animation:dshpgmove 1.2s linear infinite}" +
        "@keyframes dshpgmove{from{background-position:0 0}to{background-position:200% 0}}" +
        ".dsh-webbox-dl .sz{color:#6c7086;font-size:11px;flex:none}" +
        ".dsh-webbox-dl .ctl{background:transparent;border:none;color:#a6adc8;font-size:12px;cursor:pointer;padding:2px 4px;flex:none}" +
        ".dsh-webbox-dl .ctl:hover{color:#fff}" +
        ".dsh-webbox-dl .empty{color:#6c7086;padding:16px 0;text-align:center}" +
        ".dsh-webbox-set{padding:0 14px 14px;overflow-y:auto}" +
        ".dsh-webbox-set label{display:block;color:#a6adc8;margin:14px 0 6px;font-size:12px}" +
        ".dsh-webbox-set select{width:100%;height:30px;background:#181825;border:1px solid #45475a;color:#cdd6f4;" +
        "border-radius:6px;padding:0 8px;font-size:12px}" +
        ".dsh-webbox-set .note{color:#6c7086;font-size:11px;margin-top:18px;line-height:1.7}";
      (document.head || document.documentElement).appendChild(s);
    }

    function proxyUrl(u) {
      if (/^data:/i.test(u)) return u; // 内置起始页不走代理
      return webEndpoint("/__dsh_web_open__/proxy?url=" + encodeURIComponent(u));
    }

    function el(tag, props, parent) {
      var n = document.createElement(tag);
      if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) n[k] = props[k];
      if (parent) parent.appendChild(n);
      return n;
    }

    // 新标签 → 内置起始页(搜索框;经 postMessage 导航,避免跨源)
    function startPageUrl() {
      var q1 = T("urlPlaceholder");
      var q2 = T("startHint");
      var html =
        "<!doctype html><html><head><meta charset='utf-8'><style>" +
        "body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#181825;color:#cdd6f4;font:14px/1.6 system-ui,sans-serif}" +
        "div{text-align:center;width:min(520px,80vw)}" +
        ".logo{font-size:40px;margin-bottom:10px}" +
        "input{width:100%;box-sizing:border-box;background:#11111b;border:1px solid #45475a;color:#cdd6f4;border-radius:10px;" +
        "height:44px;padding:0 16px;font-size:15px;outline:none;margin-bottom:14px}" +
        "input:focus{border-color:#89b4fa}" +
        ".h{color:#6c7086;font-size:12px}" +
        "</style></head><body><div>" +
        "<div class='logo'>\uD83D\uDD0D</div>" +
        "<input id='q' placeholder='" + q1 + "' autocomplete='off' spellcheck='false'>" +
        "<div class='h'>" + q2 + "</div>" +
        "</div><script>" +
        "var q=document.getElementById('q');q.focus();" +
        "q.addEventListener('keydown',function(e){if(e.key==='Enter'){var v=q.value.trim();if(v)parent.postMessage({type:'nav',url:v},'*');}});" +
        "<\/script></body></html>";
      return "data:text/html;charset=utf-8," + encodeURIComponent(html);
    }

    var backBtn, fwdBtn, reloadBtn, urlInput, dlBtn, tabsWrap, bodyBox;
    function ensureWindow() {
      if (win) return win;
      ensureStyle();
      win = el("div", { id: "dsh-webbox-window", hidden: true });
      // 标签行
      var bar = el("div", { className: "dsh-webbox-bar" }, win);
      tabsWrap = el("div", { className: "dsh-webbox-tabs" }, bar);
      var newTabBtn = el("button", { className: "dsh-webbox-newtab", textContent: "+", title: T("newTab") }, bar);
      // 导航行
      var nav = el("div", { className: "dsh-webbox-nav" }, win);
      backBtn = el("button", { className: "nb", textContent: "\u2190", title: T("back"), disabled: true }, nav);
      fwdBtn = el("button", { className: "nb", textContent: "\u2192", title: T("fwd"), disabled: true }, nav);
      reloadBtn = el("button", { className: "nb", textContent: "\u27f3", title: T("reload") }, nav);
      urlInput = el("input", { className: "dsh-webbox-url", type: "text", spellcheck: false }, nav);
      histBtn = el("button", { className: "nb", textContent: "\ud83d\udd58", title: T("history") }, nav);
      favBtn = el("button", { className: "nb", textContent: "\u2606", title: T("bkAdd") }, nav);
      var gearBtn = el("button", { className: "nb", textContent: "\u2699", title: T("settings") }, nav);
      var dlWrap = el("span", { className: "dsh-webbox-badge" }, nav);
      dlBtn = el("button", { className: "nb", textContent: "\u2b07", title: T("download") }, dlWrap);
      el("span", { className: "cnt", textContent: "0" }, dlWrap);
      var extBtn = el("button", { className: "nb", textContent: "\u2197", title: T("external") }, nav);
      el("button", { className: "nb danger", textContent: "\u00d7", title: T("closePanel") + "\u2715" }, nav);
      // 页面区
      bodyBox = el("div", { className: "dsh-webbox-body" }, win);
      var panels = el("div", { className: "dsh-webbox-panels" }, win);
      var dlPanel = el("div", { className: "dsh-webbox-panel", id: "dsh-webbox-dlpanel" }, panels);
      var setPanel = el("div", { className: "dsh-webbox-panel", id: "dsh-webbox-setpanel" }, panels);
      (document.body || document.documentElement).appendChild(win);

      // 标签行拖拽移动窗口(双击复位右下角停靠)
      var dragging = null;
      bar.addEventListener("pointerdown", function (e) {
        if (e.target.closest && e.target.closest("button,.dsh-webbox-tab")) return;
        dragging = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
        bar.setPointerCapture(e.pointerId);
      });
      bar.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var x = e.clientX - dragging.dx, y = e.clientY - dragging.dy;
        x = Math.max(8, Math.min(x, window.innerWidth - win.offsetWidth - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - win.offsetHeight - 8));
        win.style.left = x + "px"; win.style.top = y + "px";
        win.style.right = "auto"; win.style.bottom = "auto";
      });
      function endDrag() { dragging = null; }
      bar.addEventListener("pointerup", endDrag);
      bar.addEventListener("pointercancel", endDrag);
      bar.addEventListener("dblclick", function (e) {
        if (e.target.closest && e.target.closest("button,.dsh-webbox-tab")) return;
        win.style.left = "auto"; win.style.top = "auto";
        win.style.right = "24px"; win.style.bottom = "24px";
      });
      // 标签滚轮横滚
      tabsWrap.addEventListener("wheel", function (e) {
        if (e.deltaY !== 0) { e.preventDefault(); tabsWrap.scrollLeft += e.deltaY; }
      }, { passive: false });

      // 按钮
      newTabBtn.addEventListener("click", function () { newTab(); });
      backBtn.addEventListener("click", function () { var t = activeTab(); if (t) goBack(t); });
      fwdBtn.addEventListener("click", function () { var t = activeTab(); if (t) goForward(t); });
      reloadBtn.addEventListener("click", function () { var t = activeTab(); if (!t) return; if (t.loading) stopLoad(t); else reloadTab(t); });
      gearBtn.addEventListener("click", function () { togglePanel("settings"); });
      dlBtn.addEventListener("click", function () { togglePanel("downloads"); renderDownloads(); });
      extBtn.addEventListener("click", function () { var t = activeTab(); if (t && /^https?:\/\//i.test(t.url)) window.open(t.url, "_blank"); });
      win.querySelector(".nb.danger").addEventListener("click", function () { win.hidden = true; clearSnapshot(); });
      // 地址栏
      urlInput.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var v = urlInput.value.trim();
        if (!v) return;
        var u = resolveInput(v);
        if (!u) return;
        var t = activeTab();
        if (t) navTo(t, u); else openTab(u, "");
        urlInput.value = "";
      });
      // 下载面板头部
      el("h3", { textContent: T("dlTitle") }, dlPanel);
      var dlCtl = el("div", { className: "pc" }, dlPanel);
      var dlRefreshBtn = el("button", { textContent: T("dlRefresh") }, dlCtl);
      var dlClearBtn = el("button", { textContent: T("dlClear") }, dlCtl);
      el("span", { className: "sp" }, dlCtl);
      var dlCloseBtn = el("button", { textContent: T("closePanel") }, dlCtl);
      el("div", { className: "dsh-webbox-dl" }, dlPanel);
      dlRefreshBtn.addEventListener("click", function () { renderDownloads(); });
      dlClearBtn.addEventListener("click", function () {
        downloads = downloads.filter(function (d) { return d.state === "downloading"; });
        saveDownloads(); renderDownloads(); updateDlBadge();
      });
      dlCloseBtn.addEventListener("click", function () { togglePanel(null); });
      // 设置面板头部与控件
      el("h3", { textContent: T("settingsTitle") }, setPanel);
      var setBox = el("div", { className: "dsh-webbox-set" }, setPanel);
      var st = readSettings();
      el("label", { textContent: T("langLabel") }, setBox);
      var langSel = el("select", {}, setBox);
      langSel.innerHTML = "<option value='auto'>" + T("langAuto") + "</option><option value='zh'>中文</option><option value='en'>English</option>";
      langSel.value = st.lang;
      el("label", { textContent: T("engineLabel") }, setBox);
      var engSel = el("select", {}, setBox);
      engSel.innerHTML = "<option value='bing'>Bing</option><option value='baidu'>\u767e\u5ea6</option><option value='google'>Google</option><option value='sogou'>\u641c\u72d7</option>";
      engSel.value = st.searchEngine;
      el("label", { textContent: T("dingLabel") }, setBox);
      var dingSel = el("select", {}, setBox);
      dingSel.innerHTML = "<option value='b'>" + T("dingB") + "</option><option value='a'>" + T("dingA") + "</option>";
      dingSel.value = st.dingSound;
      el("div", { className: "note", textContent: T("webNote") }, setBox);
      // 历史/书签面板
      histPanel = el("div", { className: "dsh-webbox-panel", id: "dsh-webbox-histpanel" }, panels);
      el("h3", { textContent: T("histTitle") }, histPanel);
      var histCtl = el("div", { className: "pc" }, histPanel);
      var histClearBtn = el("button", { textContent: T("histClear") }, histCtl);
      var histImportBtn = el("button", { textContent: T("histImport") }, histCtl);
      el("span", { className: "sp" }, histCtl);
      var histCloseBtn = el("button", { textContent: T("closePanel") }, histCtl);
      histList = el("div", { className: "dsh-webbox-dl" }, histPanel);
      bkPanel = el("div", { className: "dsh-webbox-panel", id: "dsh-webbox-bkpanel" }, panels);
      el("h3", { textContent: T("bkTitle") }, bkPanel);
      var bkCtl = el("div", { className: "pc" }, bkPanel);
      var bkClearBtn = el("button", { textContent: T("bkClear") }, bkCtl);
      el("span", { className: "sp" }, bkCtl);
      var bkCloseBtn = el("button", { textContent: T("closePanel") }, bkCtl);
      bkList = el("div", { className: "dsh-webbox-dl" }, bkPanel);
      histClearBtn.addEventListener("click", function () { history = []; saveHist(); renderHistory(); });
      histImportBtn.addEventListener("click", importLegacy);
      histCloseBtn.addEventListener("click", function () { togglePanel(null); });
      bkClearBtn.addEventListener("click", function () { bookmarks = []; saveBk(); renderBookmarks(); updateFavBtn(); });
      bkCloseBtn.addEventListener("click", function () { togglePanel(null); });
      histList.addEventListener("click", function (e) {
        var r = e.target && e.target.closest ? e.target.closest("[data-h]") : null;
        if (!r) return;
        e.stopPropagation();
        if (r.classList.contains("ctl")) {
          var hu = r.getAttribute("data-h");
          for (var i = 0; i < history.length; i++) if (history[i].url === hu) { history.splice(i, 1); break; }
          saveHist();
          renderHistory();
        } else {
          openTab(r.getAttribute("data-h"), "");
        }
      });
      bkList.addEventListener("click", function (e) {
        var r = e.target && e.target.closest ? e.target.closest("[data-b]") : null;
        if (!r) return;
        e.stopPropagation();
        if (r.classList.contains("ctl")) {
          var bu = r.getAttribute("data-b");
          for (var i = 0; i < bookmarks.length; i++) if (bookmarks[i].url === bu) { bookmarks.splice(i, 1); break; }
          saveBk();
          renderBookmarks();
          updateFavBtn();
        } else {
          openTab(r.getAttribute("data-b"), "");
        }
      });
      histBtn.addEventListener("click", function () { loadHist(); renderHistory(); togglePanel("history"); });
      favBtn.addEventListener("click", function () {
        var t = activeTab();
        if (!t || /^data:/i.test(t.url)) return;
        toggleFav(t.url, t.title || "");
      });
      langSel.addEventListener("change", function () { writeSettings({ lang: langSel.value }); });
      engSel.addEventListener("change", function () { writeSettings({ searchEngine: engSel.value }); });
      dingSel.addEventListener("change", function () { writeSettings({ dingSound: dingSel.value }); });
      var setBtns = el("div", { className: "pc", style: "margin-top:16px" }, setBox);
      var setClearHist = el("button", { textContent: T("histClear") }, setBtns);
      var setClearBk = el("button", { textContent: T("bkClear") }, setBtns);
      setClearHist.addEventListener("click", function () { history = []; saveHist(); });
      setClearBk.addEventListener("click", function () { bookmarks = []; saveBk(); updateFavBtn(); });
      // Ctrl+滚轮缩放当前页(替代旧版 shift+滚轮;iframe 跨源无法注入脚本)
      bodyBox.addEventListener("wheel", function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        var t = activeTab();
        if (!t) return;
        var z = (t.zoom || 1) + (e.deltaY < 0 ? 0.1 : -0.1);
        z = Math.max(0.5, Math.min(2, Math.round(z * 10) / 10));
        t.zoom = z;
        t.frame.style.zoom = String(z);
      }, { passive: false });
      // 起始页 postMessage → 导航
      window.addEventListener("message", function (e) {
        if (!e.data || e.data.type !== "nav" || typeof e.data.url !== "string") return;
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].frame && tabs[i].frame.contentWindow === e.source) {
            var u = resolveInput(e.data.url);
            if (u) navTo(tabs[i], u);
            return;
          }
        }
      });
      renderChrome();
      return win;
    }

    // 语言切换后刷新静态文案
    function renderChrome() {
      if (!win) return;
      urlInput.placeholder = T("urlPlaceholder");
      var newTabBtn = win.querySelector(".dsh-webbox-newtab");
      if (newTabBtn) newTabBtn.title = T("newTab");
      backBtn.title = T("back"); fwdBtn.title = T("fwd"); reloadBtn.title = T("reload");
      var navBtns = win.querySelectorAll(".dsh-webbox-nav .nb");
      var titles = [null, null, null, T("history"), T("bkAdd"), T("settings"), T("download"), T("external"), T("closePanel") + "\u2715"];
      for (var i = 0; i < navBtns.length && i < titles.length; i++) if (titles[i]) navBtns[i].title = titles[i];
      var h3s = win.querySelectorAll(".dsh-webbox-panel h3");
      if (h3s[0]) h3s[0].textContent = T("dlTitle");
      if (h3s[1]) h3s[1].textContent = T("settingsTitle");
      if (h3s[2]) h3s[2].textContent = T("histTitle");
      if (h3s[3]) h3s[3].textContent = T("bkTitle");
      var labels = win.querySelectorAll(".dsh-webbox-set label");
      if (labels[0]) labels[0].textContent = T("langLabel");
      if (labels[1]) labels[1].textContent = T("engineLabel");
      if (labels[2]) labels[2].textContent = T("dingLabel");
      var note = win.querySelector(".dsh-webbox-set .note");
      if (note) note.textContent = T("webNote");
      var dlPc = win.querySelector("#dsh-webbox-dlpanel .pc");
      if (dlPc) {
        var db = dlPc.querySelectorAll("button");
        var dt = [T("dlRefresh"), T("dlClear"), T("closePanel")];
        for (var j = 0; j < db.length && j < dt.length; j++) db[j].textContent = dt[j];
      }
      var hPc = win.querySelector("#dsh-webbox-histpanel .pc");
      if (hPc) {
        var hb = hPc.querySelectorAll("button");
        var ht = [T("histClear"), T("histImport"), T("closePanel")];
        for (var j2 = 0; j2 < hb.length && j2 < ht.length; j2++) hb[j2].textContent = ht[j2];
      }
      var bPc = win.querySelector("#dsh-webbox-bkpanel .pc");
      if (bPc) {
        var bb = bPc.querySelectorAll("button");
        var bt = [T("bkClear"), T("closePanel")];
        for (var j3 = 0; j3 < bb.length && j3 < bt.length; j3++) bb[j3].textContent = bt[j3];
      }
      var sPc = win.querySelector("#dsh-webbox-setpanel .pc");
      if (sPc) {
        var sb = sPc.querySelectorAll("button");
        var st2 = [T("histClear"), T("bkClear")];
        for (var j4 = 0; j4 < sb.length && j4 < st2.length; j4++) sb[j4].textContent = st2[j4];
      }
      updateFavBtn();
    }

    // ---------- 标签管理 ----------
    function activeTab() {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].key === activeKey) return tabs[i];
      return null;
    }

    function newTab() {
      var w = ensureWindow();
      openTab(startPageUrl(), T("newTab"));
      w.hidden = false;
      urlInput.focus();
    }

    function openTab(url, title) {
      var w = ensureWindow();
      if (url && url.indexOf("data:") !== 0) {
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i].url === url) { activate(tabs[i].key); w.hidden = false; return; }
        }
      }
      var key = "t" + (++tabSeq);
      var frame = el("iframe", {
        className: "dsh-webbox-frame",
        sandbox: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
        referrerPolicy: "no-referrer",
      });
      bodyBox.appendChild(frame);
      var tabEl = el("div", { className: "dsh-webbox-tab", draggable: true });
      var iconNode = el("span", { className: "ficd", textContent: "\u25ce" }, tabEl);
      var nm = el("span", { className: "tt", textContent: title || url.replace(/^https?:\/\//, "\u2026") }, tabEl);
      var x = el("span", { className: "tx", textContent: "\u00d7", title: "\u2715" }, tabEl);
      nm.title = url;
      tabsWrap.appendChild(tabEl);
      var tab = { key: key, url: url, title: title || "", frame: frame, tabEl: tabEl, iconNode: iconNode, back: [], fwd: [], loading: false, zoom: 1 };
      tabs.push(tab);
      // favicon:取站点 /favicon.ico,失败隐藏(跨源读不到页面内 favicon)
      if (/^https?:\/\//i.test(url)) {
        var img = new Image();
        img.className = "fic";
        img.style.display = "block";
        img.onload = function () { iconNode.className = "fic"; iconNode.textContent = ""; iconNode.appendChild(img); };
        img.onerror = function () {};
        try { img.src = "https://" + new URL(url).host + "/favicon.ico"; } catch (e) {}
      }
      // 交互
      x.addEventListener("click", function (e) { e.stopPropagation(); closeTab(key); });
      tabEl.addEventListener("click", function (e) {
        if (e.target === x) return;
        activate(key); w.hidden = false;
      });
      tabEl.addEventListener("dblclick", function () { closeTab(key); });
      // 拖拽排序
      tabEl.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", key); });
      tabEl.addEventListener("dragover", function (e) { e.preventDefault(); });
      tabEl.addEventListener("drop", function (e) {
        e.preventDefault();
        var f = e.dataTransfer.getData("text/plain");
        if (!f || f === key) return;
        var fi = -1, ti = -1;
        for (var i = 0; i < tabs.length; i++) { if (tabs[i].key === f) fi = i; if (tabs[i].key === key) ti = i; }
        if (fi < 0 || ti < 0) return;
        var mv = tabs.splice(fi, 1)[0];
        var ni = fi < ti ? ti - 1 : ti;
        tabs.splice(ni, 0, mv);
        if (ni + 1 < tabs.length) tabsWrap.insertBefore(mv.tabEl, tabs[ni + 1].tabEl);
        else tabsWrap.appendChild(mv.tabEl);
      });
      // 导航
      frame.addEventListener("load", function () {
        tab.loading = false;
        updateNavState();
        recordHistory(tab.url, tab.title);
      });
      frame.addEventListener("error", function () { tab.loading = false; updateNavState(); });
      loadFrame(tab);
      activate(key);
      w.hidden = false;
      saveSnapshot();
    }

    function navTo(t, url) {
      if (!t) return;
      if (url === t.url) { reloadTab(t); return; }
      t.back.push(t.url);
      t.fwd = [];
      t.url = url;
      loadFrame(t);
    }
    function goBack(t) {
      if (!t.back.length) return;
      t.fwd.push(t.url);
      t.url = t.back.pop();
      loadFrame(t);
    }
    function goForward(t) {
      if (!t.fwd.length) return;
      t.back.push(t.url);
      t.url = t.fwd.pop();
      loadFrame(t);
    }
    function reloadTab(t) { loadFrame(t); }
    function stopLoad(t) { t.loading = false; t.frame.src = "data:,"; updateNavState(); }
    function loadFrame(t) {
      t.loading = true;
      updateNavState();
      var q = /^data:/i.test(t.url) ? "" : (t.url.indexOf("?") >= 0 ? "&r=" : "?r=") + Date.now();
      t.frame.src = proxyUrl(t.url) + q;
      urlInput.value = /^data:/i.test(t.url) ? "" : t.url;
      saveSnapshot();
      updateFavBtn();
    }
    function updateNavState() {
      var t = activeTab();
      backBtn.disabled = !t || t.back.length === 0;
      fwdBtn.disabled = !t || t.fwd.length === 0;
      reloadBtn.textContent = t && t.loading ? "\u2715" : "\u27f3";
    }

    function activate(key) {
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var on = t.key === key;
        t.frame.className = "dsh-webbox-frame" + (on ? " active" : "");
        t.tabEl.className = "dsh-webbox-tab" + (on ? " active" : "");
        if (on) {
          activeKey = key;
          urlInput.value = /^data:/i.test(t.url) ? "" : t.url;
          updateNavState();
          updateFavBtn();
        }
      }
    }

    function closeTab(key) {
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].key !== key) continue;
        var t = tabs[i];
        if (!/^data:/i.test(t.url)) {
          closedTabs.push({ url: t.url, title: t.title || "" });
          if (closedTabs.length > 20) closedTabs.shift();
        }
        if (t.frame.parentNode) t.frame.parentNode.removeChild(t.frame);
        if (t.tabEl.parentNode) t.tabEl.parentNode.removeChild(t.tabEl);
        tabs.splice(i, 1);
        if (activeKey === key) {
          activeKey = null;
          if (tabs.length) activate(tabs[tabs.length - 1].key);
          else { win.hidden = true; updateNavState(); }
        }
        saveSnapshot();
        return;
      }
    }

    // ---------- 面板 ----------
    function togglePanel(name) {
      if (!win) ensureWindow();
      panelOpen = panelOpen === name ? null : name;
      var dlPanel = win.querySelector("#dsh-webbox-dlpanel");
      var setPanel = win.querySelector("#dsh-webbox-setpanel");
      var hPanel = win.querySelector("#dsh-webbox-histpanel");
      var bPanel = win.querySelector("#dsh-webbox-bkpanel");
      if (dlPanel) dlPanel.classList.toggle("open", panelOpen === "downloads");
      if (setPanel) setPanel.classList.toggle("open", panelOpen === "settings");
      if (hPanel) hPanel.classList.toggle("open", panelOpen === "history");
      if (bPanel) bPanel.classList.toggle("open", panelOpen === "bookmarks");
      if (panelOpen === "downloads") {
        renderDownloads();
        if (!dlRefreshTimer) dlRefreshTimer = setInterval(function () { if (panelOpen === "downloads") renderDownloads(); }, 1500);
      } else if (dlRefreshTimer) {
        clearInterval(dlRefreshTimer);
        dlRefreshTimer = null;
      }
    }

    // ---------- 历史 / 书签 渲染 ----------
    function fmtTime(t) {
      try {
        var d = new Date(t);
        var p = function (n) { return n < 10 ? "0" + n : String(n); };
        return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      } catch (e) { return ""; }
    }
    function renderHistory() {
      if (!histPanel) return;
      if (!history.length) {
        histList.innerHTML = "<div class='empty'>" + T("histEmpty") + "</div>";
        return;
      }
      var html = "";
      for (var i = 0; i < Math.min(history.length, 100); i++) {
        var h = history[i];
        html +=
          "<div class='row'><span class='nm2' data-h='" + String(h.url).replace(/'/g, "&#39;") + "'>" +
          (h.title ? String(h.title).replace(/</g, "&lt;").slice(0, 60) : String(h.url).replace(/</g, "&lt;").slice(0, 60)) +
          "</span><span class='sz'>" + fmtTime(h.t) + "</span>" +
          "<button class='ctl' data-h='" + String(h.url).replace(/'/g, "&#39;") + "' title='" + T("dlCancel") + "'>\u2715</button></div>";
      }
      histList.innerHTML = html;
    }
    function renderBookmarks() {
      if (!bkPanel) return;
      if (!bookmarks.length) {
        bkList.innerHTML = "<div class='empty'>" + T("bkEmpty") + "</div>";
        return;
      }
      var html = "";
      for (var i = 0; i < bookmarks.length; i++) {
        var b = bookmarks[i];
        html +=
          "<div class='row'><span class='nm2' data-b='" + String(b.url).replace(/'/g, "&#39;") + "'>" +
          (b.title ? String(b.title).replace(/</g, "&lt;").slice(0, 40) : String(b.url).replace(/</g, "&lt;").slice(0, 40)) +
          "</span><span class='sz'>" + String(b.url).replace(/</g, "&lt;").slice(0, 40) + "</span>" +
          "<button class='ctl' data-b='" + String(b.url).replace(/'/g, "&#39;") + "' title='" + T("bkRemove") + "'>\u2715</button></div>";
      }
      bkList.innerHTML = html;
    }
    // 导入旧版(Electron 时代)历史/书签/标签
    function importLegacy() {
      fetch("/__dsh_web_open__/legacy", { mode: "cors" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok || !j.data) throw new Error("bad");
          var d = j.data;
          var imported = 0;
          if (Array.isArray(d.bookmarks) && d.bookmarks.length) {
            loadBk();
            for (var i = 0; i < d.bookmarks.length; i++) {
              var b = d.bookmarks[i];
              if (!b || !b.url) continue;
              var dup = false;
              for (var k2 = 0; k2 < bookmarks.length; k2++) if (bookmarks[k2].url === b.url) { dup = true; break; }
              if (!dup) { bookmarks.push({ url: b.url, title: b.title || "", t: b.t || Date.now() }); imported++; }
            }
            saveBk();
            renderBookmarks();
            updateFavBtn();
          }
          if (Array.isArray(d.history) && d.history.length) {
            loadHist();
            for (var j2 = 0; j2 < d.history.length; j2++) {
              var h = d.history[j2];
              if (!h || !h.url) continue;
              var dup2 = false;
              for (var k3 = 0; k3 < history.length; k3++) if (history[k3].url === h.url) { dup2 = true; break; }
              if (!dup2) { history.push({ url: h.url, title: h.title || "", t: h.t || Date.now() }); imported++; }
            }
            history.sort(function (a, b2) { return (b2.t || 0) - (a.t || 0); });
            saveHist();
            renderHistory();
          }
          if (Array.isArray(d.tabs) && d.tabs.length) {
            for (var m = 0; m < d.tabs.length; m++) {
              var tu = d.tabs[m];
              if (tu && /^https?:\/\//i.test(tu)) openTab(tu, "");
            }
          }
          flashMsg(T("histImported") + (imported ? " (" + imported + ")" : ""));
        })
        .catch(function () { flashMsg(T("copyFail")); });
    }

    // ---------- 下载管理(代理流 + 进度/速度/暂停(Range 续传)/取消/自动重试3次) ----------
    function guessName(url) {
      try {
        var p = new URL(url).pathname.split("/").filter(Boolean).pop();
        return p || "download";
      } catch (e) { return "download"; }
    }
    function fmtSize(n) {
      if (!n) return "-";
      if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
      if (n > 1024) return (n / 1024).toFixed(0) + " KB";
      return n + " B";
    }
    function loadDownloads() {
      try {
        var arr = JSON.parse(localStorage.getItem("dsh-webbox-downloads") || "[]") || [];
        downloads = arr.filter(function (d) { return d && d.id; });
      } catch (e) { downloads = []; }
    }
    function saveDownloads() {
      try {
        var slim = downloads.map(function (d) {
          return { id: d.id, url: d.url, name: d.name, state: d.state, received: d.received, total: d.total, speed: 0, paused: !!d.paused };
        });
        localStorage.setItem("dsh-webbox-downloads", JSON.stringify(slim));
      } catch (e) {}
    }
    function updateDlBadge() {
      if (!win) return;
      var running = 0, done = 0;
      for (var i = 0; i < downloads.length; i++) {
        if (downloads[i].state === "downloading" && !downloads[i].paused) running += 1;
        else if (downloads[i].state === "completed") done += 1;
      }
      var cnt = dlBtn.parentNode.querySelector(".cnt");
      if (running > 0) { dlBtn.style.color = "#f9a825"; cnt.textContent = String(running); cnt.style.display = "block"; }
      else if (done > 0) { dlBtn.style.color = "#a6e3a1"; cnt.textContent = String(done); cnt.style.display = "block"; }
      else { dlBtn.style.color = ""; cnt.style.display = "none"; }
    }
    function startDownload(url, name0) {
      loadDownloads();
      var w = ensureWindow();
      w.hidden = false;
      for (var i = 0; i < downloads.length; i++) {
        if (downloads[i].url === url && downloads[i].state === "downloading" && !downloads[i].paused) { togglePanel("downloads"); return; }
      }
      var rec = {
        id: "d" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        url: url, name: name0 || guessName(url), state: "downloading", received: 0, total: 0,
        speed: 0, paused: false, chunks: null, ctrl: null, _retry: 0, doneAt: 0,
      };
      downloads.unshift(rec);
      saveDownloads();
      updateDlBadge();
      togglePanel("downloads");
      renderDownloads();
      doDownload(rec);
    }
    function doDownload(rec) {
      if (rec.state !== "downloading" || rec.paused) return;
      rec.ctrl = new AbortController();
      var q = "/__dsh_web_open__/fetch?url=" + encodeURIComponent(rec.url);
      if (rec.received > 0 && rec.total > 0) q += "&range=bytes=" + rec.received + "-";
      rec.chunks = rec.chunks || [];
      var lastTick = { t: Date.now(), b: rec.received };
      fetch(q, { signal: rec.ctrl.signal })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          var cd = r.headers.get("content-disposition");
          if (cd) {
            var m1 = cd.match(/filename\*=UTF-8''([^;]+)/i);
            var m2 = cd.match(/filename="?([^";]+)"?/i);
            if (m1 && m1[1]) { try { rec.name = decodeURIComponent(m1[1]); } catch (e) { rec.name = m1[1]; } }
            else if (m2 && m2[1]) rec.name = m2[1].trim();
          }
          var cr = r.headers.get("content-range");
          var cl = r.headers.get("content-length");
          if (cr) { var m = cr.match(/\/(\d+)/); if (m) rec.total = Number(m[1]); }
          else if (cl) rec.total = Number(cl);
          var reader = r.body.getReader();
          var pump = function () {
            return reader.read().then(function (res) {
              if (res.done) { finishDownload(rec); return; }
              rec.chunks.push(res.value);
              rec.received += res.value.byteLength;
              var now = Date.now();
              if (now - lastTick.t >= 500) {
                rec.speed = Math.round(((rec.received - lastTick.b) * 1000) / (now - lastTick.t));
                lastTick = { t: now, b: rec.received };
                renderDownloads();
                updateDlBadge();
              }
              return pump();
            });
          };
          return pump();
        })
        .catch(function (e) {
          if (rec.paused || rec.state !== "downloading") return; // 主动暂停/取消
          // 中断自动重试:已收部分数据 → Range 断点续传,最多 3 次(对应旧版 canResume 重试)
          if (rec.received > 0 && rec._retry < 3) {
            rec._retry += 1;
            setTimeout(function () { if (rec.state === "downloading" && !rec.paused) doDownload(rec); }, 3000 * rec._retry);
          } else {
            rec.state = "interrupted";
            rec.speed = 0;
            saveDownloads();
            renderDownloads();
            updateDlBadge();
          }
        });
    }
    function finishDownload(rec) {
      if (rec.state !== "downloading" || rec.paused) return;
      var blob = new Blob(rec.chunks || []);
      rec.chunks = null;
      rec.state = "completed";
      rec.received = rec.total > 0 ? rec.total : rec.received;
      rec.speed = 0;
      rec.doneAt = Date.now();
      rec.ctrl = null;
      saveDownloads();
      renderDownloads();
      updateDlBadge();
      try {
        var u = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = u;
        a.download = rec.name || "download";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(u);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 60000);
      } catch (e) {}
      playDing();
      notifyDone(rec.name || "download");
    }
    function pauseDownload(rec) {
      if (rec.state !== "downloading" || rec.paused) return;
      rec.paused = true;
      if (rec.ctrl) { try { rec.ctrl.abort(); } catch (e) {} }
      rec.speed = 0;
      saveDownloads();
      renderDownloads();
      updateDlBadge();
    }
    function resumeDownload(rec) {
      if (rec.state !== "downloading" || !rec.paused) return;
      rec.paused = false;
      saveDownloads();
      renderDownloads();
      updateDlBadge();
      doDownload(rec);
    }
    function cancelDownload(rec) {
      if (rec.state !== "downloading") return;
      rec.state = "cancelled";
      if (rec.ctrl) { try { rec.ctrl.abort(); } catch (e) {} }
      rec.speed = 0;
      saveDownloads();
      renderDownloads();
      updateDlBadge();
    }
    function redoDownload(rec) {
      rec.state = "downloading";
      rec.received = 0;
      rec.total = 0;
      rec.paused = false;
      rec._retry = 0;
      rec.chunks = null;
      saveDownloads();
      renderDownloads();
      updateDlBadge();
      doDownload(rec);
    }
    function copyLink(rec) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(rec.url).then(function () { flashMsg(T("copyOk")); }, function () { flashMsg(T("copyFail")); });
        } else {
          var ta = document.createElement("textarea");
          ta.value = rec.url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          flashMsg(T("copyOk"));
        }
      } catch (e) { flashMsg(T("copyFail")); }
    }
    var flashTimer = null;
    function flashMsg(m) {
      var dlPanel = win.querySelector("#dsh-webbox-dlpanel");
      var h = dlPanel.querySelector("h3");
      h.textContent = T("dlTitle") + " \u2014 " + m;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { h.textContent = T("dlTitle"); }, 1500);
    }
    function renderDownloads() {
      if (!win) return;
      var dlPanel = win.querySelector("#dsh-webbox-dlpanel");
      var list = dlPanel.querySelector(".dsh-webbox-dl");
      if (!downloads.length) {
        list.innerHTML = "<div class='empty'>" + T("dlEmpty") + "</div>";
        return;
      }
      var html = "";
      for (var i = 0; i < downloads.length; i++) {
        var d = downloads[i];
        var stName = { downloading: T("st_downloading"), completed: T("st_completed"), interrupted: T("st_interrupted"), cancelled: T("st_cancelled") }[d.state] || d.state;
        var pct = d.total > 0 ? Math.round(d.received / d.total * 100) : (d.received > 0 ? -1 : 0);
        var bar;
        if (d.state === "downloading") {
          bar = pct < 0
            ? "<div class='pg ind'><i></i></div>"
            : "<div class='pg'><i style='width:" + pct + "%'></i></div>";
        } else bar = "<div class='pg'><i style='width:" + (d.state === "completed" ? 100 : 0) + "%'></i></div>";
        var size = d.total > 0 ? fmtSize(d.total) : (d.received > 0 ? fmtSize(d.received) : "\u2014");
        var spd = (d.state === "downloading" && !d.paused && d.speed) ? "<span class='sz'>" + fmtSize(d.speed) + "/s</span>" : "";
        var act = "";
        if (d.state === "downloading") {
          act += d.paused
            ? "<button class='ctl' data-a='resume' data-id='" + d.id + "' title='" + T("dlResume") + "'>\u25b6</button>"
            : "<button class='ctl' data-a='pause' data-id='" + d.id + "' title='" + T("dlPause") + "'>\u23f8</button>";
          act += "<button class='ctl' data-a='cancel' data-id='" + d.id + "' title='" + T("dlCancel") + "'>\u2715</button>";
        } else if (d.state === "completed" || d.state === "interrupted" || d.state === "cancelled") {
          act += "<button class='ctl' data-a='redo' data-id='" + d.id + "' title='" + T("dlRedo") + "'>\u21bb</button>";
        }
        act += "<button class='ctl' data-a='copy' data-id='" + d.id + "' title='" + T("dlCopy") + "'>\ud83d\udd17</button>";
        html +=
          "<div class='row'><span class='nm' title='" + String(d.url).replace(/'/g, "&#39;") + "'>" + String(d.name || "?").replace(/</g, "&lt;") + "</span>" +
          "<div class='mg'><span class='st st-" + d.state + "'>" + stName + "</span>" + bar + "</div>" +
          "<span class='sz'>" + size + "</span>" + spd + act + "</div>";
      }
      list.innerHTML = html;
      var ctlEls = list.querySelectorAll(".ctl");
      for (var j = 0; j < ctlEls.length; j++) {
        (function (btnEl) {
          btnEl.addEventListener("click", function () {
            var a = btnEl.getAttribute("data-a"), id = btnEl.getAttribute("data-id");
            for (var k = 0; k < downloads.length; k++) {
              if (downloads[k].id !== id) continue;
              var rec = downloads[k];
              if (a === "pause") pauseDownload(rec);
              else if (a === "resume") resumeDownload(rec);
              else if (a === "cancel") cancelDownload(rec);
              else if (a === "redo") redoDownload(rec);
              else if (a === "copy") copyLink(rec);
              return;
            }
          });
        })(ctlEls[j]);
      }
    }

    // ---------- 链接拦截(会话/页面里的外部 http(s)) ----------
    function openInWebbox(href) {
      modePromise.then(function (m) {
        var base = m === "electron" ? "http://127.0.0.1:13777/__dsh_web_open__" : webEndpoint("/__dsh_web_open__");
        fetch(base + "?url=" + encodeURIComponent(href), { mode: "cors" })
          .then(function (r) {
            if (!r.ok) window.open(href, "_blank"); // 命令端点不可用 → 退回新标签
          })
          .catch(function () {
            window.open(href, "_blank");
          });
      });
    }

    // 下载链接判定:带 download 属性,或常见下载扩展名(去掉 query/hash 后)
    function isDownloadLink(a, href) {
      if (a.hasAttribute && a.hasAttribute("download")) return true;
      var clean = href.split("?")[0].split("#")[0].toLowerCase();
      return /\.(zip|rar|7z|tar|gz|exe|msi|apk|dmg|pkg|iso|pdf|docx?|xlsx?|pptx?|mp3|mp4|mov|dll|jar|bin|whl)$/i.test(clean);
    }

    document.addEventListener(
      "click",
      function (e) {
        var el0 = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!el0 || !el0.href) return;
        // 内嵌浏览器窗口自己的元素放行,避免拦截回环
        if (el0.closest("#dsh-webbox-window")) return;
        var href = el0.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) return; // 只拦外部 http(s) 链接
        if (href.indexOf(window.location.origin) === 0) return; // DSH 内部链接放行
        e.preventDefault();
        e.stopPropagation();
        if (isDownloadLink(el0, href)) {
          var ln = (el0.textContent || "").trim();
          startDownload(href, ln || "");
        } else {
          openInWebbox(href); // 服务端 SSE 回推 page 事件 → openTab
        }
      },
      true
    );

    // 输入框纯 URL 自动检测 + 窗口快捷键(仅窗口打开时生效;iframe 内部按键由 iframe 自身消费)
    document.addEventListener("keydown", function (e) {
      var k = e.key;
      // 快捷键:Alt+Q 聚焦地址栏 / Ctrl+T 新标签 / Ctrl+W 关闭标签 / Ctrl+Shift+T 恢复关闭
      if (win && !win.hidden) {
        if (e.altKey && !e.ctrlKey && !e.shiftKey && k.toLowerCase() === "q") {
          e.preventDefault();
          urlInput.focus();
          urlInput.select();
          return;
        }
        if (e.ctrlKey && !e.altKey && !e.shiftKey && k.toLowerCase() === "t") {
          e.preventDefault();
          newTab();
          return;
        }
        if (e.ctrlKey && !e.altKey && !e.shiftKey && k.toLowerCase() === "w") {
          var at = activeTab();
          if (at) { e.preventDefault(); closeTab(at.key); }
          return;
        }
        if (e.ctrlKey && !e.altKey && e.shiftKey && k.toLowerCase() === "t") {
          e.preventDefault();
          restoreClosedTab();
          return;
        }
      }
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      var el0 = document.activeElement;
      if (!el0 || (el0.tagName !== "TEXTAREA" && el0.tagName !== "INPUT")) return;
      if (el0.closest && el0.closest("#dsh-webbox-window")) return;
      var v = (el0.value || "").trim();
      if (!/^https?:\/\/\S+$/i.test(v)) return; // 只匹配"整条就是 URL"
      e.preventDefault();
      e.stopPropagation();
      openInWebbox(v);
      el0.value = "";
    }, true);

    // ---------- web 模式:SSE → 浮动窗口/下载面板 ----------
    modePromise.then(function (m) {
      if (m !== "web") return; // Electron 模式保持原样(壳自己有窗口)
      loadDownloads();
      loadHist();
      loadBk();
      updateDlBadge();
      restoreSession();
      var es;
      try {
        es = new EventSource(webEndpoint("/__dsh_web_open__/events"));
      } catch (e) {
        return;
      }
      es.onmessage = function (ev) {
        var p;
        try { p = JSON.parse(ev.data); } catch (e) { return; }
        if (!p || typeof p.url !== "string" || !p.url) return;
        if (p.type === "download") {
          startDownload(p.url, p.title || "");
          return;
        }
        openTab(p.url, p.title || "");
      };
      // onerror 留空:EventSource 自动重连
    });

    // cordis 前端插件形状:loader 要求 exports.apply(空实现即可,
    // 拦截逻辑已在 factory 执行时通过 document.addEventListener 注册)
    function apply() {}
    exports.apply = apply;
    return module.exports;
  },
});