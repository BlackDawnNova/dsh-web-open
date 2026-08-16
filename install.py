#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dsh-web-open 一键安装脚本(DSH Desktop 内嵌浏览器 + open_url 工具)
用法:
    python install.py                  # 自动检测 DSH 安装目录
    python install.py --dir "D:/DSH Desktop"   # 手动指定
    python install.py --check          # 只检查状态,不改动

原理:
    1. 给 DSH 的 main.js 打补丁(内嵌网页窗口 + 命令端点 + 端口文件)
    2. 写入 2 个 preload(工具栏 / 页面缩放)
    3. 复制插件到 profile 并装配(open_url 工具,模型可调用)
    幂等:已安装时重复运行无副作用;DSH 更新后重跑一次即可恢复。
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent
PATCH_DIR = REPO / "patch"
PLUGIN_DIR = REPO / "plugin"

MAIN_BLOCK_FILE = PATCH_DIR / "webbox_main_block.js"
PRELOAD_TOOLBAR = PATCH_DIR / "webbox-preload.js"
PRELOAD_PAGE = PATCH_DIR / "webbox-page-preload.js"

SDK_DEPS = ["dsh-tools", "schemastery", "dsh-settings", "dsh-invariants"]
PLUGIN_NAME = "dsh-web-open"
PLUGIN_NS = "@dsh-external/dsh-web-open"


def log(msg):
    print("[dsh-web-open] " + msg)


def check_prereqs():
    """前置自检:Python 版本(脚本能跑即 python 存在)+ Git 可用性。缺失给双语明确提示。"""
    if sys.version_info < (3, 8):
        log("!! 需要 Python 3.8+ / Python 3.8+ required")
        sys.exit(1)
    # git 只在 clone 阶段需要,install.py 本身不用它;DSH 受限沙箱下 subprocess 管道会失败导致误报,
    # 因此缺失/不可探测只警告不退出(2026-08-16:DSH 沙箱误报 git not found 教训)
    try:
        subprocess.run(["git", "--version"], capture_output=True, timeout=10, check=True)
    except Exception:
        log("!! 未找到 git:clone 本仓库需要 Git for Windows / git not found: clone needs Git for Windows (installer itself does not require it)")


def find_dsh_dir(cli_dir):
    if cli_dir:
        p = pathlib.Path(cli_dir)
        if (p / "DSH Desktop.exe").exists():
            return p
        log(f"!! 指定目录没有 DSH Desktop.exe: {cli_dir}")
        sys.exit(1)
    # 环境变量
    env = os.environ.get("DSH_DIR")
    if env and (pathlib.Path(env) / "DSH Desktop.exe").exists():
        return pathlib.Path(env)
    # 注册表 UninstallString
    try:
        out = subprocess.run(
            ["reg", "query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall",
             "/s", "/f", "DSH Desktop", "/d"],
            capture_output=True, text=True, timeout=15, errors="replace").stdout
        for line in out.splitlines():
            if "DisplayIcon" in line or "InstallLocation" in line:
                v = line.split("REG_SZ", 1)[-1].strip().strip('"')
                if v and (pathlib.Path(v) / "DSH Desktop.exe").exists():
                    return pathlib.Path(v)
    except Exception:
        pass
    # 常见路径(硬编码仅兜底)+ 动态探测所有盘符(适配不同机器的盘符布局)
    import string as _string
    cands = [r"D:\DSH Desktop", r"C:\Program Files\DSH Desktop", r"C:\Users\Administrator\DSH Desktop"]
    try:
        for _dr in [f"{_c}:\\" for _c in _string.ascii_uppercase]:
            if pathlib.Path(_dr).exists():
                cands.append(_dr + "DSH Desktop")
                cands.append(_dr + "Program Files\\DSH Desktop")
                cands.append(_dr + "Users\\" + (os.getlogin() if hasattr(os, "getlogin") else "Administrator") + "\\DSH Desktop")
    except Exception:
        pass
    for cand in dict.fromkeys(cands):  # 去重保序
        p = pathlib.Path(cand)
        if (p / "DSH Desktop.exe").exists():
            return p
    log("!! 未找到 DSH Desktop 安装目录,请用 --dir 指定 / DSH Desktop install dir not found, use --dir")
    sys.exit(1)


def patch_main_js(dsh_dir):
    """尾插方案(2026-08-16):复制自包含补丁文件 + main.js 末尾追加 require 行,零锚点依赖。
    DSH 更新清掉 resources/app 后,插件自愈(ensurePatched)用同样逻辑自动恢复。"""
    app_dir = dsh_dir / "resources" / "app"
    main_js = app_dir / "main.js"
    if not main_js.exists():
        log(f"!! main.js 不存在: {main_js}")
        return False
    changed = False

    # 1. 复制补丁文件(自包含模块)
    patch_src = PATCH_DIR / "dsh-web-open-patch.js"
    patch_dst = app_dir / "dsh-web-open-patch.js"
    if patch_src.exists():
        if not patch_dst.exists() or patch_dst.read_bytes() != patch_src.read_bytes():
            shutil.copy(patch_src, patch_dst)
            log("补丁文件已复制 / patch file copied: dsh-web-open-patch.js")
            changed = True
    else:
        log("!! 缺少补丁模板 patch/dsh-web-open-patch.js / patch template missing")

    # 2. main.js 尾插加载行(无锚点依赖)
    t = main_js.read_text(encoding="utf-8", errors="replace")
    if "dsh-web-open-patch-load" not in t:
        main_js.write_text(
            t.rstrip("\r\n")
            + "\n// dsh-web-open-patch-load:自包含补丁加载(尾插,无锚点依赖)\nrequire('./dsh-web-open-patch.js');\n// dsh-web-open-patch-load-end\n",
            encoding="utf-8",
        )
        log("main.js 尾插补丁加载行 / loader line appended")
        changed = True

    # 3. preload 文件
    for name in ("webbox-preload.js", "webbox-page-preload.js"):
        src = PATCH_DIR / name
        dst = app_dir / name
        if src.exists() and (not dst.exists() or dst.read_bytes() != src.read_bytes()):
            shutil.copy(src, dst)
            log(f"preload 写入: {name}")
            changed = True

    return changed


def install_plugin(profile_dir):
    target = profile_dir / "node_modules" / "@dsh-external" / PLUGIN_NAME
    # 1. 删除旧目录/junction(链接用 os.rmdir 删链接本身,目录用 rmtree)
    if target.exists() or target.is_symlink():
        try:
            os.rmdir(target)  # junction/symlink:只删链接
        except OSError:
            shutil.rmtree(target, ignore_errors=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(PLUGIN_DIR, target, ignore=shutil.ignore_patterns("node_modules", "__pycache__"))
    log(f"插件已复制: {target}")
    return target


def patch_cordis(profile_dir):
    """注册插件:profile cordis.patch.yml 的 insert 挂载(与 vision-dual 同形态)。
    不要写 dsh.profile.bundles —— 2026-08-16 实测:bundles 注册与 insert 共存会
    duplicate loader entry id,bundles 生成的 entry 曾致 received object;
    正确形态 = 纯 insert + 安装目录副本 + client.js 导出 apply。"""
    patch_file = profile_dir / "cordis.patch.yml"
    block = (
        "- insert:\n"
        "  - id: web-open\n"
        "    name: '@dsh-external/dsh-web-open'\n"
    )
    if patch_file.exists():
        t = patch_file.read_text(encoding="utf-8")
        if "id: web-open" in t:
            log("cordis.patch.yml 已含 web-open insert,跳过 / insert already present, skipping")
            return False
        t = t.rstrip("\r\n") + "\n" + block
    else:
        t = block
    patch_file.write_text(t, encoding="utf-8")
    log("cordis.patch.yml insert 已添加 web-open / insert added")
    return True


def patch_watchdog(dsh_dir):
    """watchdog.js 防级联补丁:taskkill/崩溃后多个 watchdog 残留会级联拉起多个实例。
    DSH 更新会覆盖 watchdog.js,重跑 install.py 恢复。"""
    wd = dsh_dir / "resources" / "app" / "watchdog.js"
    if not wd.exists():
        log("!! watchdog.js 不存在,跳过 / watchdog.js missing, skipping")
        return False
    t = wd.read_text(encoding="utf-8")
    if "already running, another watchdog" in t:
        log("watchdog.js 防级联补丁已存在 / already present")
        return False
    old = """function launchApp() {
  const now = Date.now();
  if (now - lastLaunchAt < GRACE_MS) return;"""
    new = """function launchApp() {
  const now = Date.now();
  // 防级联拉起:已有 DSH 进程在运行(其他 watchdog 拉起的)→ 本 watchdog 退出
  try {
    const out = require('node:child_process').execSync(
      'tasklist /FI "IMAGENAME eq DSH Desktop.exe" /FO CSV /NH',
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    );
    const running = out.trim().split(/\\r?\\n/).filter(Boolean).length > 0;
    if (running) {
      log('watchdog: DSH Desktop.exe already running, another watchdog relaunched — exiting');
      process.exit(0);
    }
  } catch {}
  if (now - lastLaunchAt < GRACE_MS) return;"""
    if old not in t:
        log("!! watchdog.js 锚点失配,补丁未应用 / watchdog.js anchor mismatch, NOT applied")
        return False
    wd.write_text(t.replace(old, new, 1), encoding="utf-8")
    log("watchdog.js 防级联补丁已应用 / applied")
    return True


def uninstall(dsh_dir, profile_dir):
    """彻底卸载:还原 main.js、删 preload/副本/junction、清 profile 注册、删运行时数据。"""
    app_dir = dsh_dir / "resources" / "app"
    main_js = app_dir / "main.js"
    bak = app_dir / "main.js.bak-webbox"
    if bak.exists():
        main_js.write_bytes(bak.read_bytes())
        log("main.js 已还原(补丁移除) / main.js restored (patches removed)")
    elif main_js.exists() and "WEBBOX_TOOLBAR_HTML" in main_js.read_text(encoding="utf-8"):
        log("!! 未找到 main.js.bak-webbox,无法自动还原补丁 / backup missing, cannot restore main.js")
    elif main_js.exists() and "dsh-web-open-patch-load" in main_js.read_text(encoding="utf-8"):
        # 尾插方案无 bak 时:直接移除尾插加载行段
        t2 = main_js.read_text(encoding="utf-8")
        idx = t2.find("// dsh-web-open-patch-load:")
        if idx >= 0:
            main_js.write_text(t2[:idx].rstrip("\r\n") + "\n", encoding="utf-8")
            log("main.js 尾插加载行已移除 / loader line removed")
    patch_file = app_dir / "dsh-web-open-patch.js"
    if patch_file.exists():
        patch_file.unlink()
        log("已删除补丁文件 / removed dsh-web-open-patch.js")
    for f in ("webbox-preload.js", "webbox-page-preload.js"):
        p = app_dir / f
        if p.exists():
            p.unlink()
            log(f"已删除 {f} / removed {f}")
    inst_target = app_dir / "node_modules" / "@dsh-external" / PLUGIN_NAME
    if inst_target.exists() or inst_target.is_symlink():
        try:
            os.rmdir(inst_target)  # junction/真实目录都先试删链接本身
        except OSError:
            shutil.rmtree(inst_target, ignore_errors=True)
        log("已删除安装目录副本 / removed install-dir copy")
    nm_target = profile_dir / "node_modules" / "@dsh-external" / PLUGIN_NAME
    if nm_target.exists() or nm_target.is_symlink():
        try:
            os.rmdir(nm_target)
        except OSError:
            shutil.rmtree(nm_target, ignore_errors=True)
        log("已删除 profile junction / removed profile junction")
    pkg = profile_dir / "package.json"
    if pkg.exists():
        d = json.loads(pkg.read_text(encoding="utf-8"))
        d.get("dependencies", {}).pop(PLUGIN_NS, None)
        b = d.get("dsh", {}).get("profile", {}).get("bundles", [])
        if isinstance(b, list):
            d["dsh"]["profile"]["bundles"] = [x for x in b if "web-open" not in str(x)]
        pkg.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
        log("package.json 已清理(dependencies/bundles) / cleaned")
    patch = profile_dir / "cordis.patch.yml"
    if patch.exists():
        raw = patch.read_bytes()
        t = raw.decode("utf-8")
        crlf = "\r\n" in t
        t = t.replace("\r\n", "\n")
        lines = t.split("\n")
        out = []
        i = 0
        while i < len(lines):
            if lines[i].strip() == "- id: web-open" and i + 1 < len(lines) and "dsh-web-open" in lines[i + 1]:
                i += 2
                continue
            out.append(lines[i])
            i += 1
        res = "\n".join(out)
        while "\n\n\n" in res:
            res = res.replace("\n\n\n", "\n\n")
        if crlf:
            res = res.replace("\n", "\r\n")
        patch.write_bytes(res.encode("utf-8"))
        log("cordis.patch.yml insert 已移除 / insert removed")
    ud = pathlib.Path(os.environ.get("APPDATA", "")) / "DSH Desktop"
    for f in ("webbox-settings.json", "dsh-web-open.port"):
        p = ud / f
        if p.exists():
            p.unlink()
            log(f"已删除运行时数据 {f} / removed {f}")
    log("卸载完成 / Uninstall done")
    # 自动优雅退出 DSH:卸载瞬间内存仍是补丁版(13777 服务还活着),curl 触发完整退出流程,避免强杀写坏会话
    try:
        import urllib.request
        urllib.request.urlopen("http://127.0.0.1:13777/__dsh_uninstalled__", timeout=3)
        log("已触发通知+自动重启 / notification + auto-restart triggered")
    except Exception:
        log("DSH 未在运行(或已退出),无需处理 / DSH not running, nothing to do")


def schedule_restart(dsh_dir):
    """安排一次性优雅重启(装完第一次重启用:旧进程无 /__dsh_restart__ 端点):
    CloseMainWindow 优雅尝试 -> 15s 超时强杀兜底 -> 重新启动。计划任务 1 分钟后触发。
    Runs an ASCII-only PowerShell script (PS 5.1 reads non-BOM files as ANSI)."""
    import time
    exe = dsh_dir / "DSH Desktop.exe"
    tmp = pathlib.Path(os.environ.get("TEMP", "."))
    tag = str(int(time.time()))
    ps1 = tmp / f"dsh_webopen_restart_{tag}.ps1"
    taskname = f"DSH WebOpen Restart {tag}"
    script = (
        "Start-Sleep -Seconds 8\n"  # 给调用方(AI)留出发总结消息的时间 / leave time for the caller to post its summary\n"
        "$exe = '" + str(exe) + "'\n"
        "$procs = Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue\n"
        "foreach ($p in $procs) { if ($p.MainWindowHandle -ne 0) { $null = $p.CloseMainWindow() } }\n"
        "Start-Sleep -Seconds 15\n"
        "$left = Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue\n"
        "if ($left) { $left | Stop-Process -Force }\n"
        "Start-Sleep -Seconds 2\n"
        "Start-Process $exe\n"
    )
    ps1.write_text(script, encoding="ascii")
    start = (time.localtime(time.time() + 10))
    hhmm = time.strftime("%H:%M", start)
    subprocess.run(
        ["schtasks", "/Create", "/TN", taskname, "/TR",
         f'powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "{ps1}"',
         "/SC", "ONCE", "/ST", hhmm, "/F"],
        capture_output=True, timeout=30,
    )
    # 立即触发(脚本内已有 8s 延迟);不依赖 schtasks 时间戳(分钟截断会滑过导致永不触发,2026-08-16 实测)
    subprocess.run(["schtasks", "/Run", "/TN", taskname], capture_output=True, timeout=30)
    log(f"已触发重启:任务 {taskname}(8s 后优雅关闭->15s兜底->拉起) / restart triggered: task {taskname} (graceful close in 8s -> 15s force fallback -> relaunch)")
    log(f"若计划任务被拦截,请手动重启 DSH / if blocked, restart DSH manually")



def record_version(version):
    """安装后把版本写进 DSH 设置文件(更新检测用)/ record installed version for update checks"""
    try:
        import json as _json
        settings = pathlib.Path(os.environ.get("APPDATA", "")) / "DSH Desktop" / "webbox-settings.json"
        data = {}
        if settings.exists():
            try:
                data = _json.loads(settings.read_text(encoding="utf-8"))
            except Exception:
                pass
        data["installedVersion"] = version
        settings.write_text(_json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"已记录安装版本 / recorded version: {version}")
    except Exception as e:
        log(f"!! 记录版本失败 / record version failed: {e}")

def main():
    ap = argparse.ArgumentParser(description="DSH Desktop 内嵌浏览器一键安装")
    ap.add_argument("--dir", help="DSH 安装目录(含 DSH Desktop.exe)")
    ap.add_argument("--check", action="store_true", help="只检查状态")
    ap.add_argument("--uninstall", action="store_true", help="彻底卸载(还原 main.js/删 preload/副本/profile 痕迹/运行时数据)")
    ap.add_argument("--restart", action="store_true", help="安排一次性优雅重启(装完第一次重启用)")
    ap.add_argument("--force", action="store_true", help="强制重打补丁并重新复制插件(更新检测用)")
    args = ap.parse_args()

    check_prereqs()

    dsh_dir = find_dsh_dir(args.dir)
    log(f"DSH 安装目录: {dsh_dir}")

    # profile 目录(~/.dsh/profiles/web)
    profile_dir = pathlib.Path.home() / ".dsh" / "profiles" / "web"
    if not profile_dir.exists():
        # 回退:DSH_DIR 同级 .dsh?
        profile_dir = dsh_dir.parent / ".dsh" / "profiles" / "web"

    if args.uninstall:
        uninstall(dsh_dir, profile_dir)
        return
    if args.restart:
        schedule_restart(dsh_dir)
        return

    app_dir = dsh_dir / "resources" / "app"
    main_js = app_dir / "main.js"
    ok_main = "dsh-web-open-patch.js" in main_js.read_text(encoding="utf-8") if main_js.exists() else False
    ok_preload = (app_dir / "webbox-preload.js").exists() and (app_dir / "webbox-page-preload.js").exists()

    # profile 目录(~/.dsh/profiles/web)
    profile_dir = pathlib.Path.home() / ".dsh" / "profiles" / "web"
    if not profile_dir.exists():
        # 回退:DSH_DIR 同级 .dsh?
        profile_dir = dsh_dir.parent / ".dsh" / "profiles" / "web"
    ok_plugin = (profile_dir / "node_modules" / "@dsh-external" / PLUGIN_NAME / "lib" / "index.js").exists()
    ok_patch = "id: web-open" in (profile_dir / "cordis.patch.yml").read_text(encoding="utf-8") if (profile_dir / "cordis.patch.yml").exists() else False

    log(f"状态: main.js补丁={'有' if ok_main else '无'}  preload={'有' if ok_preload else '无'}  插件={'有' if ok_plugin else '无'}  patch={'有' if ok_patch else '无'}")
    if args.check:
        return

    if args.force:
        # 强制模式:还原 main.js(重打补丁)+ 删安装目录副本(重新复制)
        bak = dsh_dir / "resources" / "app" / "main.js.bak-webbox"
        if bak.exists():
            shutil.copy(bak, dsh_dir / "resources" / "app" / "main.js")
            log("--force: main.js 已还原,强制重打补丁 / main.js restored, force re-patch")
        inst_ext = dsh_dir / "resources" / "app" / "node_modules" / "@dsh-external"
        inst_target = inst_ext / PLUGIN_NAME
        if inst_target.exists() or inst_target.is_symlink():
            try:
                os.rmdir(inst_target)
            except OSError:
                shutil.rmtree(inst_target, ignore_errors=True)
            log("--force: 安装目录副本已删除,强制重新复制")

    changed = False
    changed |= patch_main_js(dsh_dir)
    changed |= patch_watchdog(dsh_dir)

    if profile_dir.exists():
        app_nm = dsh_dir / "resources" / "app" / "node_modules" / "@deepseek-ai"
        target = install_plugin(profile_dir)
        # SDK junction
        nm = target / "node_modules" / "@deepseek-ai"
        nm.mkdir(parents=True, exist_ok=True)
        for dep in SDK_DEPS:
            src = app_nm / dep
            link = nm / dep
            if not src.exists():
                log(f"!! SDK 缺失: @deepseek-ai/{dep}(DSH 版本不支持?)")
                continue
            if link.exists():
                if link.is_symlink() and os.path.realpath(link) == os.path.realpath(src):
                    continue
                if link.is_dir():
                    shutil.rmtree(link, ignore_errors=True)
            os.symlink(src, link, target_is_directory=True)
            log(f"SDK 链接: {dep}")
        changed |= patch_cordis(profile_dir)
        # 🚨 关键:DSH 的 bundle 解析从「安装目录」node_modules/@dsh-external 加载插件
        # (vision-dual 也在安装目录有副本)。profile 的 junction/副本不足以让 loader 解析到。
        inst_ext = dsh_dir / "resources" / "app" / "node_modules" / "@dsh-external"
        inst_target = inst_ext / PLUGIN_NAME
        if not inst_target.exists() or not (inst_target / "lib" / "index.js").exists():
            if inst_target.exists() or inst_target.is_symlink():
                try:
                    os.rmdir(inst_target)
                except OSError:
                    shutil.rmtree(inst_target, ignore_errors=True)
            inst_ext.mkdir(parents=True, exist_ok=True)
            shutil.copytree(PLUGIN_DIR, inst_target, ignore=shutil.ignore_patterns("node_modules", "__pycache__"))
            log(f"已复制到安装目录: {inst_target}")
            changed = True
    else:
        log("!! 未找到 profile 目录,插件未装配(请手动检查 ~/.dsh/profiles/web) / profile dir not found, plugin not assembled (check ~/.dsh/profiles/web)")

    if changed:
        try:
            import json as _json2
            _pkg = REPO / "plugin" / "package.json"
            _ver = _json2.loads(_pkg.read_text(encoding="utf-8")).get("version", "") if _pkg.exists() else ""
            if _ver:
                record_version(_ver)
        except Exception:
            pass
        log("完成!请重启 DSH Desktop(若正在运行)。DSH 更新后重跑本脚本恢复。 / Done! Restart DSH Desktop if running. Re-run after DSH updates.")
    else:
        log("全部已就绪,无需改动。 / All ready, nothing to change.")


if __name__ == "__main__":
    main()
