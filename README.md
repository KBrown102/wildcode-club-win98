# wildcode.club · Win98 桌面版

这个仓库就是站点本身，根目录即 `win98.wildcode.club` 的发布目录。

- `index.html` — 整个桌面，单文件，CSS 和 JS 全内联
- `games/` — 40 个实验原型，各自一个目录；`games/covers/` 是封面
- `CNAME` — GitHub Pages 的自定义域名
- `404.html` — 找不到文件时回落到的一个 Win98 错误框

不带构建，改完 `index.html` 直接推即可。

## 本地预览

    python -m http.server 8002

然后开 http://localhost:8002/ 。必须走 http，`file://` 下所有 iframe 都会被浏览器当跨域，游戏窗口会白屏。

## 部署

GitHub Pages，来源 `main` 分支根目录，自定义域名 `win98.wildcode.club`，HTTPS 强制开启。
