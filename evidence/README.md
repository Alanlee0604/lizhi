# 证据分层

这些截图来自 **Layer A：Cloud Agent 系统 Chrome 打开公开页**，采集时间北京时间 **2026-11-09 17:08**。它们只证明公开页当时可见，**不能**当作 Vercel Function 部署后的新数据。

| 文件 | 层 | 说明 |
| --- | --- | --- |
| `local-chrome-top-2026-11-09T1708-beijing.png` | A 本地 Chrome | 公开终页顶部，含《打歌2026·X舞台》 |
| `local-chrome-fresh-zone-2026-11-09T1708-beijing.png` | A 本地 Chrome | 第9期鲜打专区可见排名/总票（若含平台选择弹窗，弹窗是投票入口，采集代码不会点选） |
| `../fixtures/fresh-zone-visible-2026-11-09T1708-beijing.txt` | 解析器夹具 | 当时可见 innerText 片段，仅用于单元测试 |

Function 部署后的探测结果必须带新的 `collectedAtBeijing` 与当次截图，不得把本目录数字写成“当前票数”。
