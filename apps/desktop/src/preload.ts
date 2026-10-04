import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("tassello", {
  desktop: true,
  electron: process.versions.electron,
  /* 网页侧据此适配 macOS 红绿灯区域 */
  platform: process.platform,
});
