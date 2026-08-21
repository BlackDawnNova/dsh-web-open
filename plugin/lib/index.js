/**
 * dsh-web-open: open a webpage in an embedded DSH window (does not leave DSH).
 *
 * Chain: model calls open_url tool → host reads the preview-static-server port
 * from <userData>/dsh-web-open.port (written by the main.js patch) → GET
 * http://127.0.0.1:<port>/__dsh_web_open__?url=... → main.js createWebWindow()
 * pops an embedded BrowserWindow with the page.
 *
 * Also: on plugin start, checks whether the main.js patch is still present
 * (DSH updates wipe resources/app) and re-applies it automatically.
 */
import fs from 'node:fs';
import { defineTool } from '@deepseek-ai/dsh-tools';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-web-open';
export const inject = ['tools', 'webServer'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'assets');

// <userData>/dsh-web-open.port —— main.js 补丁启动时写入
function portFile() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'DSH Desktop', 'dsh-web-open.port');
}

const URL_RE = /^https?:\/\//i;

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
};

// ---------- web 模式(新 DSH Web 架构:无 Electron main.js 补丁) ----------
// DSH 重构后:同一主端口注册 webServer 路由,替代 13777 固定端口补丁服务;
// GUI 前端经 SSE(/__dsh_web_open__/events)接收推送;无 BrowserWindow 可弹,
// 弹窗语义降级为系统默认浏览器移交(与 dsh-web-app 的 open 包同语义)。
const CLEAN_URL_RE = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/;
const sseClients = new Set();
let sseHeartbeat = null;

function myVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// URL 清洗:去掉中文注释/多余文字(与补丁侧一致)
function cleanTarget(raw) {
  const m = String(raw || '').match(CLEAN_URL_RE);
  return m ? m[0] : String(raw || '');
}

function sendJson(res, status, obj) {
  try {
    if (!res.headersSent) {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
      });
    }
    res.end(JSON.stringify(obj));
  } catch {}
}

function notifyGui(payload) {
  const data = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const res of sseClients) {
    try { res.write(data); } catch {}
  }
}

// ---------- web 模式内嵌浮窗:页面代理(2026-08-22,绕开 X-Frame-Options/CSP frame-ancestors) ----------
// GUI 内嵌窗口用 iframe 展示目标页;iframe 直载会被 XFO 拦截,故经本路由服务端拉取:
// 剥掉 XFO/CSP 响应头 + 注入 <base> 让子资源按原站解析 + 把导航型链接(a/form/iframe/meta refresh)
// 重写回代理,保证窗口内点击继续走代理(否则跳转原站后 XFO 白屏)。
const PROXY_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function proxyUrlFor(proxyBase, target) {
  return proxyBase + '/__dsh_web_open__/proxy?url=' + encodeURIComponent(target);
}

// 重写 HTML:注入 base + 导航链接改走代理
function rewriteHtmlForProxy(html, finalUrl, proxyBase) {
  const escUrl = finalUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const baseTag = '<base href="' + escUrl + '">';
  let out = /<head[^>]*>/i.test(html)
    ? html.replace(/(<head[^>]*>)/i, '$1' + baseTag)
    : '<head>' + baseTag + '</head>' + html;
  // a/area/form/iframe/frame 的导航属性 → 代理(跳过 #/javascript:/data: 等)
  out = out.replace(/<(a|area|form|iframe|frame)\b([^>]*)>/gi, (tag, tname, attrs) => {
    if (!/(\s(href|src|action)\s*=)/i.test(attrs)) return tag;
    const newAttrs = attrs.replace(
      /(\s(href|src|action)\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
      (m, pre, _attr, _q, dq, sq, bare) => {
        let v = dq !== undefined ? dq : sq !== undefined ? sq : bare || '';
        v = v.trim();
        if (!v || v[0] === '#' || /^(javascript|data|mailto|tel|about|blob|file):/i.test(v)) return m;
        let abs;
        try { abs = new URL(v, finalUrl).href; } catch { return m; }
        if (!/^https?:\/\//i.test(abs)) return m;
        const nv = proxyUrlFor(proxyBase, abs);
        if (dq !== undefined) return pre + '"' + nv + '"';
        if (sq !== undefined) return pre + "'" + nv + "'";
        return pre + '"' + nv + '"';
      }
    );
    return '<' + tname + newAttrs + '>';
  });
  // meta refresh url= → 代理
  out = out.replace(/(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>)/gi, (m, tag) => {
    const mm = tag.match(/url\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    if (!mm) return m;
    const v = mm[2] !== undefined ? mm[2] : mm[3] !== undefined ? mm[3] : mm[4] || '';
    try {
      const abs = new URL(v, finalUrl).href;
      if (/^https?:\/\//i.test(abs)) {
        return tag.replace(/url\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i, 'url=' + proxyUrlFor(proxyBase, abs));
      }
    } catch {}
    return m;
  });
  return out;
}

// 非 HTML 内容(下载类):返回一个引导页,让客户端右上角"系统浏览器"按钮接管
function nonHtmlNotice(target, contentType) {
  const h = encodeURIComponent(target);
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>内容类型不支持内嵌</title></head>' +
    '<body style="font:14px/1.7 system-ui,sans-serif;background:#1f2937;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">' +
    '<div style="text-align:center;max-width:70vw;">' +
    '<p>该内容类型(<b>' + String(contentType || 'unknown').replace(/</g, '&lt;') + '</b>)不适合窗口内嵌。</p>' +
    '<p><a href="' + h + '" target="_blank" rel="noopener" style="color:#7dd3fc;">在系统浏览器打开 ↗</a></p>' +
    '</div></body></html>'
  );
}

// 网络错误码文案(对应旧 Electron 版 did-fail-load 错误码映射):iframe 代理失败时显示错误页而非白屏
function zhLang(req) {
  try { return /zh/i.test(String((req.headers && req.headers['accept-language']) || '')); } catch { return true; }
}
function proxyErrorPage(target, msg, zh, proxyBase) {
  const T = zh
    ? { title: '无法访问此网站', dns: '域名无法解析', conn: '无法连接到服务器', timeout: '连接超时', reset: '连接被重置', net: '网络错误', load: '加载失败', retry: '重试', external: '在系统浏览器打开' }
    : { title: "This site can't be reached", dns: 'DNS resolution failed', conn: 'Cannot reach the server', timeout: 'Connection timed out', reset: 'Connection was reset', net: 'Network error', load: 'Load failed', retry: 'Retry', external: 'Open in system browser' };
  let key = 'load';
  const m = String(msg || '');
  if (/getaddrinfo|ENOTFOUND|EAI_AGAIN|\bdns\b/i.test(m)) key = 'dns';
  else if (/timed out|timeout|abort/i.test(m)) key = 'timeout';
  else if (/ECONNREFUSED|refused/i.test(m)) key = 'conn';
  else if (/ECONNRESET|reset/i.test(m)) key = 'reset';
  else if (/fetch failed|ENETUNREACH|network/i.test(m)) key = 'net';
  const safeUrl = String(target).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const retryHref = proxyUrlFor(proxyBase, target) + '&r=' + Date.now();
  const extHref = String(target).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + T.title + '</title></head>' +
    '<body style="margin:0;font-family:system-ui,sans-serif;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh">' +
    '<div style="text-align:center;max-width:640px;padding:24px">' +
    '<div style="font-size:44px;margin-bottom:14px">⚠️</div>' +
    '<div style="font-size:17px;font-weight:600">' + T.title + '</div>' +
    '<div style="color:#a6adc8;margin-top:10px;font-size:13px;line-height:1.7">' + T[key] + '<br><span style="word-break:break-all">' + safeUrl + '</span></div>' +
    '<div style="margin-top:24px;display:flex;gap:12px;justify-content:center">' +
    '<a href="' + retryHref + '" style="text-decoration:none;background:#89b4fa;color:#11111b;border-radius:6px;padding:8px 22px;font-size:13px;font-weight:600">' + T.retry + '</a>' +
    '<a href="' + extHref + '" target="_blank" rel="noopener" style="text-decoration:none;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;padding:8px 22px;font-size:13px">' + T.external + '</a>' +
    '</div></div></body></html>'
  );
}

// web 模式没有内嵌窗口:移交系统默认浏览器(win32 cmd start / darwin open / linux xdg-open)
function openSystemBrowser(url) {
  try {
    const isWin = process.platform === 'win32';
    const child = spawn(
      isWin ? (process.env.ComSpec || 'cmd.exe') : (process.platform === 'darwin' ? 'open' : 'xdg-open'),
      isWin ? ['/c', 'start', '""', '"' + url + '"'] : [url],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
  } catch {}
}

// read_page 的 web 实现:Node fetch 抓取正文(替代隐藏 BrowserWindow)
async function readPageTextWeb(pageUrl) {
  try {
    const res = await fetch(String(pageUrl), { redirect: 'follow', signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return { ok: false, error: 'load failed: HTTP ' + res.status };
    const html = await res.text();
    let title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
      .replace(/<[^>]+>/g, '').trim().slice(0, 200);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ').trim();
    return { ok: true, url: String(pageUrl), title, text: text.slice(0, 8000) };
  } catch (e) {
    return { ok: false, error: 'load failed: ' + ((e && e.message) || e) };
  }
}

// 更新检测的 web 实现:直接查 GitHub releases(替代补丁侧 checkForUpdate)
async function checkUpdateWeb() {
  try {
    const res = await fetch('https://api.github.com/repos/BlackDawnNova/dsh-web-open/releases/latest', {
      headers: { 'User-Agent': 'dsh-web-open', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, error: 'github http ' + res.status };
    const r = await res.json();
    return {
      ok: true,
      local: myVersion(),
      latest: String(r.tag_name || '').replace(/^v/i, ''),
      notes: String((r && r.body) || '').trim().slice(0, 2000),
      url: String((r && r.html_url) || ''),
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// SSE 推送:模型开页 → 服务端推给 GUI 客户端显示"在新标签打开"覆盖层
function handleSseEvents(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'access-control-allow-origin': '*',
  });
  res.write(':ok\n\n');
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
  if (!sseHeartbeat) {
    sseHeartbeat = setInterval(() => {
      for (const r of sseClients) { try { r.write(':hb\n\n'); } catch {} }
    }, 25_000);
    sseHeartbeat.unref();
  }
}

// ---------- 自动检测并重打 main.js 补丁(DSH 更新后恢复) ----------

function findMainJs() {
  const cands = [
    'D:/DSH Desktop/resources/app/main.js',
    'C:/Program Files/DSH Desktop/resources/app/main.js',
    path.join(process.env.PROGRAMFILES || '', 'DSH Desktop/resources/app/main.js'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'DSH Desktop/resources/app/main.js'),
    path.join(os.homedir(), 'DSH Desktop/resources/app/main.js'),
  ];
  for (const c of cands) {
    if (c && fs.existsSync(c)) return c;
  }
  // 注册表探测(用户自定义安装位置)
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "DSH Desktop" /d',
      { encoding: 'utf8', windowsHide: true, timeout: 10000 }
    );
    for (const line of out.split(/\r?\n/)) {
      if (line.includes('InstallLocation') || line.includes('DisplayIcon')) {
        const v = line.replace(/^.*REG_SZ\s*/, '').trim().replace(/"/g, '');
        if (!v) continue;
        const p = path.join(v, 'resources', 'app', 'main.js');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return null;
}

function ensurePatched() {
  // 尾插方案(2026-08-16):main.js 只追加一行 require + 外部补丁文件,零锚点依赖。
  // DSH 更新清掉 resources/app → 自愈:复制补丁文件 + 尾插加载行 + preload,永远可恢复。
  try {
    const mainJs = findMainJs();
    if (!mainJs) {
      console.log('[dsh-web-open] 未找到 main.js,跳过自动补丁检测 / main.js not found, skip auto-patch check');
      return;
    }
    const appDir = path.dirname(mainJs);
    const repaired = [];

    // 1. 补丁文件(自包含模块):缺失 → 从插件 assets 复制
    const patchFile = path.join(appDir, 'dsh-web-open-patch.js');
    if (!fs.existsSync(patchFile)) {
      try {
        fs.copyFileSync(path.join(ASSETS, 'dsh-web-open-patch.js'), patchFile);
        repaired.push('patch file');
      } catch (e2) { console.log('[dsh-web-open] 补丁文件复制失败 / patch file copy failed: ' + (e2 && e2.message)); }
    }

    // 2. main.js 尾插加载行(无锚点依赖)
    try {
      let t = fs.readFileSync(mainJs, 'utf8');
      if (!t.includes('dsh-web-open-patch-load')) {
        fs.appendFileSync(mainJs, "\n// dsh-web-open-patch-load:自包含补丁加载(尾插,无锚点依赖)\nrequire('./dsh-web-open-patch.js');\n// dsh-web-open-patch-load-end\n", 'utf8');
        repaired.push('loader line');
      }
    } catch (e2) { console.log('[dsh-web-open] 尾插失败 / loader append failed: ' + (e2 && e2.message)); }

    // 3. preload 文件:缺失或内容不同 → 重写
    for (const name of ['webbox-preload.js', 'webbox-page-preload.js']) {
      const src = path.join(ASSETS, name);
      const dst = path.join(appDir, name);
      if (fs.existsSync(src)) {
        const body = fs.readFileSync(src, 'utf8');
        if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== body) {
          fs.writeFileSync(dst, body, 'utf8');
          repaired.push(name);
        }
      }
    }

    if (repaired.length > 0) {
      console.log('[dsh-web-open] 自愈重打完成(DSH 更新后恢复)/ auto-repaired after DSH update: ' + repaired.join(', '));
      console.log('[dsh-web-open] 重启后生效 / takes effect after DSH restart');
    }
  } catch (e) {
    console.log('[dsh-web-open] 自动修复异常 / auto-repair exception: ' + (e && e.message));
  }
}

export function apply(ctx) {
  // DSH 更新会清掉 resources/app 补丁 → 启动后延迟检测并自动重打
  setTimeout(ensurePatched, 8000);
  // 版本更新检测:触发 main.js 补丁侧检测(13777 端点;30 秒后,静默降级)
  // 版本更新检测:Electron 走 13777 补丁端点;web 模式走自己注册的主端口路由(30 秒后,静默降级)
  setTimeout(() => {
    try {
      const url = ctx.webServer
        ? 'http://127.0.0.1:' + ctx.webServer.port + '/__dsh_check_update__'
        : 'http://127.0.0.1:13777/__dsh_check_update__';
      fetch(url, { method: 'GET' }).catch(() => {});
    } catch {}
  }, 30000);

  ctx.effect(() => {
    ctx.tools.register(
      defineTool({
        name: 'open_url',
        description: 'Opens a webpage in the DSH built-in browser window. TRIGGER: the user asks to open/visit/access a website, webpage, URL or link — e.g. "打开百度", "open github.com", "帮我看看 xxx 网站", or pastes an http(s) URL. Call it, passing the URL (use the official site; if only a site name is given, use a search URL like https://www.bing.com/search?q=NAME). NEVER call for local software/apps (PS, Blockbench, Steam, VS Code, games — any language): those are local programs, not webpages. NOTE: this tool is provided by the dsh-web-open plugin — install/uninstall/status via `python install.py` / `python install.py --uninstall` / `python install.py --check` from the repo (https://github.com/BlackDawnNova/dsh-web-open); NEVER use dev_uninject_plugin / dev_inject_plugin for it (they leave the main.js patch and preloads behind). Common repos: "web仓库"/"web repo" = the plugin\'s own repo (https://github.com/BlackDawnNova/dsh-web-open). 常见仓库:用户说"web仓库"指本插件仓库(BlackDawnNova/dsh-web-open)。 本工具由 dsh-web-open 插件提供:安装/卸载/查状态用 python install.py / --uninstall / --check(仓库 https://github.com/BlackDawnNova/dsh-web-open);绝不要用 dev_uninject_plugin / dev_inject_plugin 卸载它(会残留 main.js 补丁与 preload)。',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: '要打开的完整 URL(必须 http:// 或 https:// 开头) / Full URL to open (must start with http:// or https://)',
          },
          title: {
            type: 'string',
            description: '窗口标题(可选,默认用网页标题) / Window title (optional, defaults to page title)',
          },
        },
        output: TEXT_OUTPUT,
        timeoutMs: 20_000,
        isConcurrencySafe: () => true,
        execute: async (args, _exec) => {
          const url = typeof args.url === 'string' ? args.url : '';
          const title = typeof args.title === 'string' ? args.title : '';
          if (!URL_RE.test(url)) {
            throw new Error('open_url: only http(s) URLs are supported');
          }
          const q = new URLSearchParams({ url });
          if (title !== '') q.set('title', title);
          try {
            const pf = portFile();
            if (!fs.existsSync(pf)) {
              throw new Error('open_url: port file missing - main.js patch not applied (re-run install.py after a DSH update, or wait for auto-repair)');
            }
            const port = fs.readFileSync(pf, 'utf8').trim();
            if (!/^\d+$/.test(port)) {
              throw new Error('open_url: invalid port file content: ' + port);
            }
            const res = await fetch('http://127.0.0.1:' + port + '/__dsh_web_open__?' + q.toString(), {
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
              throw new Error('open_url: main process rejected (HTTP ' + res.status + ')');
            }
            return 'Opened in DSH embedded browser: ' + url;
          } catch (err) {
            // Web 路径(新架构):无 Electron/13777 → 同一主端口 webServer 路由
            if (!ctx.webServer) throw err;
            const wres = await fetch('http://127.0.0.1:' + ctx.webServer.port + '/__dsh_web_open__?' + q.toString(), {
              signal: AbortSignal.timeout(10_000),
            });
            const wj = await wres.json().catch(() => null);
            if (!wres.ok || !wj || !wj.ok) throw err;
            return wj.mode === 'system'
              ? 'Opened in system default browser: ' + url
              : 'Opened in DSH embedded browser window: ' + url;
          }
        },
      })
    );
    ctx.tools.register(
      defineTool({
        name: 'read_page',
        description: 'Reads the text content of a webpage (title + body text) and returns it to you. 读取网页正文(标题+正文文本)返回给你——用于总结/翻译/问答。',
        parameters: {
          url: { type: 'string', required: true, description: '要读取的完整 URL / Full URL to read' },
        },
        output: TEXT_OUTPUT,
        timeoutMs: 30_000,
        isConcurrencySafe: () => true,
        execute: async (args) => {
          const url = typeof args.url === 'string' ? args.url : '';
          if (!URL_RE.test(url)) throw new Error('read_page: only http(s) URLs are supported');
          try {
            const pf = portFile();
            if (!fs.existsSync(pf)) throw new Error('read_page: port file missing - main.js patch not applied');
            const port = fs.readFileSync(pf, 'utf8').trim();
            const res = await fetch('http://127.0.0.1:' + port + '/__dsh_read_page__?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(25_000) });
            const r = await res.json();
            if (!r || !r.ok) throw new Error('read_page: ' + ((r && r.error) || 'failed'));
            return '# ' + (r.title || url) + '\n\n' + (r.text || '(empty page)');
          } catch (err) {
            // Web 路径(新架构):同一主端口 webServer 路由
            if (!ctx.webServer) throw err;
            const wres = await fetch('http://127.0.0.1:' + ctx.webServer.port + '/__dsh_read_page__?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(25_000) });
            const r = await wres.json().catch(() => null);
            if (!wres.ok || !r || !r.ok) throw new Error('read_page: ' + ((r && r.error) || ('HTTP ' + wres.status)));
            return '# ' + (r.title || url) + '\n\n' + (r.text || '(empty page)');
          }
        },
      })
    );
  }, 'dsh-web-open.tool');

  // web 模式(新 DSH Web 架构):同一主端口注册路由,替代 13777 补丁服务
  if (ctx.webServer) {
    ctx.effect(() => {
      const disposers = [];
      const addRoute = (path, handler) => {
        try {
          disposers.push(ctx.webServer.register({ kind: 'exact', path, handler }));
        } catch (e) {
          ctx.logger.warn('[dsh-web-open] webServer 路由注册失败 / route failed: ' + path + ' - ' + ((e && e.message) || e));
        }
      };
      addRoute('/__dsh_web_open__', async (req, res) => {
        try {
          if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); return; }
          if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          const target = cleanTarget(u.searchParams.get('url') || '');
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          const title = u.searchParams.get('title') || '';
          if (sseClients.size > 0) {
            notifyGui({ type: 'page', url: target, title });
            sendJson(res, 200, { ok: true, mode: 'web' });
          } else {
            openSystemBrowser(target);
            sendJson(res, 200, { ok: true, mode: 'system' });
          }
        } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      addRoute('/__dsh_web_open__/download', async (req, res) => {
        try {
          if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); return; }
          if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          const target = cleanTarget(u.searchParams.get('url') || '');
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          if (sseClients.size > 0) {
            notifyGui({ type: 'download', url: target, title: u.searchParams.get('title') || '' });
            sendJson(res, 200, { ok: true, mode: 'web' });
          } else {
            openSystemBrowser(target);
            sendJson(res, 200, { ok: true, mode: 'system' });
          }
        } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      addRoute('/__dsh_web_open__/proxy', async (req, res) => {
        // try/catch 是两个独立块作用域:catch 分支要用的变量必须在函数级声明
        let target = '';
        try {
          if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); return; }
          if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          target = cleanTarget(u.searchParams.get('url') || '');
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          const fres = await fetch(target, {
            redirect: 'follow',
            signal: AbortSignal.timeout(25_000),
            headers: {
              'user-agent': PROXY_BROWSER_UA,
              'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
          });
          const finalUrl = fres.url || target;
          const ct = String(fres.headers.get('content-type') || '').toLowerCase();
          if (/text\/html|application\/xhtml|text\/plain/.test(ct)) {
            // 上游 404/403 等也照样展示(页面本身常带 content-type),状态码固定 200 让 iframe 正常渲染
            const html = await fres.text();
            const out = rewriteHtmlForProxy(html, finalUrl, 'http://127.0.0.1:' + ctx.webServer.port);
            res.writeHead(200, {
              'content-type': ct.includes('text/plain') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'x-dsh-proxied-url': finalUrl,
              'access-control-allow-origin': '*',
            });
            res.end(out);
          } else if (fres.ok) {
            // 非 HTML(下载类):引导页,由客户端右上角按钮接管系统浏览器
            const notice = nonHtmlNotice(finalUrl, fres.headers.get('content-type') || ct);
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'x-dsh-proxied-url': finalUrl,
            });
            res.end(notice);
          } else {
            // 非 HTML 且上游报错 → 网络错误页(替代白屏/裸 JSON)
            const page = proxyErrorPage(finalUrl, 'upstream HTTP ' + fres.status, zhLang(req), 'http://127.0.0.1:' + ctx.webServer.port);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            res.end(page);
          }
        } catch (e) {
          // 网络级失败(DNS/连接/超时/重置)→ 错误页;iframe 显示而非 JSON
          // undici 把真实原因放在 e.cause(如 getaddrinfo ENOTFOUND),拼进来供错误码归类
          const raw = String((e && e.message) || e) + ' ' + String(((e && e.cause && (e.cause.message || e.cause)) || ''));
          const page = proxyErrorPage(target, raw, zhLang(req), 'http://127.0.0.1:' + ctx.webServer.port);
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(page);
        }
      });
      // 下载流代理:客户端下载面板用(进度/暂停/续传都建立在它之上)。
      // 透传 Range 实现断点续传;上游 body 流式 pipe,不占内存;客户端断开即中止上游。
      // 支持 HEAD:客户端保存确认框先用它预检文件名/大小。
      addRoute('/__dsh_web_open__/fetch', async (req, res) => {
        try {
          if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); return; }
          if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
          const isHead = req.method === 'HEAD';
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          const target = cleanTarget(u.searchParams.get('url') || '');
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          const ctrl = new AbortController();
          const onClose = () => { try { ctrl.abort(); } catch {} };
          req.on('close', onClose);
          const fh = {
            'user-agent': PROXY_BROWSER_UA,
            'accept': '*/*',
          };
          const range = u.searchParams.get('range');
          if (range && /^bytes=\d+-/.test(range)) fh['range'] = range; // 续传/重试:透传断点
          const fres = await fetch(target, {
            method: isHead ? 'HEAD' : 'GET',
            redirect: 'follow',
            signal: isHead ? AbortSignal.timeout(15_000) : ctrl.signal,
            headers: fh,
          });
          if (!fres.ok) {
            sendJson(res, 502, { ok: false, error: 'upstream HTTP ' + (fres.status || 0) });
            return;
          }
          const out = {
            'access-control-allow-origin': '*',
            'cache-control': 'no-store',
            'x-dsh-proxied-url': fres.url || target,
          };
          for (const k of ['content-type', 'content-length', 'content-disposition', 'content-range', 'accept-ranges']) {
            const v = fres.headers.get(k);
            if (v) out[k] = String(v).replace(/[\r\n]/g, '');
          }
          if (isHead) {
            res.writeHead(200, out);
            res.end();
            return;
          }
          if (!fres.body) {
            sendJson(res, 502, { ok: false, error: 'upstream has no body' });
            return;
          }
          for (const k of ['content-type', 'content-length', 'content-disposition', 'content-range', 'accept-ranges']) {
            const v = fres.headers.get(k);
            if (v) out[k] = String(v).replace(/[\r\n]/g, '');
          }
          res.writeHead(200, out);
          const readable = Readable.fromWeb(fres.body);
          readable.on('error', () => { try { res.destroy(); } catch {} });
          res.on('close', () => { if (!res.writableEnded) { try { readable.destroy(); } catch {} } });
          readable.pipe(res);
        } catch (e) {
          if (res.headersSent) { try { res.destroy(); } catch {} return; }
          const msg = String((e && e.message) || e);
          if (/abort/i.test(msg)) { try { res.destroy(); } catch {} return; }
          sendJson(res, 502, { ok: false, error: msg });
        }
      });
      // 在系统默认浏览器打开:webview/弹窗拦截环境里 window.open 不可靠,
      // 改由内核直接调系统浏览器(与 openSystemBrowser 同机制,等同旧版 shell.openExternal)
      addRoute('/__dsh_web_open__/external', async (req, res) => {
        try {
          if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); res.end(); return; }
          if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          const target = cleanTarget(u.searchParams.get('url') || '');
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          openSystemBrowser(target);
          sendJson(res, 200, { ok: true, opened: target });
        } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      // 旧版(Electron 时代)数据只读迁移:dsh-web-open-history/bookmarks/tabs.json,供客户端一键导入
      addRoute('/__dsh_web_open__/legacy', async (_req, res) => {
        try {
          const ud = path.join(os.homedir(), 'AppData', 'Roaming', 'DSH Desktop');
          const out = { history: [], bookmarks: [], tabs: [] };
          for (const [k, f] of [
            ['history', 'dsh-web-open-history.json'],
            ['bookmarks', 'dsh-web-open-bookmarks.json'],
            ['tabs', 'dsh-web-open-tabs.json'],
          ]) {
            try {
              const raw = fs.readFileSync(path.join(ud, f), 'utf8');
              const j = JSON.parse(raw);
              if (Array.isArray(j)) out[k] = j;
            } catch {}
          }
          sendJson(res, 200, { ok: true, data: out });
        } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      addRoute('/__dsh_web_open__/events', (req, res) => {
        try { handleSseEvents(req, res); } catch (e) { try { res.destroy(); } catch {} }
      });
      addRoute('/__dsh_read_page__', async (req, res) => {
        try {
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          const target = u.searchParams.get('url') || '';
          if (!URL_RE.test(target)) { sendJson(res, 400, { ok: false, error: 'bad url' }); return; }
          sendJson(res, 200, await readPageTextWeb(target));
        } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      addRoute('/__dsh_check_update__', async (_req, res) => {
        try { sendJson(res, 200, await checkUpdateWeb()); } catch (e) { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }); }
      });
      return () => {
        for (const d of disposers) { try { d(); } catch {} }
        sseClients.clear();
      };
    }, 'dsh-web-open.web');
  }

  // 通用工具可达性(2026-08-16):内置 agent preset(router-standard 等)首轮
  // core 过滤不含 open_url,这里在 assemble 后处理强制加回 —— 所有 agent
  // (内置 + 自定义)第一轮就能用 open_url("打开百度" 第一句即响应)。
  ctx.effect(() => ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    try {
      const tools = assembled && Array.isArray(assembled.tools) ? assembled.tools : null
      if (tools && !tools.some((t) => t && (t.name === 'open_url' || t.name === 'read_page'))) {
        const schemas = ctx.tools.schemas(context && context.agent)
        for (const _tn of ['open_url', 'read_page']) {
          const _ts = schemas.find((s) => s.name === _tn)
          if (_ts && !assembled.tools.some((t) => t && t.name === _tn)) assembled.tools = [...assembled.tools, _ts]
        }
      }
    } catch { /* 兜底失败不阻塞会话 */ }
    try {
      // 插件运维知识注入:让所有 Agent 天生知道安装/卸载/状态查询走 install.py(2026-08-16 用户:模糊指令测试后确认必要)
      const note = '【本机插件 dsh-web-open】DSH 内嵌浏览器(open_url 工具)。仓库:https://github.com/BlackDawnNova/dsh-web-open。用户让安装/卸载/更新该插件或"内置浏览器"时:git clone 仓库后 python install.py(安装/恢复,自动检测 DSH 目录)/ python install.py --uninstall(彻底卸载,还原 main.js 补丁+删 preload+自动优雅退出 DSH)/ python install.py --check(查状态)。**一律用脚本,不要手动改 main.js;卸载本插件(dsh-web-open)绝不要用 dev_uninject_plugin / dev_inject_plugin 等注入工具(它们只卸 loader 层,不会还原 main.js 补丁和 preload,会残留)——其他插件按其自身安装方式正常卸载,不受此限制**。装完需要重启时:**先询问用户是否重启**,用户同意才执行 python install.py --restart(会弹授权,10 秒倒计时;拒绝则不执行并回复"请手动重启 DSH");补丁加载后重启用 curl http://127.0.0.1:13777/__dsh_restart__,不要创建脚本/计划任务/杀进程(会被杀软拦截);**严禁强杀 DSH(taskkill /F、任务管理器结束进程、kill——强杀会写坏会话文件,历史对话打不开);重启/退出必须走优雅通道(curl 端点或托盘右键)**。⚠️ 只操作 dsh-web-open 相关文件;严禁删除/修改其他任何插件(如 dsh-vision-dual、maid-atelier、dsh-super-injector、内置插件)与无关文件/目录(尤其开发工作区的源码目录与 git 仓库,非安装残留,不要"清理")。/ [Plugin dsh-web-open] DSH embedded browser (open_url tool). Repo: https://github.com/BlackDawnNova/dsh-web-open. When asked to install/uninstall/update it: git clone then python install.py (install/restore, auto-detect DSH dir) / python install.py --uninstall (full uninstall: restores main.js, removes preloads, quits DSH gracefully) / python install.py --check (status). **Always use the scripts, never hand-edit main.js; for uninstalling THIS plugin NEVER use dev_uninject_plugin / dev_inject_plugin injector tools (they only remove the loader layer, leaving the main.js patch and preloads behind) — other plugins uninstall normally via their own mechanisms, this restriction applies only to dsh-web-open**. When a restart is needed after install: **ASK the user first**; only with their consent run python install.py --restart (triggers an authorization prompt with 10s countdown; if declined, do not restart and reply "please restart DSH manually"). After the patch is loaded, restart via curl http://127.0.0.1:13777/__dsh_restart__ — never create scripts/scheduled tasks/kill processes (antivirus blocks them). ⚠️ Only touch dsh-web-open files; NEVER delete/modify other plugins (dsh-vision-dual, maid-atelier, dsh-super-injector, built-ins) or unrelated files/dirs (especially dev-workspace source dirs and git repos — not install leftovers, never "clean" them).'
      if (Array.isArray(assembled.prompt)) {
        if (!assembled.prompt.some((p) => typeof p === 'string' && p.includes('dsh-web-open')))
          assembled.prompt = [...assembled.prompt, note]
      } else if (typeof assembled.prompt === 'string') {
        if (!assembled.prompt.includes('dsh-web-open')) assembled.prompt += '\n' + note
      }
    } catch { /* 注入失败不阻塞会话 */ }
    return assembled
  }), 'dsh-web-open.assemble')
}
