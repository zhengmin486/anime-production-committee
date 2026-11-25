# 2dPig Pixel Office — 下载失败与授权核实状态

- 记录日期：2026-11-25
- 官方下载地址：https://2dpig.itch.io/pixel-office
- 授权目标：CC0（Creative Commons Public Domain Dedication）
- 结果：**原始素材包未下载成功，未导入任何文件，未使用替代素材。**

## 失败原因（实测）

| 尝试 | 结果 |
| --- | --- |
| `curl https://2dpig.itch.io/pixel-office`（默认代理） | `CONNECT tunnel failed, response 502` |
| 带浏览器 User-Agent 重试 | 同上 |
| `curl http://2dpig.itch.io/pixel-office` | HTTP 502，响应体 `upstream connect failed: connection timed out` |
| `curl --noproxy '*'` 直连 | `Connection timed out after 20003 ms` |
| 网页抓取工具访问该 URL | `fetch failed` |
| `https://itch.io` 与 `https://itch.zone` 连通性探测 | 均为代理 502 |

结论：当前环境的 HTTP 代理上游无法连接 itch.io，直连也超时。这是网络可达性问题，不是授权或付费墙问题。

## 授权核实状态（未完成一手核实）

授权信息**仅来自搜索引擎对官方素材页的索引摘要**，不是直接读取官方页面 HTML，也不是读取包内授权文件：

> "This is released under the Creative Commons Public Domain Dedication License (aka CC0 or CC Zero), and can be read here: https://creativecommons.org/publicdomain/zero/1.0/ No attribution is required but it is greatly appreciated 😊."

> "Assets are provided in PNG and Aseprite formats with an example scene." / "Author: 2dPig" / "PixelOffice.zip 49 kB"

因此：

- 作者、CC0、无强制署名、文件格式与内容描述均为**待一手复核**的间接信息；
- 在拿到官方页面与原始 zip 之前，不写"已核实可商用"的结论；
- 官方 CC0 法律文本入口：https://creativecommons.org/publicdomain/zero/1.0/

## 未采取的措施

- 未用其他作者的办公室像素包替代；
- 未用预览图、截图或第三方镜像充当原始包；
- GitHub 搜索 `2dpig pixel-office` / `PixelOffice.zip` 未发现作者本人发布的原始包镜像，故不从第三方来源下载。

## 后续

网络恢复后，从上述官方地址下载 `PixelOffice.zip`，核对包内授权文件与文件清单，再按 `ASSET_CATALOG.md` 的字段补齐记录并导入 `office/2dpig/`。该目录当前未创建，因为 Git 不跟踪空目录。
