import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("tassello", {
  desktop: true,
  electron: process.versions.electron,
});
