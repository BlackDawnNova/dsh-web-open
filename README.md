# dsh-web-open — DSH Desktop 内嵌浏览器

给 DSH Desktop(DeepSeek Harness 桌面版)加一个内嵌浏览器。模型调用 `open_url` 工具、点击会话里的外部链接、或直接输入一条 URL,都会在 DSH 内弹出浏览器窗口,不用离开 DSH。

An embedded browser for DSH Desktop (DeepSeek Harness desktop client). When the model calls the `open_url` tool, you click an external link in chat, or type a URL directly, a browser window opens right inside DSH.

## 功能

- **多标签窗口**:网站图标 + 标题、拖拽排序、滚轮横滚、双击关闭、宽度自适应;多次 open_url 复用同一窗口开新标签(不弹一堆窗口)
- **快捷键**:Ctrl+L 聚焦地址栏 / Ctrl+T 新标签 / Ctrl+W 关闭 / Ctrl+Shift+T 恢复关闭;可在设置里自定义(支持 Ctrl+Shift/Alt 组合,一键重置默认,重复键自动拒绝)
- **历史 + 收藏**:浏览自动记录历史;★ 收藏当前页;🕘 打开历史/收藏列表(点击打开、✕ 删除、清空);设置/下载等内部页不混入历史与收藏
- **会话恢复**:重启 DSH 后自动恢复上次打开的标签页
- **read_page 工具**:AI 可直接读取网页正文(后台加载,不弹窗),用于总结/翻译/问答——对 AI 说「总结一下 https://…」即可
- **智能地址栏**:输入网址直接打开;非网址自动走搜索引擎(必应/百度/谷歌/搜狗,可在设置里换);URL 含中文注释等多余文字自动截取
- **下载管理**:下载链接弹目录选择器;下载管理器标签页看状态/进度/速度/大小;下载中可暂停/继续/取消(取消自动清理任务与残留文件);断点续传(中断自动恢复);同名自动加 (1)/(2),不静默覆盖;完成有提示音(柔和/清亮可选)
- **DNS 直连 + 通道**:内嵌浏览器对 GitHub 自动解析可用节点并直连(无需代理、无需改 hosts,IP 变动自动测通切换);加载失败自动重试恢复;单文件(raw)下载被截断时自动走 jsDelivr 国内 CDN 通道
- **浏览器级隧道**:检测到本机代理(系统代理/Clash)时,内嵌浏览器自动走代理(仅本机,不影响其他用户;其他用户无代理则自动直连)
- **错误页**:域名解析失败、超时等显示错误提示,不白屏
- **设置页**:默认搜索引擎、下载目录、界面语言(中文/English/跟随系统)、快捷键自定义,即时生效
- **智能缩放**:内容超窗自动适配,`Shift+滚轮` 手动缩放(0.2x–3x)

### Features (English)

- **Multi-tab window**: favicon + title, drag to reorder, horizontal wheel scroll, double-click to close, adaptive width; repeated `open_url` calls reuse the same window and open new tabs
- **Shortcuts**: Ctrl+L focus address bar / Ctrl+T new tab / Ctrl+W close / Ctrl+Shift+T reopen closed; customizable in Settings (Ctrl+Shift/Alt combos, one-click reset, duplicate keys rejected)
- **History & bookmarks**: browsing is recorded automatically; ★ bookmarks the current page; 🕘 opens history/bookmarks lists (click to open, ✕ to delete, clear all); internal pages (settings/downloads) stay out of history and bookmarks
- **Session restore**: tabs from the previous run are restored after a DSH restart
- **read_page tool**: the AI can read a page's text in the background (no popup) for summaries/translation/QA — just say "summarize https://…"
- **Smart address bar**: type a URL to open it; non-URLs go to the configured search engine (Bing/Baidu/Google/Sogou); stray text (e.g. Chinese comments) after a URL is stripped automatically
- **Downloads**: pick a folder per download; manager tab shows status/progress/speed/size; pause/resume/cancel (cancel removes the task and leftover file); auto-resume on interruption; duplicate names get (1)/(2) instead of silent overwrite; optional completion chime
- **DNS direct + channels**: the embedded browser resolves reachable GitHub IPs and connects directly (no proxy, no hosts edits, auto-failover); failed loads retry automatically; raw-file downloads blocked by the GFW fall back to the jsDelivr CDN channel
- **Browser-level tunnel**: when a local proxy (system proxy/Clash) is detected, the embedded browser uses it (local machine only — other users without a proxy automatically fall back to direct connections)
- **Error pages**: DNS failures/timeouts show an error page instead of a blank screen
- **Settings**: default search engine, download folder, UI language (Chinese/English/follow system), custom shortcuts — applied immediately
- **Smart zoom**: content wider than the window adapts automatically; `Shift+wheel` zooms manually (0.2x–3x)

## 安装

需要 Git 和 Python 3.8+。克隆仓库后,在仓库目录执行:

```bash
python install.py                 # 自动检测 DSH 安装目录
python install.py --dir "你的 DSH Desktop 安装目录"   # 手动指定(自动检测不到时)
python install.py --check         # 只查状态
```

装完重启 DSH。第一次重启时(旧进程还没有 `/__dsh_restart__` 端点),先问用户,同意后再跑 `python install.py --restart`(会弹系统授权,10 秒倒计时)。补丁生效后,重启用 `curl http://127.0.0.1:13777/__dsh_restart__`。

别强杀 DSH(taskkill /F、任务管理器结束进程)——会写坏会话文件,历史对话打不开。重启/退出一律走优雅通道(curl 端点或托盘右键)。

Installation needs Git and Python 3.8+. Clone the repo, then run `python install.py` from the repo directory (`--dir` overrides the DSH install dir, `--check` only inspects). Restart DSH afterwards — for the first restart ask the user first, then `python install.py --restart` with their consent (an authorization prompt with a 10s countdown appears). Once the patch is live, restart with `curl http://127.0.0.1:13777/__dsh_restart__`.

Never force-kill DSH (taskkill /F, Task Manager) — it corrupts session files. Always restart/quit gracefully (curl endpoint or tray menu).

## 使用

重启后开新会话(工具列表是会话开始时的快照),然后任选一种方式:

- 对模型说「打开百度」「open github.com」
- 会话里直接贴 http(s) 链接回车
- 点击会话里的外部链接

浏览器窗口里:标签栏 + 新建标签、⚙ 设置、⬇ 下载。

Usage: after restart, start a new chat and either say "open Baidu" / "open github.com", paste a URL and press Enter, or click an external link in chat. The browser window has + (new tab), ⚙ (settings), ⬇ (downloads) on the tab bar.

## 更新

启动时插件会自动检查 GitHub 上的新版本(release 粒度)。发现新版本会弹窗提示,带更新说明和三个按钮:一键更新 / 忽略此版本 / 稍后。

点「一键更新」:自动下载新版本 → 安装 → 再弹窗让你确认重启,点好就重启生效。更新只在你点按钮时进行,不会自动装任何东西。

Updates: on startup the plugin checks GitHub for new releases and shows a dialog with the release notes and three buttons — Update now / Ignore this version / Later. "Update now" downloads and installs the new version, then asks you to confirm the restart. Updates only happen when you click the button; nothing installs automatically.

## 卸载

```bash
python install.py --uninstall
```

一条命令搞定:还原 main.js、删 preload、清插件和注册,卸完 DSH 自动弹窗"已卸载,即将重启",点好就自动重启。别用 DSH 自带的 `dev_uninject_plugin` / `dev_inject_plugin`——它们只卸 loader 层,会残留 main.js 补丁和 preload。

Uninstall with a single command: `python install.py --uninstall` (restores main.js, removes preloads, cleans the plugin and registration; DSH then shows a "uninstalled, restarting now" dialog and restarts on OK). Don't use DSH's `dev_uninject_plugin` / `dev_inject_plugin` — they only remove the loader layer and leave the main.js patch and preloads behind.

## 让 AI 助手来装

把仓库地址发给 DSH 的 AI,说「给我安装一下这个插件」就行——AI 会读 README、clone、跑 install.py。卸载同理,直接说「把 dsh-web-open 插件卸载掉」,AI 会正确走 `--uninstall`,卸载完 DSH 自动优雅退出。

Just send the repo URL to DSH's AI and say "install this plugin for me" — the AI reads the README, clones, and runs install.py. Uninstall works the same way: say "uninstall the dsh-web-open plugin" and the AI runs `--uninstall`; DSH quits gracefully afterwards.

## DSH 更新后

DSH 更新会覆盖 `resources/app`(补丁被冲掉)——插件会在启动时自动检测并重打补丁,无需手动处理。

After a DSH update (which overwrites `resources/app`), the plugin re-patches itself automatically on next launch — nothing to do manually.

## License

MIT
