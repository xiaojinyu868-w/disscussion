# Meeting Snapshot MVP

React Native + NestJS implementation of the “会议快照” MVP. The project recreates the reference mobile UI, streams real‑time audio to Alibaba Tingwu, and surfaces AI outputs such as live transcription, summaries, “内心 OS”, and “头脑风暴”.

## Repository Structure

```
frontend/   # Expo React Native app
backend/    # NestJS service (Tingwu proxy, polling, skills)
specs/      # Requirements, design, tasks, QA notes
```

## Features
- **UI 复刻**：深色录音面板、实时转写/AI 总结标签页、技能按钮。
- **实时推流**：单 WebSocket 连接推送 16k PCM 音频并消费下行增量转写。
- **兜底轮询**：后端每 5 秒调用 Tingwu `GET /tasks/{TaskId}` 补齐转写与摘要。
- **AI 能力**：展示全文/发言摘要、关键词、章节速览；一键触发内心 OS、头脑风暴。
- **可扩展设计**：文档化技术方案、任务拆解、QA checklist。

## Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- Expo CLI (`npm install -g expo-cli`) 建议安装
- 阿里云通义听悟账号与 API 凭据（AccessKeyId/Secret，AppKey）
- 可选：Android/iOS 模拟器或实体设备安装 Expo Go

## Backend Setup (`backend/`)

```bash
cd backend
npm install
```

Create a `.env` file (or export env vars):

```
PORT=4000
TINGWU_REGION=cn-beijing
TINGWU_ACCESS_KEY_ID=your-ak
TINGWU_ACCESS_KEY_SECRET=your-secret
TINGWU_APP_KEY=your-appkey
POLLING_INTERVAL_MS=5000
```

Then run:

```bash
npm start
```

The API exposes:
- `POST /sessions` → `{ sessionId, taskId, meetingJoinUrl }`
- `GET /sessions/:id/transcripts`
- `GET /sessions/:id/summaries`
- `POST /sessions/:id/skills/:skillType` (`skillType = inner_os | brainstorm`)

## Frontend Setup (`frontend/`)

```bash
cd frontend
npm install
```

Set backend URL (e.g. in `.env` or shell):

```
EXPO_PUBLIC_API_URL=http://localhost:4000
```

Start Expo:

```bash
npm run start
```

Use Expo Go 或 模拟器扫描 QR 即可体验：
- 点击“开始录制”推流音频 → 实时转写更新。
- 切换“AI总结”标签查看摘要、要点。
- 点击“内心OS”“头脑风暴”触发 Custom Prompt，5–10s 内返回卡片。

## QA & Verification
参阅 `specs/spec_product/qa.md`，包括：
- 截图比对界面（录音状态、实时转写、AI 总结）。
- 检查后端日志：任务创建、轮询成功、技能触发。
- 端到端测试：录音 30 秒、确认实时转写刷新、摘要更新、技能卡片生成。

## Development Notes
- 文档与拆解：`specs/spec_product/requirement.md`, `design.md`, `tasks.md`, `llm_api_requirements.md`.
- `useTingwuRealtime` 组合了音频上行与下行数据解析，`PollerService` 处理兜底轮询。
- 自定义 Prompt 模板位于 `llm_api_requirements.md` 和 `TingwuService.triggerCustomPrompt`。
- 若需离线补录或更多技能，可在 `TingwuService` 中扩展参数。

## Next Steps
- 结合真实凭据联调、观察费用与限流策略。
- 如需正式发布 APK/IPA，可使用 Expo EAS Build。
- 增强容错（断线提示、请求队列）和持久化（数据库替换内存存储）。

欢迎根据需求继续扩展。***
