"use client";

import { useState } from "react";

export function ProbePanel() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("尚未探测。需要 PROBE_TOKEN。");

  async function runProbe() {
    setBusy(true);
    setOutput("正在由已部署 Function 启动 Chromium，只读公开页…");
    try {
      const response = await fetch("/api/probe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>手动只读探测</h2>
      <p>Token 不会写进页面源码。最多两次。请勿对公开投票按钮做任何操作。</p>
      <label htmlFor="probe-token">PROBE_TOKEN</label>
      <input
        id="probe-token"
        type="password"
        autoComplete="off"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="部署环境变量中的探测令牌"
      />
      <button type="button" onClick={runProbe} disabled={busy || token.length < 8}>
        {busy ? "探测中" : "手动探测一次"}
      </button>
      <pre>{output}</pre>
    </section>
  );
}
