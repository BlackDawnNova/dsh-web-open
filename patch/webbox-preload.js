// dsh-web-open 内嵌网页窗口工具栏 preload(补丁文件,更新后由 dsh-vision-reinstall.py 重打)。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__webbox__', {
  send: (cmd, arg) => ipcRenderer.send('dsh:webbox-cmd', { cmd, arg }),
  onState: (cb) => ipcRenderer.on('dsh:webbox-state', (_e, state) => cb(state)),
});
