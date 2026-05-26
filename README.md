# PoE2DB 术语白名单助手

一个用于 Path of Exile 2 构筑网站的 Tampermonkey 用户脚本。

脚本会从 `poe2db.tw` 获取英 / 繁 / 简三语术语对照，在白名单网站中高亮 Poe2DB 官方术语，并可直接把术语显示为指定语言。

## 功能

- 只在白名单网站运行，非白名单网站不显示入口、不扫描页面。
- 默认支持 `poe.ninja` 和 `https://mobalytics.gg/poe-2`。
- 从 Poe2DB 在线生成英 / 繁 / 简术语词库。
- 在线词库失败时使用本地缓存和内置兜底词库。
- 默认直接显示简体术语并高亮，适合搭配沉浸式翻译或浏览器翻译。
- 可切换为保留原文，仅高亮术语。
- 可选鼠标悬浮显示 EN / 繁 / 简三语对照。
- 网页自带悬浮窗中出现术语时，三语小窗优先显示在左侧，减少遮挡。
- 支持通过 Tampermonkey 菜单添加当前网站或批量编辑白名单。

## 安装

1. 安装浏览器扩展 Tampermonkey。
2. 打开 Tampermonkey 管理面板。
3. 点击“添加新脚本”。
4. 删除默认内容。
5. 粘贴 `poe2db-terms.user.js` 的完整内容。
6. 按 `Ctrl+S` 保存。
7. 打开 `poe.ninja` 或 `https://mobalytics.gg/poe-2` 页面使用。

也可以直接打开脚本 Raw 地址安装：

```text
https://raw.githubusercontent.com/wangdong3213/poe2db-terms-helper/main/poe2db-terms.user.js
```

Tampermonkey 会自动识别用户脚本并提示安装。

## 使用

白名单网站右下角会出现 `PoE2` 按钮，点击后可以：

- 扫描本页
- 刷新词库
- 编辑白名单
- 移动入口位置
- 停用当前网站
- 切换显示方式
- 开关三语小窗

默认显示方式是“直接显示指定语言”，目标语言为简体。

## 添加网站

非白名单网站不会显示 `PoE2` 入口。要添加网站：

1. 打开目标网站。
2. 点击 Tampermonkey 扩展菜单。
3. 选择“Poe2DB 术语：添加当前网站”。
4. 刷新页面后启用。

也可以选择“Poe2DB 术语：编辑白名单”批量添加。

白名单每行一个域名、通配域名或 URL 前缀：

```text
poe.ninja
https://mobalytics.gg/poe-2
*.example.com
```

`https://mobalytics.gg/poe-2` 只匹配该路径及其子路径，不会启用整个 `mobalytics.gg`。

## 和整页翻译工具配合

这个脚本不做整句翻译，只负责 Poe2 官方术语准确性。

推荐把整页翻译交给沉浸式翻译、浏览器翻译或其他翻译工具，本脚本负责把关键术语替换成 Poe2DB 对照词，减少技能、辅助宝石、机制名被错译的问题。

## 文件

- `poe2db-terms.user.js`：Tampermonkey 用户脚本。
- `README.md`：功能介绍和简单教程。
