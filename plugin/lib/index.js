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
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-web-open';
export const inject = ['tools'];

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
  setTimeout(() => { try { fetch('http://127.0.0.1:13777/__dsh_check_update__', { method: 'GET' }).catch(() => {}); } catch {} }, 30000);

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
          const pf = portFile();
          if (!fs.existsSync(pf)) {
            throw new Error('open_url: port file missing - main.js patch not applied (re-run install.py after a DSH update, or wait for auto-repair)');
          }
          const port = fs.readFileSync(pf, 'utf8').trim();
          if (!/^\d+$/.test(port)) {
            throw new Error('open_url: invalid port file content: ' + port);
          }
          const q = new URLSearchParams({ url });
          if (title !== '') q.set('title', title);
          const res = await fetch('http://127.0.0.1:' + port + '/__dsh_web_open__?' + q.toString(), {
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            throw new Error('open_url: main process rejected (HTTP ' + res.status + ')');
          }
          return 'Opened in DSH embedded browser: ' + url;
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
          const pf = portFile();
          if (!fs.existsSync(pf)) throw new Error('read_page: port file missing - main.js patch not applied');
          const port = fs.readFileSync(pf, 'utf8').trim();
          const res = await fetch('http://127.0.0.1:' + port + '/__dsh_read_page__?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(25_000) });
          const r = await res.json();
          if (!r || !r.ok) throw new Error('read_page: ' + ((r && r.error) || 'failed'));
          return '# ' + (r.title || url) + '\n\n' + (r.text || '(empty page)');
        },
      })
    );
  }, 'dsh-web-open.tool');

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
