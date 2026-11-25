# 2dPig Pixel Office — 授权与下载记录

- 记录日期：2026-11-25（22:28 下载成功后更新）
- 官方下载地址：https://2dpig.itch.io/pixel-office
- 官方下载/购买入口：https://2dpig.itch.io/pixel-office/purchase（页面标注 `Name your own price`，并提供 `No thanks, just take me to the downloads`）
- 授权：CC0 / Creative Commons Public Domain Dedication
- 结果：**原始素材包已从官方地址下载成功并导入。** `PixelOffice.zip` 50,510 字节，ZIP CRC 校验通过，解压得到 7 个原始文件，入库于 `office/2dpig/`。未使用替代素材。

## 授权核实（一手）

### 官方页面原文

2026-11-25 22:10 通过服务端网页读取直接取得官方素材页 `https://2dpig.itch.io/pixel-office` 原文：

```text
Pixel Office Asset Pack
A downloadable asset pack

ASSET PACK CONTENTS
Five human characters
Two animal drawings
A bunch of office themed assets (furniture, computers, plants, decor, etc.)
Assets are provided in PNG and Aseprite formats with an example scene.

LICENSE INFORMATION
This is released under the Creative Commons Public Domain Dedication License
(aka CC0 or CC Zero), and can be read here: https://creativecommons.org/publicdomain/zero/1.0/
No attribution is required but it is greatly appreciated 😊.

Author: 2dPig
```

### 包内授权原文

下载成功后，包内 `LICENSE.txt` 原文如下（与官方页面一致）：

```text
This asset pack is released under the Creative Commons Public Domain Dedication License (aka CC0 or CC Zero).

CC0 is a public dedication tool, which allows creators to give up their copyright and put their works into the worldwide public domain. CC0 allows users to distribute, remix, adapt, and build upon the material in any medium or format, with no conditions.

More info here:
https://creativecommons.org/publicdomain/zero/1.0/
```

包内 `README.txt` 亦写明：

```text
LICENSE INFORMATION

This is released under the Creative Commons Public Domain Dedication License (aka CC0 or CC Zero), and can be read here: https://creativecommons.org/publicdomain/zero/1.0/

No attribution is required but it is greatly appreciated =).
```

| 项目 | 结论 | 依据 |
| --- | --- | --- |
| 授权类型 | CC0 / Creative Commons Public Domain Dedication | 官方页面 `LICENSE INFORMATION` + 包内 `LICENSE.txt` + `README.txt` |
| 允许商业使用 | 是 | CC0 公有领域贡献；包内原文 `with no conditions`，无商业限制条款 |
| 需要署名 | 否 | `No attribution is required but it is greatly appreciated` |
| 允许修改 | 是 | 包内原文 `remix, adapt, and build upon the material` |
| 允许重新分发 | 是 | 包内原文 `distribute` |
| 作者 | 2dPig | 官方页面 `Author` 字段 + 包内 `README.txt` 署名 |
| 内容 | 5 个人物、2 个动物绘制、办公室家具/电脑/植物/装饰、PNG + Aseprite 格式、含示例场景 | 官方页面 `ASSET PACK CONTENTS` + 包内 `README.txt` + 实际文件清单 |

CC0 法律文本入口：https://creativecommons.org/publicdomain/zero/1.0/

## 下载过程（实测）

### 第一轮：用户开代理前（失败）

| 尝试 | 结果 |
| --- | --- |
| `curl https://2dpig.itch.io/pixel-office`（默认代理） | `CONNECT tunnel failed, response 502` |
| 带浏览器 User-Agent 重试 | 同上 |
| `curl http://2dpig.itch.io/pixel-office` | HTTP 502，响应体 `upstream connect failed: connection timed out` |
| `curl --noproxy '*'` 直连 | `Connection timed out` |
| `https://itch.io`、`https://itch.zone` 连通性探测 | 均为代理 502 |

### 第二轮：用户开启 iKuuuVPN 后（失败）

本机监听端口确认：`7890`/`7892` 属于 `iKuuuVPNCore`，会话代理环境变量仍指向 `62200`（WorkBuddy sandbox-cli）。基础网络正常（百度 HTTP 200）。

| 尝试 | 结果 |
| --- | --- |
| `curl` 经 7890 / 7892 / 62200 访问 itch.io | CONNECT 隧道建立成功，随后 TLS 握手失败：`schannel: failed to receive handshake` |
| `--ssl-no-revoke`、SOCKS5（7890 / 7892）、Python `urllib`、PowerShell `Invoke-WebRequest` | 均在 TLS 握手阶段失败 |
| `r.jina.ai` 文本代理 | `fetch failed` |
| 服务端网页读取 | 可读到官方页面文字与授权原文，但拿不到二进制直链 |

### 第三轮：用户提供新端口（成功）

用户提供本地代理：SOCKS5 `127.0.0.1:9909`、HTTP `127.0.0.1:9910`。经 HTTP 9910 可正常打开 itch.io（HTTP 200）。

成功路径：

1. GET `https://2dpig.itch.io/pixel-office` 取得官方页面，确认 CC0 与内容说明。
2. GET `/pixel-office/purchase` 建立会话并提取 `csrf_token`。
3. POST `/pixel-office/download_url`（带 csrf_token、`X-Requested-With: XMLHttpRequest`）取得签名下载 URL。
4. GET 签名 URL 得到官方下载页，解析出 `data-upload_id="4257769"`。
5. POST `/pixel-office/file/4257769`（带 csrf_token）取得真实文件 URL；此前 GET 该端点会被重定向，正确方式是 POST。
6. GET 真实文件 URL 得到 `PixelOffice.zip`，50,510 字节，ZIP CRC 校验通过，7 个条目。

## 入库文件

`office/2dpig/` 原始解压文件（未改名、未修改、未去重）：

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `PixelOffice.png` | 10,674 B | 示例场景，256×224，8bit RGBA |
| `LargePixelOffice.png` | 20,919 B | 示例场景大图，1024×896，8bit RGBA |
| `PixelOfficeAssets.png` | 9,383 B | 素材总表，256×160，8bit RGBA；含 5 人物、2 动物与办公室物件 |
| `PixelOffice.aseprite` | 8,331 B | 示例场景源文件 |
| `PixelOfficeAssets.aseprite` | 6,052 B | 素材总表源文件 |
| `LICENSE.txt` | 442 B | CC0 授权原文 |
| `README.txt` | 583 B | 官方内容与授权说明 |

## 未采取的措施

- 未用其他作者的办公室像素包替代；
- 未用预览图、截图或第三方镜像充当原始包；
- GitHub 搜索 `2dpig pixel-office` / `PixelOffice.zip` 未发现作者本人发布的原始包镜像，故不从第三方来源下载；
- 未对工具返回的文本摘要做推断性扩写，授权结论均引用官方页面与包内原文；
- 未修改任何原始 PNG / Aseprite / 文本文件内容。
