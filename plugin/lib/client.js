// @dsh-external/dsh-web-open 客户端半边:拦截会话/页面里的外部链接点击,
// 改为在 DSH 内嵌浏览器中打开(不再跳系统浏览器或新标签)。
// 依赖 main.js 补丁的固定端口命令服务(http://127.0.0.1:13777)。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-web-open",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var WEBBOX_ENDPOINT = "http://127.0.0.1:13777/__dsh_web_open__";

    function openInWebbox(href) {
      fetch(WEBBOX_ENDPOINT + "?url=" + encodeURIComponent(href))
        .then(function (r) {
          if (!r.ok) window.open(href, "_blank"); // 命令端点不可用 → 退回新标签
        })
        .catch(function () {
          window.open(href, "_blank");
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
        var href = el.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) return; // 只拦外部 http(s) 链接
        if (href.indexOf(window.location.origin) === 0) return; // DSH 内部链接放行
        e.preventDefault();
        e.stopPropagation();
        if (isDownloadLink(el, href)) {
          // 下载链接:先弹"选择保存文件夹",确认后才真正下载(绕开 Electron item 销毁 bug)
          fetch("http://127.0.0.1:13777/__dsh_web_open__/download?url=" + encodeURIComponent(href), { mode: "cors" }).catch(function () {});
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

    // cordis 前端插件形状:loader 要求 exports.apply(空实现即可,
    // 拦截逻辑已在 factory 执行时通过 document.addEventListener 注册)
    function apply() {}
    exports.apply = apply;
    return module.exports;
  },
});
