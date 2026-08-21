// @dsh-external/dsh-web-open 客户端半边:拦截会话/页面里的外部链接点击,
// 改为在 DSH 内嵌浏览器中打开(不再跳系统浏览器或新标签)。
// 双模式:Electron 壳走 main.js 补丁的固定端口命令服务(http://127.0.0.1:13777);
// DSH Web 架构(纯 Node+Web)走同源主端口 webServer 路由 + SSE 覆盖层。
// 模式探测:请求 13777 状态端点,800ms 无响应即视为 web 模式。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-web-open",
  factory: (require) => {
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
        var el = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!el || !el.href) return;
        // 覆盖层自己的链接/关闭按钮放行,避免拦截回环
        if (el.closest("#dsh-web-open-overlay")) return;
        var href = el.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) return; // 只拦外部 http(s) 链接
        if (href.indexOf(window.location.origin) === 0) return; // DSH 内部链接放行
        e.preventDefault();
        e.stopPropagation();
        if (isDownloadLink(el, href)) {
          // 下载链接:先弹"选择保存文件夹",确认后才真正下载(绕开 Electron item 销毁 bug)
          triggerDownload(href);
        } else {
          openInWebbox(href);
        }
      },
      true
    );

    // 输入框纯 URL 自动检测:回车发送裸 URL → 直接在内嵌浏览器打开(不发给模型)
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      var el = document.activeElement;
      if (!el || (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT")) return;
      var v = (el.value || "").trim();
      if (!/^https?:\/\/\S+$/i.test(v)) return; // 只匹配"整条就是 URL"
      e.preventDefault();
      e.stopPropagation();
      openInWebbox(v);
      el.value = "";
    }, true);

    // ---------- web 模式:SSE 覆盖层 ----------
    // 模型调用 open_url 时,服务端向本页推送事件 → 显示"在新标签打开"浮层
    // (web 模式没有内嵌 BrowserWindow,降级为浏览器新标签;下载类推送直接新开标签)。
    function ensureOverlay() {
      var ov = document.getElementById("dsh-web-open-overlay");
      if (ov) return ov;
      ov = document.createElement("div");
      ov.id = "dsh-web-open-overlay";
      ov.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:2147483647;display:none;max-width:60vw;" +
        "background:#1f2937;color:#f9fafb;border:1px solid #4b5563;border-radius:10px;" +
        "box-shadow:0 8px 30px rgba(0,0,0,.45);padding:10px 14px;font:13px/1.5 system-ui,sans-serif;";
      var a = document.createElement("a");
      a.id = "dsh-web-open-overlay-link";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.cssText = "color:#7dd3fc;text-decoration:none;word-break:break-all;";
      var btn = document.createElement("button");
      btn.id = "dsh-web-open-overlay-close";
      btn.textContent = "\u00d7";
      btn.setAttribute("aria-label", "close");
      btn.style.cssText = "margin-left:10px;background:none;border:none;color:#9ca3af;font-size:15px;cursor:pointer;";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        ov.style.display = "none";
      });
      ov.appendChild(a);
      ov.appendChild(btn);
      (document.body || document.documentElement).appendChild(ov);
      return ov;
    }

    modePromise.then(function (m) {
      if (m !== "web") return; // Electron 模式保持原样,不开 SSE
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
        var ov = ensureOverlay();
        var a = ov.querySelector("#dsh-web-open-overlay-link") || ov.firstChild;
        a.href = p.url;
        a.textContent = (p.title ? p.title + " \u2014 " : "") + p.url;
        ov.style.display = "block";
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