// @dsh-external/dsh-web-open 客户端半边:拦截会话/页面里的外部链接点击,
// 改为在 DSH 内嵌浏览器窗口中打开(不再跳系统浏览器或新标签)。
// 双模式:Electron 壳走 main.js 补丁的固定端口命令服务(http://127.0.0.1:13777);
// DSH Web 架构(纯 Node+Web)走同源主端口 webServer 路由 + SSE,
// 并使用 GUI 内嵌浮动浏览器窗口(代理 iframe 多标签)呈现页面。
// 模式探测:请求 13777 状态端点,800ms 无响应即视为 web 模式。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-web-open",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    // 模式探测:Electron 补丁服务存在 → 'electron';否则 'web'(800ms 内无响应降级)
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

    // ---------- 内嵌浮动浏览器窗口(web 模式) ----------
    // 页面经服务端代理(/__dsh_web_open__/proxy)拉取并剥离 X-Frame-Options/CSP,
    // 因此 iframe 可以先于用户的浏览器直载目标站点。
    // sandbox 刻意不开 allow-same-origin:避免被打开的网页摸到 DSH GUI 自身 DOM。
    var win = null;
    var tabs = []; // {key,url,title,frame,tabEl}
    var activeKey = null;
    var tabSeq = 0;
    var STYLE_ID = "dsh-webbox-style";

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent =
        "#dsh-webbox-window{position:fixed;right:24px;bottom:24px;width:880px;max-width:92vw;height:620px;max-height:82vh;" +
        "z-index:2147483600;display:flex;flex-direction:column;background:#111827;color:#e5e7eb;" +
        "border:1px solid #374151;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden;" +
        "font:13px/1.4 system-ui,sans-serif;}" +
        "#dsh-webbox-window[hidden]{display:none!important}" +
        ".dsh-webbox-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#1f2937;" +
        "border-bottom:1px solid #374151;user-select:none;cursor:default;flex:0 0 auto}" +
        ".dsh-webbox-title{font-weight:600;white-space:nowrap;color:#9ca3af;font-size:12px;flex:0 0 auto}" +
        ".dsh-webbox-tabs{display:flex;gap:4px;overflow-x:auto;flex:1 1 auto;min-width:0;padding:0 4px}" +
        ".dsh-webbox-tab{display:flex;align-items:center;gap:4px;max-width:180px;padding:3px 4px 3px 8px;" +
        "background:#374151;border:none;border-radius:6px;color:#d1d5db;font-size:12px;cursor:pointer;" +
        "flex:0 0 auto;overflow:hidden}" +
        ".dsh-webbox-tab.active{background:#2563eb;color:#fff}" +
        ".dsh-webbox-tab .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
        ".dsh-webbox-tab .x{margin-left:2px;padding:0 3px;border-radius:4px;color:#9ca3af;font-size:11px;line-height:1.2}" +
        ".dsh-webbox-tab .x:hover{background:rgba(255,255,255,.25);color:#fff}" +
        ".dsh-webbox-addr{flex:0 0 230px;min-width:100px;background:#111827;color:#f9fafb;" +
        "border:1px solid #4b5563;border-radius:6px;padding:3px 8px;font-size:12px;outline:none}" +
        ".dsh-webbox-addr:focus{border-color:#3b82f6}" +
        ".dsh-webbox-btn{background:#374151;border:none;border-radius:6px;color:#e5e7eb;font-size:13px;" +
        "line-height:1;padding:5px 9px;cursor:pointer;flex:0 0 auto}" +
        ".dsh-webbox-btn:hover{background:#4b5563}" +
        ".dsh-webbox-btn.danger:hover{background:#dc2626}" +
        ".dsh-webbox-body{flex:1 1 auto;position:relative;background:#fff;min-height:0}" +
        ".dsh-webbox-frame{position:absolute;inset:0;width:100%;height:100%;border:none;background:#fff;display:none}" +
        ".dsh-webbox-frame.active{display:block}";
      (document.head || document.documentElement).appendChild(s);
    }

    function proxyUrl(u) {
      return webEndpoint("/__dsh_web_open__/proxy?url=" + encodeURIComponent(u));
    }

    function el(tag, props, parent) {
      var n = document.createElement(tag);
      if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) n[k] = props[k];
      if (parent) parent.appendChild(n);
      return n;
    }

    function ensureWindow() {
      if (win) return win;
      ensureStyle();
      win = el("div", { id: "dsh-webbox-window", hidden: true });
      var bar = el("div", { className: "dsh-webbox-bar" }, win);
      el("div", { className: "dsh-webbox-title", textContent: "DSH \u5185\u5d4c\u6d4f\u89c8\u5668" }, bar);
      var tabsWrap = el("div", { className: "dsh-webbox-tabs" }, bar);
      var addr = el("input", {
        className: "dsh-webbox-addr",
        type: "text",
        spellcheck: false,
        placeholder: "\u8f93\u5165\u7f51\u5740\u56de\u8f66",
      }, bar);
      var btnRefresh = el("button", { className: "dsh-webbox-btn", textContent: "\u21bb", title: "\u5237\u65b0\u5f53\u524d\u9875" }, bar);
      var btnNew = el("button", { className: "dsh-webbox-btn", textContent: "\u2197", title: "\u65b0\u6807\u7b7e" }, bar);
      var btnClose = el("button", { className: "dsh-webbox-btn danger", textContent: "\u00d7", title: "\u5173\u95ed\u7a97\u53e3" }, bar);
      var body = el("div", { className: "dsh-webbox-body" }, win);
      (document.body || document.documentElement).appendChild(win);

      // 标题栏拖拽移动(双击标题恢复右下角停靠)
      var dragging = null;
      bar.addEventListener("pointerdown", function (e) {
        if (e.target.closest && e.target.closest("button,input,.dsh-webbox-tab")) return;
        dragging = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
        bar.setPointerCapture(e.pointerId);
      });
      bar.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var x = e.clientX - dragging.dx;
        var y = e.clientY - dragging.dy;
        x = Math.max(8, Math.min(x, window.innerWidth - win.offsetWidth - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - win.offsetHeight - 8));
        win.style.left = x + "px";
        win.style.top = y + "px";
        win.style.right = "auto";
        win.style.bottom = "auto";
      });
      function endDrag() { dragging = null; }
      bar.addEventListener("pointerup", endDrag);
      bar.addEventListener("pointercancel", endDrag);
      bar.addEventListener("dblclick", function (e) {
        if (e.target.closest && e.target.closest("button,input,.dsh-webbox-tab")) return;
        win.style.left = "auto";
        win.style.top = "auto";
        win.style.right = "24px";
        win.style.bottom = "24px";
      });

      btnRefresh.addEventListener("click", function () {
        var t = activeTab();
        if (t) t.frame.src = proxyUrl(t.url) + "&_r=" + Date.now();
      });
      btnNew.addEventListener("click", function () {
        win.hidden = false;
        addr.focus();
      });
      btnClose.addEventListener("click", function () {
        win.hidden = true;
      });
      addr.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var v = addr.value.trim();
        if (!v) return;
        if (!/^https?:\/\//i.test(v)) v = "https://" + v;
        if (!/^https?:\/\/\S+$/i.test(v)) return;
        openTab(v, "");
        addr.value = "";
      });
      return win;
    }

    function activeTab() {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].key === activeKey) return tabs[i];
      return null;
    }

    function openTab(url, title) {
      var w = ensureWindow();
      // 同 URL 已开 → 激活即可
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].url === url) { activate(tabs[i].key); w.hidden = false; return; }
      }
      var key = "t" + (++tabSeq);
      var frame = el("iframe", {
        className: "dsh-webbox-frame",
        sandbox: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
        referrerPolicy: "no-referrer",
        src: proxyUrl(url),
      });
      w.querySelector(".dsh-webbox-body").appendChild(frame);
      var tabEl = el("div", { className: "dsh-webbox-tab" });
      var nm = el("span", { className: "nm", textContent: title || url.replace(/^https?:\/\//, "") }, tabEl);
      var x = el("span", { className: "x", textContent: "\u00d7", title: "\u5173\u95ed\u6807\u7b7e" }, tabEl);
      nm.title = url;
      tabEl.addEventListener("click", function () { activate(key); w.hidden = false; });
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        closeTab(key);
      });
      var tabsWrap = w.querySelector(".dsh-webbox-tabs");
      tabsWrap.appendChild(tabEl);
      tabs.push({ key: key, url: url, title: title, frame: frame, tabEl: tabEl });
      activate(key);
      w.hidden = false;
    }

    function activate(key) {
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var on = t.key === key;
        t.frame.className = "dsh-webbox-frame" + (on ? " active" : "");
        t.tabEl.className = "dsh-webbox-tab" + (on ? " active" : "");
        if (on) {
          activeKey = key;
          var addr = win.querySelector(".dsh-webbox-addr");
          if (addr) addr.value = t.url;
        }
      }
    }

    function closeTab(key) {
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].key !== key) continue;
        var t = tabs[i];
        if (t.frame.parentNode) t.frame.parentNode.removeChild(t.frame);
        if (t.tabEl.parentNode) t.tabEl.parentNode.removeChild(t.tabEl);
        tabs.splice(i, 1);
        if (activeKey === key) {
          activeKey = null;
          if (tabs.length) activate(tabs[tabs.length - 1].key);
          else win.hidden = true;
        }
        return;
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

    // 下载:web 模式下不再静默吞错,失败回退新标签(让浏览器接管下载)
    function triggerDownload(href) {
      modePromise.then(function (m) {
        var base = m === "electron" ? "http://127.0.0.1:13777/__dsh_web_open__/download" : webEndpoint("/__dsh_web_open__/download");
        fetch(base + "?url=" + encodeURIComponent(href), { mode: "cors" }).catch(function () {
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
          triggerDownload(href);
        } else {
          openInWebbox(href); // 服务端 SSE 回推 page 事件 → openTab
        }
      },
      true
    );

    // 输入框纯 URL 自动检测:回车发送裸 URL → 直接在内嵌浏览器打开(不发给模型)
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      var el0 = document.activeElement;
      if (!el0 || (el0.tagName !== "TEXTAREA" && el0.tagName !== "INPUT")) return;
      var v = (el0.value || "").trim();
      if (!/^https?:\/\/\S+$/i.test(v)) return; // 只匹配"整条就是 URL"
      e.preventDefault();
      e.stopPropagation();
      openInWebbox(v);
      el0.value = "";
    }, true);

    // ---------- web 模式:SSE → 浮动窗口 ----------
    modePromise.then(function (m) {
      if (m !== "web") return; // Electron 模式保持原样(壳自己有窗口)
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
          window.open(p.url, "_blank");
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