# WebDataScope
WebDataScope是一个正在为WorldQuant平台打造的Chrome/Edge插件。它可以让你在WorldQuant平台上方便的获得其数据分析报告

# 使用方式
下载这个project，然后在`chrome://extensions`中加载

`data`文件夹不在该repo中提供

# 功能
- 当在数据页面浏览时, 鼠标移至数据行上可以显示相应数据的分析报告(只覆盖了部分数据), 支持`Data`界面以及`simulation->Data`界面
![图片详见网盘](figure/dataAna.png)
- 显示已有的数据分析报告的`data-sets`('★★★'标识)
![图片详见网盘](figure/dataFlag.png)
- 在`alpha`->`distribution`添加分析图(region-category), 其中灰色的点为WQ平台不支持的点, 红色点为alpha个数大于30同时占比大于30%的点
![图片详见网盘](figure/distribution.png)
- 支持论坛中文搜索
- 支持Genius运算符使用分析

# 存储的变量
- `WQPApiAddress`: 中文搜索的api地址
- `WQPHiddenFeatureEnabled`: 隐藏功能是否启用
- `WQPOPSAna`: Genius运算符使用分析结果

# TODO
- [x] simulation->Data中的数据展示
- [ ] 重构监听鼠标逻辑, 降低浏览器负担

# 没处理
- 没跑完
  <!-- - `analyst39_GLB_TOP3000_Delay1`
  - `analyst46_GLB_TOP3000_Delay1` -->

# 更新日志
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

# Reference
- [BiliScope](https://github.com/gaogaotiantian/biliscope)


# 致谢
- 感谢`MC63847`为V0.4.3做的修正
- 感谢群里同学们提供的分析数据