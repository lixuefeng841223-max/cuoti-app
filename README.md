# 错题管家 · 家庭错题管理系统

面向初中生的家庭错题管理工具：**拍照上传 → 自动识别 → 自动批改 → 错题归档 → 间隔重复复习 → 学习统计**。
纯前端实现，**无需服务器、无需数据库**，所有数据保存在使用者本机（IndexedDB / localStorage）。

## 在线访问（GitHub Pages）

部署完成后访问：

```
https://<你的 GitHub 用户名>.github.io/cuoti-app/
```

手机浏览器打开后可「添加到主屏幕」，即可当作 App 使用（已内置 PWA 支持，可离线打开）。

## 功能

| 模块 | 说明 |
| --- | --- |
| 首页 | 各科错题数与正确率、待复习数量、已掌握数量、高频错误知识点、近 7 天新增、连续学习天数 |
| 上传 | 拍照 / 相册 / 文字录入；文字自动识别题号、题型、选项与答案区段（支持「1-5 BBACA」连写） |
| 自动批改 | 正确 / 错误 / 部分正确 / 无法判断（进入待确认）；错误题自动归档 |
| 错题集 | 数学 / 语文 / 英语 / 科学 四科切换，按知识点、题型、难度、掌握状态筛选 |
| 复习 | 隐藏答案重做、看解析、标记掌握、举一反三变式题 |
| 间隔重复 | 当天 → 1 天 → 3 天 → 7 天 → 14 天 → 30 天 → 掌握 |
| 数据 | 重复上传自动合并（错误次数累加）；支持导出 / 导入 JSON 备份 |

## 目录结构

```
cuoti-app/
├── index.html                # 单文件 Web 应用（全部界面与逻辑）
├── manifest.json             # PWA 清单
├── manifest.webmanifest      # PWA 清单（备用）
├── sw.js                     # Service Worker（离线缓存）
├── icons/                    # 应用图标 180 / 192 / 512
├── .nojekyll                 # 关闭 Jekyll，保证静态资源原样发布
├── .github/workflows/pages.yml  # GitHub Pages 自动部署工作流
└── miniprogram/              # 微信小程序版（同一套业务逻辑）
    ├── project.config.json
    ├── app.js / app.json / app.wxss
    ├── utils/core.js         # 识别解析、自动批改、相似合并、变式题
    ├── utils/store.js        # 本地存储、归档、间隔重复、统计、导出导入
    └── pages/                # dashboard / upload / library / review / detail
```

## 本地预览

```bash
# 任选一种静态服务器，直接在项目根目录启动
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

> 直接双击 `index.html` 也能用，但 Service Worker 需在 http(s) 下才会注册。

## 数据说明

- 所有数据（错题、复习记录、统计）均保存在**浏览器本机**，不上传任何服务器。
- 清除浏览器数据 / 更换设备会丢失数据，建议定期在应用内「导出备份」保存 JSON 文件。
- 需要多设备同步时，本项目无需改动界面层，把存储层替换为云端接口即可。

## 微信小程序版

见 [`miniprogram/`](./miniprogram) 目录。用「微信开发者工具」导入该目录即可运行，
正式发布需在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册小程序账号并把 AppID 填入 `miniprogram/project.config.json`。

## 部署说明

推送到 `main` 分支后，GitHub Actions 会自动把根目录发布到 GitHub Pages。
若仓库尚未开启 Pages，请在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

## License

MIT
