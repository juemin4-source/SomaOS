# GATE-SOMA-NATIVE-002A

## ModelProvider Conformance

> **状态:** 诊断中
> **前序:** GATE-002 → INCONCLUSIVE — blocked by unverified ModelProvider conformance
> **原则:** 不新增产品功能，只做诊断。每次 Probe 保存四份去敏结果。

---

## 归因目标

区分以下三种失败来源：

1. **Provider/Adapter conformance** — system/tools/tool_call_id/Observation 在请求-响应链中丢失或变形
2. **Model Agent capability** — 模型正确收到工具但无法完成多步任务
3. **Soma governance overhead** — 治理链干扰了正常 Agent 行为

---

## Probe 序列（依次执行）

### P0: System Prompt Sentinel

发送:
```
system: 你必须在回答开头输出 SOMA-SENTINEL-7F31。
user: 回复一句话。
```

检查原始 Provider 响应中是否包含 `SOMA-SENTINEL-7F31`。

**不通过则禁止继续。** 先排查: system role 是否传出、消息顺序、Rig 是否降级为 user message。

### P1: 最小单工具调用

只暴露一个工具:
```json
{
  "name": "get_gate_token",
  "description": "Return the token required to answer the user.",
  "parameters": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

用户要求: "调用工具获取 token，然后回答。"

检查: 模型是否看见工具、是否产生真实 tool_call、名称是否正确、参数是否为合法 JSON、finish_reason 是否正确映射。

### P2: 参数 Schema

只暴露 `read_fixture_file(path: string)`。

要求模型读取一个明确路径。

检查: 参数字段名、路径值、JSON 类型、是否被正确解析。

### P3: Observation 回注

第一轮工具返回 `{"token": "ORANGE-42"}`。

第二轮要求模型复述 token。

检查: assistant tool_call 是否进入 history、tool_call_id 是否一致、tool role 是否正确、Observation 是否实际发送、上一轮消息是否被清空。

### P4: DeepSeek 思考模式连续调用

完整记录并回传: reasoning_content、assistant tool_calls、tool result。

如果 `SomaModelMessage` 没有承载 `reasoning_content` 的字段，则 Rig 的统一类型边界太薄——需要增加 provider continuation state。

### P5: 两步工具链

只提供两个无危险性工具: `read_bug_description` 和 `run_target_test`。

看模型能否: 读取描述 → 运行测试 → 根据 Observation 给出结论。

P1-P4 通过、P5 失败 → 开始涉及 Agent 编排能力。

### P6: 最小修复任务

Fixture 缩到只需: read one file → patch one line → run one test。

暂时移除: Git Organ、通用 Process、复杂 Policy、多个 Claim、大段系统说明。

---

## 数据采集

每项 Probe 保存四份去敏结果:

1. **SomaModelRequest** — Foundry 构造的请求
2. **Rig 原始请求** — 发给 Provider 的 HTTP 请求体
3. **Provider 原始响应** — 返回的完整响应体
4. **标准化 ModelEvent** — Rig 解析后的事件流

---

## 归因矩阵

| 结果 | 归因 |
|------|------|
| 直接 DeepSeek API 通过，Foundry/Rig 失败 | Provider/Adapter 问题 |
| 非思考通过，思考失败 | reasoning continuation 或 thinking 参数问题 |
| P1-P4 失败 | 协议或工具接线问题 |
| P1-P4 通过，P5/P6 失败 | 模型 Agent 能力或提示设计不足 |
| Baseline 成功、Soma 失败 | Soma 工具投影或治理交互负担过重 |
| Baseline 与 Soma 都失败 | 模型、Harness 或 Fixture 问题，无法评价治理 |
| 两者都成功，Soma 阻断错误完成 | GATE-002 真正验证成立 |

## 不做的

- ❌ 不新增产品功能
- ❌ 不修改现有治理链
- ❌ 不等 Claude API Key
- ❌ 不退回 Foundry 治理方向
