# TODO

## 账号 / 登录态

- [ ] **按平台记住登录态导入来源**（浏览器选择功能的后续项）
      背景：设置里的「浏览器选择」是全局单选，再次获取账号时以当前选择的浏览器整体覆盖登录态；
      用户若同时用 Chrome 和 Edge（不同平台登在不同浏览器里），无法做到「公众号从 Chrome 导、
      微博从 Edge 导」，只能切源后重新获取来回换。
      做法：单个平台 reacquire 时，只从该平台绑定的浏览器按域名过滤合并 Cookie，而不是整库复制。
      成本注意：Chrome / Edge 的 Cookie 各由自己的 os_crypt 密钥加密（macOS Keychain 里是不同的
      Safe Storage 条目），应用 profile 的 `Local State` 只绑一把钥匙——混合导入需要「用源浏览器
      的密钥解密、再按应用 profile 的密钥重新加密」，比现在的整库复制高一档。
      决策：有真实用户需求再做。来源：2026-09「浏览器选择」方案讨论
      （原型：designs/onda-explore/directions/mosaic）。
