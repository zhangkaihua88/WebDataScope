# WorldQuant Scope - Firefox 版本安装指南

这是从 Chrome 扩展转换而来的 Firefox 版本。

## 安装步骤

### 当前仅支持临时安装（开发模式）
1. 打开 Firefox 浏览器
2. 在地址栏输入 `about:debugging`
3. 点击左侧的 "This Firefox"
4. 点击 "Load Temporary Add-on..." 按钮
5. 选择此文件夹中的 `manifest.json` 文件
6. 扩展将被临时安装（重启 Firefox 后会被移除）

## 主要变更

### 1. Manifest 更改
- `manifest_version`: 3 → 2 (Firefox 兼容)
- `action` → `browser_action`
- `service_worker` → `scripts` 数组
- 简化了 `web_accessible_resources` 格式
- 移除了 `host_permissions`

### 2. API 兼容性
- 所有 `chrome.*` API 调用都已更新为使用 `browserAPI`
- 自动检测环境并使用正确的 API (`browser` 或 `chrome`)
- `chrome.scripting` API 替换为 `tabs.executeScript` 和 `tabs.insertCSS`

### 3. 脚本注入更改
- 使用 Firefox 兼容的脚本注入方法
- 顺序注入脚本文件以确保依赖关系
- 使用代码字符串注入替代函数参数注入

## 功能验证

安装后请验证以下功能：
- [ ] 扩展图标显示在工具栏
- [ ] 弹出窗口正常打开
- [ ] 设置保存和加载正常
- [ ] 在 WorldQuant 平台页面正常工作
- [ ] 数据分析功能正常
- [ ] Genius 页面增强功能正常

## 故障排除

如遇到问题：
1. 打开 Firefox 开发者工具 (F12)
2. 查看控制台错误信息
3. 检查扩展是否在 about:addons 中正常启用
4. 确认网站权限设置正确

## 注意事项

- Firefox 版本可能在某些 API 调用上与 Chrome 版本有细微差异
- 建议在安装前备份浏览器数据
- 如需更新，需重新进行临时安装过程