// dsh-web-open 补丁:设置与地址栏解析(搜索引擎切换)
const WEBBOX_SETTINGS_FILE = path.join(userDataDir, 'webbox-settings.json');
const WEBBOX_ENGINES = {
  bing: 'https://www.bing.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  google: 'https://www.google.com/search?q=',
  sogou: 'https://www.sogou.com/web?query=',
};
function readWebboxSettings() {
  try { return JSON.parse(fs.readFileSync(WEBBOX_SETTINGS_FILE, 'utf8')); }
  catch { return { searchEngine: 'bing' }; }
}
function writeWebboxSettings(patch) {
  try { fs.writeFileSync(WEBBOX_SETTINGS_FILE, JSON.stringify({ ...readWebboxSettings(), ...patch }, null, 2), 'utf8'); } catch { /* ignore */ }
}
// 地址栏输入:URL 直接导航,否则走默认搜索引擎
function webboxResolveInput(input) {
  const v = String(input || '').trim();
  if (v === '') return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.indexOf('.') >= 0 && !/\s/.test(v)) return 'https://' + v;
  const engine = WEBBOX_ENGINES[readWebboxSettings().searchEngine] || WEBBOX_ENGINES.bing;
  return engine + encodeURIComponent(v);
}
// dsh-web-open 补丁结束
// dsh-web-open 补丁:i18n(按系统语言中英切换)
let WEBBOX_LANG = 'en';
try {
  app.whenReady().then(() => {
    try {
      const _l = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || app.getLocale() || '';
      WEBBOX_LANG = String(_l).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) {}
  });
} catch (e) {}
const WEBBOX_T = {
  zh: {
    newTab: '新建标签', back: '后退', fwd: '前进', reload: '刷新/停止', settings: '设置', downloads: '下载', external: '在系统浏览器打开',
    urlPlaceholder: '输入网址, 回车打开',
    settingsTitle: '浏览器设置', browse: '浏览…', chooseDir: '选择保存文件夹', langLabel: '界面语言', langAuto: '跟随系统', langHint: '切换后立即生效', applyHint: '保存后立即生效,无需重启', engineLabel: '默认搜索引擎(地址栏搜索用)', saveSettings: '保存设置', saved: '已保存', downloadDirLabel: '下载目录(留空=系统 Downloads)', dingLabel: '下载完成提示音', dingB: '柔和叮咚', dingA: '清亮双音', closeSettings: '关闭设置',
    dlTitle: '下载', dlRefresh: '刷新', dlClose: '关闭', dlNow: '下载', dlToSettings: '下载到设置目录', cancel: '取消', dlAskTitle: '保存文件', dlAskDetail: '保存位置: ', dlToDefault: '下载到默认目录', dlHere: '下载到这里', dlPathPh: '输入路径, 回车跳转', dlQuick: '快速访问', dlComputers: '此电脑', dlClear: '清空已完成', dlEmpty: '暂无下载记录', dlOpenDir: '打开所在文件夹', st_downloading: '下载中', st_completed: '完成', st_interrupted: '失败', st_cancelled: '已取消', dlDelete: '删除文件', dlPause: '暂停', dlResume: '继续', dlCancel: '取消',
    st_downloading: '下载中', st_completed: '完成', st_interrupted: '失败', st_cancelled: '已取消',
    openDone: '已在 DSH 内嵌窗口打开: ', dlDoneTitle: '下载完成', dlDoneBody: '已保存到 ', saveFileTitle: '保存文件',
    errTitle: '无法访问此网站', errDns: '域名无法解析', errConn: '无法连接到服务器', errTimeout: '连接超时', errReset: '连接被重置', errNet: '网络错误', errLoad: '加载失败',
    qDesktop: '桌面', qDownloads: '下载', qDocs: '文档', qPics: '图片', qMusic: '音乐', qVideos: '视频',
    errTitle: '无法访问此网站', errDns: '域名无法解析', errConn: '无法连接到服务器', errTimeout: '连接超时', errReset: '连接被重置', errNet: '网络错误', errLoad: '加载失败',
    qDesktop: '桌面', qDownloads: '下载', qDocs: '文档', qPics: '图片', qMusic: '音乐', qVideos: '视频',
  },
  en: {
    newTab: 'New tab', back: 'Back', fwd: 'Forward', reload: 'Reload/Stop', settings: 'Settings', downloads: 'Downloads', external: 'Open in system browser',
    urlPlaceholder: 'Enter URL, press Enter',
    settingsTitle: 'Browser Settings', browse: 'Browse…', chooseDir: 'Choose save folder', langLabel: 'Language', langAuto: 'Follow system', langHint: 'Applies immediately', applyHint: 'Applies immediately, no restart needed', engineLabel: 'Default search engine (address bar)', saveSettings: 'Save Settings', saved: 'Saved', downloadDirLabel: 'Download folder (empty = system Downloads)', dingLabel: 'Download chime', dingB: 'Soft ding-dong', dingA: 'Bright chime', closeSettings: 'Close Settings',
    dlTitle: 'Downloads', dlRefresh: 'Refresh', dlClose: 'Close', dlNow: 'Download', dlToSettings: 'Save to settings dir', cancel: 'Cancel', dlAskTitle: 'Save file', dlAskDetail: 'Save to: ', dlToDefault: 'Save to default dir', dlHere: 'Download here', dlPathPh: 'Type a path, press Enter', dlQuick: 'Quick access', dlComputers: 'This PC', dlClear: 'Clear completed', dlEmpty: 'No downloads yet', dlOpenDir: 'Open folder', st_downloading: 'Downloading', st_completed: 'Completed', st_interrupted: 'Failed', st_cancelled: 'Cancelled', dlDelete: 'Delete file', dlPause: 'Pause', dlResume: 'Resume', dlCancel: 'Cancel',
    openDone: 'Opened in DSH embedded browser: ', dlDoneTitle: 'Download complete', dlDoneBody: ' saved to ', saveFileTitle: 'Save File',
    errTitle: "This site can't be reached", errDns: 'DNS resolution failed', errConn: 'Cannot reach the server', errTimeout: 'Connection timed out', errReset: 'Connection was reset', errNet: 'Network error', errLoad: 'Load failed',
    qDesktop: 'Desktop', qDownloads: 'Downloads', qDocs: 'Documents', qPics: 'Pictures', qMusic: 'Music', qVideos: 'Videos',
    errTitle: "This site can't be reached", errDns: 'DNS resolution failed', errConn: 'Cannot reach the server', errTimeout: 'Connection timed out', errReset: 'Connection was reset', errNet: 'Network error', errLoad: 'Load failed',
    qDesktop: 'Desktop', qDownloads: 'Downloads', qDocs: 'Documents', qPics: 'Pictures', qMusic: 'Music', qVideos: 'Videos',
    errTitle: "This site can't be reached", errDns: 'DNS resolution failed', errConn: 'Cannot reach the server', errTimeout: 'Connection timed out', errReset: 'Connection was reset', errNet: 'Network error', errLoad: 'Load failed',
    qDesktop: 'Desktop', qDownloads: 'Downloads', qDocs: 'Documents', qPics: 'Pictures', qMusic: 'Music', qVideos: 'Videos',
  },
};
const T = (k) => {
  let lang = WEBBOX_LANG;
  try { const st = readWebboxSettings(); if (st && st.lang && st.lang !== 'auto') lang = st.lang; } catch {}
  return (WEBBOX_T[lang] && WEBBOX_T[lang][k]) || (WEBBOX_T.en && WEBBOX_T.en[k]) || k;
};
const langNow = () => {
  let lang = WEBBOX_LANG;
  try { const st = readWebboxSettings(); if (st && st.lang && st.lang !== 'auto') lang = st.lang; } catch {}
  return WEBBOX_T[lang] ? lang : 'en';
};
// dsh-web-open 补丁:固定端口命令服务(client 端链接点击直接开内嵌窗口)
if (!global.__webboxFixedServer) {
  try {
    const httpMod = require('node:http');
    global.__webboxFixedServer = httpMod.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      let u = null;
      try { u = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); res.end(); return; }
      if (u.pathname === '/__dsh_web_open__' || u.pathname === '/__dsh_web_open__/download') {
        const target = u.searchParams.get('url') || '';
        if (/^https?:\/\//i.test(target)) {
          createWebWindow(target, u.searchParams.get('title') || '');
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('ok');
          return;
        }
        res.writeHead(400);
        res.end('bad url');
        return;
      }
      if (u.pathname === '/__dsh_uninstalled__') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      setTimeout(() => {
        // 卸载瞬间弹原生对话框(补丁还在内存,100% 可见;用户点"好"才重启——权限在用户手里)
        try {
          const { dialog, app } = require('electron');
          const doRelaunch = () => setTimeout(() => { try { app.relaunch(); app.quit(); } catch (e) { log('webbox', 'relaunch err: ' + ((e && e.message) || e)); } }, 500);
          dialog.showMessageBox({
            type: 'info',
            title: 'dsh-web-open 已卸载 / uninstalled',
            message: 'dsh-web-open 插件已卸载完成,DSH 即将自动重启。\n如需重新安装:https://github.com/BlackDawnNova/dsh-web-open',
            buttons: ['好 / OK'],
          }).then(() => doRelaunch()).catch(() => doRelaunch());
          log('webbox', 'uninstall 弹窗已显示 / uninstall dialog shown');
        } catch (e) {
          log('webbox', 'uninstall dialog err(直接重启)/ dialog failed, restarting: ' + ((e && e.message) || e));
          setTimeout(() => { try { require('electron').app.relaunch(); require('electron').app.quit(); } catch (e2) { log('webbox', 'relaunch err: ' + ((e2 && e2.message) || e2)); } }, 800);
        }
      }, 300);
      return;
    }
      if (u.pathname === '/__dsh_check_update__') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('ok');
        checkForUpdate();
        return;
      }
if (u.pathname === '/__dsh_quit__') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('ok');
        setTimeout(() => { try { require('electron').app.quit(); } catch (e) { log('webbox', 'quit err: ' + ((e && e.message) || e)); } }, 100);
        return;
      }
      if (u.pathname === '/__dsh_restart__') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('ok');
        setTimeout(() => { try { const a = require('electron').app; a.relaunch(); a.quit(); } catch (e) { log('webbox', 'restart err: ' + ((e && e.message) || e)); } }, 100);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    global.__webboxFixedServer.on('error', (e) => {
      // EADDRINUSE 等异步 listen 错误:try/catch 抓不到,必须走 error 事件(否则 uncaught 弹框)
      log('webbox', '固定端口命令服务错误(13777 被占用?已有实例在运行?) / fixed-port service error (13777 in use? another instance?): ' + ((e && e.message) || e));
    });
    global.__webboxFixedServer.listen(13777, '127.0.0.1');
    try { fs.writeFileSync(path.join(userDataDir, 'dsh-web-open.port'), '13777', 'utf8'); } catch (e) {}
    log('webbox', '固定端口命令服务已启动 / fixed-port service started: http://127.0.0.1:13777');
  } catch (e) {
    log('webbox', '固定端口命令服务启动失败(13777 被占用?) / fixed-port service failed to start (13777 in use?): ' + ((e && e.message) || e));
  }
}


// ── 版本更新检测 + 一键更新(2026-08-16,1.0 收尾;插件启动时调 /__dsh_check_update__ 触发)──
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
  return 0;
}
async function doUpdate(version) {
  const cp = require('child_process');
  const tmp = path.join(os.tmpdir(), 'dsh-web-open-update-' + Date.now());
  try {
    fs.mkdirSync(tmp, { recursive: true });
    const { net } = require('electron');
    const res = await net.fetch('https://codeload.github.com/BlackDawnNova/dsh-web-open/tar.gz/refs/tags/v' + version, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('download failed: ' + res.status);
    const tarball = path.join(tmp, 'upd.tar.gz').replace(/\\/g, '/');
    fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
    log('webbox', 'update downloaded: ' + fs.statSync(tarball).size + ' bytes (res=' + res.status + ')');
    const tmpS = String(tmp).replace(/\\/g, '/');
    // 显式用系统 bsdtar(System32,避免 PATH 里 git-bash GNU tar 把 C: 当远程主机)
    const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    cp.execFileSync(TAR, ['-xzf', tarball, '-C', tmpS], { stdio: 'ignore', timeout: 60000 });
    const dir = fs.readdirSync(tmp).find((d) => { try { return fs.statSync(path.join(tmp, d)).isDirectory() && d.startsWith('dsh-web-open'); } catch { return false; } });
    if (!dir) throw new Error('no extracted dir');
    cp.execFileSync('python', ['install.py', '--force'], { cwd: path.join(tmp, dir), stdio: 'ignore', timeout: 120000 });
    const { dialog, app } = require('electron');
    const r2 = await dialog.showMessageBox({ type: 'info', title: 'dsh-web-open 更新完成 / Update done', message: '已更新到 v' + version + ',需要重启生效 / Updated to v' + version + ', restart to apply', buttons: ['重启 / Restart', '稍后 / Later'], cancelId: 1 });
    if (r2.response === 0) setTimeout(() => { try { app.relaunch(); app.quit(); } catch {} }, 500);
  } catch (e) {
    log('webbox', 'update FAILED: ' + ((e && e.message) || e) + (e && e.stderr ? ' | stderr: ' + e.stderr.toString() : ''));
    try { const { dialog } = require('electron'); await dialog.showMessageBox({ type: 'error', title: 'dsh-web-open 更新失败 / Update failed', message: '更新失败:' + ((e && e.message) || e) + '\n可手动更新:git pull + python install.py' }); } catch {}
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
async function checkForUpdate() {
  try {
    const { net, dialog, shell } = require('electron');
    const res = await net.fetch('https://api.github.com/repos/BlackDawnNova/dsh-web-open/releases/latest', { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'dsh-web-open', 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) return; // 无 release 或网络不可达:静默
    const rel = await res.json();
    const remote = String(rel.tag_name || '').replace(/^v/i, '');
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(path.join(userDataDir, 'webbox-settings.json'), 'utf8')); } catch {}
    const local = settings.installedVersion || '';
    if (!remote || !local || cmpVer(remote, local) <= 0) return;
    const ign = settings.ignoreVersion || '';
    if (ign && cmpVer(remote, ign) <= 0) return;
    const r = await dialog.showMessageBox({
      type: 'info',
      title: 'dsh-web-open 有新版本 / New version available',
      message: '发现新版本 v' + remote + '(当前 v' + local + ')',
      detail: String(rel.body || '').trim(),
      buttons: ['一键更新 / Update now', '忽略此版本 / Ignore', '稍后 / Later'],
      cancelId: 2,
    });
    if (r.response === 0) await doUpdate(remote);
    else if (r.response === 1) { settings.ignoreVersion = remote; try { fs.writeFileSync(path.join(userDataDir, 'webbox-settings.json'), JSON.stringify(settings, null, 2), 'utf8'); } catch {} }
    log('webbox', 'update check: local=' + local + ' remote=' + remote + ' choice=' + r.response);
  } catch (e) { log('webbox', 'update check err: ' + ((e && e.message) || e)); }
}

// ── 防御:检测并修复会话双份 router-guide(2026-08-16)──
// 根因:router-bootstrap v22 把 guide 消息双份投递(inbox+messages,同 id)
// → 恢复会话时同一 context 两个 start → "more than one start Match"
// 修复:重复副本 id 追加 -dup(不删事件不动 seq);新会话由 router v23 根治
let __webboxZstddec = null;
function webboxZstddec() {
  if (!__webboxZstddec) {
    __webboxZstddec = Promise.resolve().then(async () => {
      const { ZSTDDecoder } = require('zstddec');
      const d = new ZSTDDecoder();
      await d.init();
      return d;
    });
  }
  return __webboxZstddec;
}
function fixDupGuides() {
  try {
    const sessionsDir = path.join(os.homedir(), '.dsh', 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'session.jsonl.zstd') files.push(p);
      }
    })(sessionsDir);
    if (files.length === 0) return;
    webboxZstddec().then(async (decoder) => {
      let fixedSessions = 0, fixedMsgs = 0;
      for (const file of files) {
        try {
          const compressed = fs.readFileSync(file);
          const text = Buffer.from(decoder.decode(compressed)).toString('utf8');
          const lines = text.split('\n');
          const seen = new Set();
          let changed = false;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            let v; try { v = JSON.parse(line); } catch { continue; }
            if (v.type !== 'user/message') continue;
            const id = v.data && v.data.id;
            if (typeof id === 'string' && id.startsWith('router-guide-')) {
              if (seen.has(id)) { v.data.id = id + '-dup'; lines[i] = JSON.stringify(v); changed = true; fixedMsgs++; }
              else seen.add(id);
            }
          }
          if (changed) {
            const out = lines.join('\n');
            const raw = Buffer.from(out, 'utf8');
            const idx = raw.indexOf(0x0a);
            const frames = [global.__webboxZstdCompressSync(raw.subarray(0, idx + 1))];
            const rest = raw.subarray(idx + 1);
            for (let k = 0; k < rest.length; k += 65536) frames.push(global.__webboxZstdCompressSync(rest.subarray(k, k + 65536)));
            fs.writeFileSync(file, Buffer.concat(frames));
            fixedSessions++;
          }
        } catch { /* 文件被占用/损坏:跳过,下次启动再试 */ }
      }
      if (fixedSessions > 0) log('webbox', '会话双份guide修复 / dup-guide fixed: ' + fixedSessions + ' 会话 ' + fixedMsgs + ' 条');
    }).catch(() => {});
  } catch { /* 静默 */ }
}
// 启动后延迟执行(避开启动争抢);需要 zstdCompressSync
try { const { zstdCompressSync } = require('node:zlib'); global.__webboxZstdCompressSync = zstdCompressSync; } catch {}
// setTimeout(fixDupGuides, 15000); // 已禁用(双份 guide 已 v23 治本;启动同步扫描 59 会话会阻塞主进程 ~4s)
