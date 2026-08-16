# dsh-web-open — Roadmap / 更新计划

> 当前版本 Current: v1.0.0(已发布 released)

## 已完成 Done (v1.0.0)

- open_url 工具 + 内嵌浏览器(多标签 / multi-tab)
- 下载管理(速度/暂停/继续/取消清理/断点续传 / speed, pause, resume, cancel+cleanup, auto-resume)
- 音效 + i18n(中文/English/跟随系统 / follow-system)
- 一键安装卸载 + 优雅重启 / one-click install/uninstall + graceful restart
- 更新检测 + 一键更新 / update check + one-click update
- 应用层 DNS 直连(resolve-host 动态 / dynamic resolve-host)+ jsDelivr 通道 + 失败自检
- 尾插自愈 + Cordis 插件合规 + dsh-plugin topic

## P0 高价值 High value

- [x] **网页内容注入 AI / Page content to AI**:新增 `read_page` 工具,提取网页正文供 AI 摘要/翻译/问答(实测通过:百度页标题+正文提取)
- [ ] 历史记录 + 收藏夹 / history + bookmarks(常用站一键开)
- [x] 快捷键 / shortcuts:Ctrl+L / Ctrl+T / Ctrl+W / Ctrl+Shift+T
- [x] 标签恢复 / session restore(DSH 重启恢复上次标签页,关闭记录到恢复栈)

## P1 体验增强 Experience

- [ ] 标签页增强 / tab enhancements:拖拽排序、固定、静音
- [ ] 页面翻译 / page translate(GitHub 英文页一键翻译)
- [ ] 网页截图 / full-page screenshot
- [ ] 下载完成通知 AI / download-done notify AI(路径/大小)
- [ ] 页面 → 发送给 AI / page → send to AI

## P2 网络/通道 Network & channels(无代理核心)

- [ ] 页面级中转通道 / page-level relay(封锁期完整浏览,难度较高)
- [ ] 下载加速 / download acceleration(多线程分段 + 镜像池)
- [ ] 更多 CDN 通道 / more CDN channels(Gitee 镜像等)

## P3 工程/生态 Engineering & ecosystem

- [ ] 设置云同步 / settings sync
- [ ] LICENSE + 文档完善 / LICENSE + docs
- [ ] 插件市场提交 / plugin marketplace submission

## 路线建议 Suggested order

P0 → P1 → P2 → P3;下一迭代从 **P0-网页内容注入 AI** 开始。
