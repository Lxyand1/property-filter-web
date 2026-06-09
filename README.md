# 房源筛选网站

一个面向客户展示的房源筛选页面，支持房源卡片展示、视频链接跳转、手动筛选和小邱 AI 助手。

## GitHub Pages 使用方式

本项目可以直接发布到 GitHub Pages。

页面功能：

- 房源卡片展示
- 点击房源/查看视频直接跳转视频链接
- 手动筛选房源
- 小邱 AI 助手对话
- 前端直连 SenseAudio API，根据自然语言需求自动筛选房源

## AI 接口设置

页面内置“AI 接口设置”区域，需要在网页里填写：

- SenseAudio API Key
- API Base URL：`https://api.senseaudio.cn`
- Model：`senseaudio-s2`

保存后，配置会保存在当前浏览器的 `localStorage`。

注意：这是 GitHub Pages 前端直连模式。API Key 会出现在浏览器请求中，公开分享网页时存在被查看或滥用的风险。

## 本地运行

直接打开 `index.html` 即可使用静态页面。

如果需要保留本地 Node 代理，也可以运行：

```bash
npm start
```

默认访问：

```text
http://127.0.0.1:8765
```
