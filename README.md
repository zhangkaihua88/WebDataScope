# WebDataScope
WebDataScope是一个正在为WorldQuant平台打造的Chrome/Edge插件。它可以让你在WorldQuant平台上方便的获得其数据分析报告

使用方法和功能详见使用教程

# 存储的变量
- `WQPSettings`: 插件设置
- `WQPOPSAna`: Genius运算符使用分析结果
- `WQPRankData`: Genius排名分析结果

# TODO
- [ ] **fields的逐年覆盖率** (优先处理)
- [ ] Genius排名分析的优化, 以增加准确性
- [ ] 论坛中文搜索支持改为本地进行
  - 逐个抓取论坛数据
  - 之后进行本地搜索
- [ ] BUG: Genius排名分析有时需要刷新一下才能显示数据
- [ ] 未知功能可以选择起始时间
- [ ] 运算符分析排除SA

# 更新日志
- V0.9.x
  - fix: Genius排名分析中获取的时间未转化为美东时间的错误
  - fix: 修复某已知bug
  - add: genius排名分析可以选择赛季
  - fix: genius运算符分析剔除SUPER Alpha的分析
  - add: genius运算符分析结果添加了`genius`的标识
- V0.9.1(20250330)
  - fix: 运算符分析中的bug
    - 未考虑and or not的缩写
    - `<=`,`>=`名称改动
    - 排除带符号的数字时引起的bug
  - fix: Genius排名分析中Master最终的人数计算错误的bug
  - fix: Genius的运算符分析中起始采取时间出错的bug
  - fix: 修复某已知bug
  - add: 论坛的未知功能1_multi-user
- V0.9.0(20250202)
  - 重构代码
  - add: 版本检测
- V0.8.1(20250125)
  - add: genius排名分析
- V0.7.4(20250124)
  - fix: Genius运算符使用分析增加对于`Super`的支持
- V0.7.3(20250122)
  - fix: 一个已知bug
- V0.7.2(20250119)
  - add: 论坛的未知功能1_user
- V0.7.1(20250118)
  - add: 论坛的未知功能1_post
- V0.6.1(20250105)
  - add: Genius运算符使用分析
  - fix: 存储从`chrome.storage.sync`更改为`chrome.storage.local`
- V0.5.1(20250103)
  - add: 论坛中文搜索支持
- V0.4.3(20240906)
  - fix: 报告无法展示
  - add: 使用五角星表示其他其他universe有的数据
- V0.4.2(20240618)
  - fix: search时显示报告的逻辑
  - add: JPN and AMR in `alpha->distribution`
- V0.4.1(20240609)
  - fix: 添加已有数据报告的表示
- V0.4.0(20240429)
  - 修改`alpha->distribution`的分析图由于没有数据导致无法显示的bug 
  - 添加`AMR`区域在`alpha->distribution`的分析图中
  - 添加已有数据报告的表示'★★★'
- V0.3.0(20240321)
  - 支持`simulation->Data`中的数据展示
  - 更新`region`,`delay`和`universe`的获取逻辑，避免获取失败
  - 添加`alpha->distribution`的分析图, 添加红色提示以及灰色不可用提示
- V0.2.0(20240314)
  - 适配Edge浏览器
  - 启用数据缓存策略，提高加载速度
  - 禁用画图动画效果
- V0.1.0(20240311)
  - 完成插件主体内容


# 致谢
- 感谢`MC63847`为V0.4.3做的修正
- 感谢`XX42289`为genius排名分析做的贡献
- 感谢群里同学们提供的分析数据


# Reference
- [BiliScope](https://github.com/gaogaotiantian/biliscope)


