# 把「错题管家」部署到 GitHub（cuoti-app）

> 目标：拿到一个手机能打开的网址 `https://<你的用户名>.github.io/cuoti-app/`
>
> 你目前的状态：GitHub 账号已注册，还没有仓库、没有 Token。下面三个方案任选一个。

---

## 方案 A：重启应用，让 AI 全自动做完（最省事）

GitHub 连接器已经显示「已连接」，但当前这轮对话开始时它还没挂上，所以 AI 拿不到 GitHub 工具。

1. 完全退出 WorkBuddy，重新打开
2. 新开一轮对话，说：**继续把 cuoti-app 推到 GitHub**
3. AI 会自动建仓库、推代码、开启 Pages，你什么都不用填

推荐先试这个。如果还是不行，走方案 B。

---

## 方案 B：网页上传（完全不用命令行，不用 Token）

### 第 1 步：建空仓库
1. 打开 https://github.com/new
2. **Repository name** 填 `cuoti-app`
3. **Description** 可填：`错题管家 · 家庭错题管理系统`
4. 选 **Public**（GitHub Pages 免费版只支持公开仓库）
5. **不要**勾 "Add a README file"
6. 点绿色按钮 **Create repository**

### 第 2 步：上传文件
1. 建好后页面上有一行小字 "uploading an existing file"，点它
2. 打开访达（Finder），进去这个目录：
   ```
   /Users/jimmy/WorkBuddy/2026-09-10-15-02-07/cuoti-app
   ```
   > 目录里如果没有 `.github`、`.nojekyll` 这类带点开头的文件，在访达里按 `Cmd + Shift + .` 就能显示出来
3. 把这些**拖进浏览器**的上传框：
   `index.html`、`icons`（文件夹）、`manifest.json`、`manifest.webmanifest`、`sw.js`、`README.md`、`.nojekyll`、`.github`（文件夹）、`miniprogram`（文件夹）
   - **不要**拖 `.git` 文件夹
   - **不要**拖 `push-to-github.sh`
4. 页面往下拉，Commit changes 的输入框里写 `init`，点 **Commit changes**

> 如果隐藏文件（`.github`、`.nojekyll`）拖不进去也没关系，跳过它们继续；
> 只影响「自动发布」，第 3 步手动开 Pages 一样能上线。

### 第 3 步：开启 GitHub Pages
1. 进了仓库页面后点上方 **Settings**
2. 左侧菜单往下找到 **Pages**
3. **Source** 选 **Deploy from a branch**
4. **Branch** 选 **main**，右边文件夹选 **/(root)**，点 **Save**
5. 等 1 分钟左右刷新页面，顶部会出现你的网址：
   ```
   https://<你的用户名>.github.io/cuoti-app/
   ```

---

## 方案 C：用 Token 让 AI 帮你推（需要命令行）

> ⚠️ **一定要用 classic token，不要用 fine-grained（细粒度）token。**
> 细粒度 token 要跑通这套流程，必须同时满足 3 个条件，少一个就卡住：
> ① Repository access 选 **All repositories**（选了 Selected / Public 就不行）
> ② 权限 **Administration: Read and write**（用来建仓库）
> ③ 权限 **Contents: Read and write**（用来推代码）
> 而 classic token 只勾一个 **`repo`** 就全覆盖，不容易出错。

### 第 1 步：生成 Token
1. 打开 https://github.com/settings/tokens
2. 点 **Generate new token** → 一定选 **Generate new token (classic)**
   （不要点下面那个 "fine-grained token"）
3. **Note** 填 `cuoti-deploy`，**Expiration** 选 30 days 或 90 days
4. 勾选 **`repo`** 这一个大项（勾了它，下面 5 个子项会自动全勾上）
5. 拉到最下面点 **Generate token**
6. 复制那串 **`ghp_`** 开头的字符（**只显示这一次**，关掉就再也看不到）

### 第 2 步：交给 AI
把 Token 发给 AI，它会：建仓库 → 推代码 → 开启 Pages → 告诉你网址。
用完建议立刻到同一页面把这个 Token 删掉（Delete）。

### 或者你自己在终端跑
```bash
cd /Users/jimmy/WorkBuddy/2026-09-10-15-02-07/cuoti-app
./push-to-github.sh
```
脚本会让你输入用户名和 Token（Token 输入时不显示），
自动完成建仓库 + 推送 + 开 Pages，并且不会把 Token 留在配置里。

---

## 常见问题

| 问题 | 答案 |
|---|---|
| 手机能直接用吗？ | 能。浏览器打开网址 → 分享 → 添加到主屏幕，就是个 App 的样子 |
| 数据存在哪？ | 全部存在你自己手机/电脑的浏览器里（IndexedDB + localStorage），不上传任何服务器 |
| 换手机数据会丢吗？ | 会。用页面的「导出备份」存 JSON，换设备后导入 |
| `cuoti-app` 这个名字被占用了吗？ | 只会占用你自己的账号下，不会和别人冲突。如果报错说明你账号下已有同名仓库 |
| Pages 打开是 404？ | 正常，刚开 Pages 要等 1~3 分钟；另外确认仓库里有 `index.html` 在根目录 |
| 仓库能改成私有吗？ | 可以，但免费账号的私有仓库开不了 Pages，网站会失效 |
