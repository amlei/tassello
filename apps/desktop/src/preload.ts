import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tassello", {
  desktop: true,
  electron: process.versions.electron,
  openExternal: (url: string) => ipcRenderer.invoke("tassello:open-external", url),
  /* 网页侧据此适配 macOS 红绿灯区域 */
  platform: process.platform,
});
