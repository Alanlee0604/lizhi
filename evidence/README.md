# 证据分层

这些截图来自 **Layer A：Cloud Agent 系统 Chrome 打开公开页**，采集时间北京时间 **2026-11-09 17:08**。它们只证明公开页当时可见，**不能**当作 Vercel Function 部署后的新数据。

| 文件 | 层 | 说明 |
| --- | --- | --- |
| `local-chrome-top-2026-11-09T1708-beijing.png` | A 本地 Chrome | 公开终页顶部，含《打歌2026·X舞台》 |
| `local-chrome-fresh-zone-2026-11-09T1708-beijing.png` | A 本地 Chrome | 第9期鲜打专区可见排名/总票（若含平台选择弹窗，弹窗是投票入口，采集代码不会点选） |
| `../fixtures/fresh-zone-visible-2026-11-09T1708-beijing.txt` | 解析器夹具 | 当时可见 innerText 片段，仅用于单元测试 |

| `layer-c-function-probe-2026-11-09T171431-beijing.jpg` | C 已部署 Function | Function 内 Chromium 截到的鲜打专区 |
| `layer-c-function-probe-2026-11-09T171431-beijing.json` | C 已部署 Function | 源更新 `更新至17:10`，采集北京时间 2026/11/09 17:14:31 |

Layer C 的票数/更新时间与 Layer A 不同，证明没有把 17:08 的本地数字当成 Function 新数据。
Function 部署后的探测结果必须带当次 `collectedAtBeijing` 与截图。
