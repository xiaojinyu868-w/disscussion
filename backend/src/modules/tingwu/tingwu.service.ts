import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import TingwuClient, {
  CreateTaskRequest,
  CreateTaskRequestInput,
  CreateTaskRequestParameters,
  CreateTaskRequestParametersMeetingAssistance,
  CreateTaskRequestParametersSummarization,
  CreateTaskRequestParametersTranscription,
  CreateTaskRequestParametersTranscriptionDiarization,
} from "@alicloud/tingwu20230930";
import * as $OpenApi from "@alicloud/openapi-client";
import * as $Util from "@alicloud/tea-util";
import OpenApiUtil from "@alicloud/openapi-util";

@Injectable()
export class TingwuService {
  private readonly logger = new Logger(TingwuService.name);
  private readonly appKey: string;
  private readonly client: TingwuClient;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get("tingwu");

    this.appKey = config.appKey;

    const openApiConfig = new $OpenApi.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      regionId: config.region,
      endpoint: config.endpoint,
    });

    this.client = new TingwuClient(openApiConfig);
  }

  async createRealtimeTask(body: { meetingId: string; topic?: string }) {
    try {
      const request = new CreateTaskRequest({
        appKey: this.appKey,
        type: "realtime",
        input: new CreateTaskRequestInput({
          sourceLanguage: "cn",
          format: "aac",
          sampleRate: 16000,
          taskKey: body.meetingId,
        }),
        parameters: new CreateTaskRequestParameters({
          transcription: new CreateTaskRequestParametersTranscription({
            outputLevel: 2,
            diarizationEnabled: true,
            diarization:
              new CreateTaskRequestParametersTranscriptionDiarization({
                speakerCount: 0,
              }),
          }),
          summarizationEnabled: true,
          summarization: new CreateTaskRequestParametersSummarization({
            types: {
              Paragraph: true,
              Conversational: true,
            },
          }),
          meetingAssistanceEnabled: true,
          meetingAssistance:
            new CreateTaskRequestParametersMeetingAssistance({
              types: ["Keywords", "Todo", "Important"],
            }),
          autoChaptersEnabled: true,
        }),
      });

      const response = await this.client.createTask(request);
      const data = (response.body?.data ?? {}) as Record<string, any>;

      const taskId = data.TaskId ?? data.taskId;
      let meetingJoinUrl =
        data.MeetingJoinUrl ??
        data.meetingJoinUrl ??
        data.MeetingJoinUrlWs ??
        data.meetingJoinUrlWs;

      if (!meetingJoinUrl && taskId) {
        meetingJoinUrl = await this.waitForMeetingJoinUrl(taskId);
      }

      if (!taskId || !meetingJoinUrl) {
        this.logger.error(
          `Realtime task created but missing essential data: ${JSON.stringify(
            data
          )}`
        );
        throw new InternalServerErrorException(
          "Realtime task missing required fields"
        );
      }

      return {
        taskId,
        meetingJoinUrl,
      };
    } catch (error) {
      this.logger.error(
        "Failed to create realtime task",
        (error as any)?.body ?? error
      );
      throw new InternalServerErrorException("Create realtime task failed");
    }
  }

  async triggerCustomPrompt(taskId: string, type: "inner_os" | "brainstorm") {
    const prompt =
      type === "inner_os"
        ? {
            Title: "内心OS",
            Prompt:
              '基于最近2分钟发言，用第一人称生成3条内心独白，输出JSON数组[{ "emotion": "...", "thought": "..." }]',
            ContextWindowMinutes: 2,
          }
        : {
            Title: "头脑风暴",
            Prompt:
              '结合最近5分钟对话与会议要点，输出不少于3条创意，格式[{ "idea": "...", "rationale": "...", "references": [] }]',
            ContextWindowMinutes: 5,
          };

    try {
      const runtime = new $Util.RuntimeOptions({});
      const headers: Record<string, string> = {};
      const body = {
        CustomPromptEnabled: true,
        CustomPrompt: prompt,
      };
      const request = new $OpenApi.OpenApiRequest({
        headers,
        body: OpenApiUtil.parseToMap(body),
      });
      const params = new $OpenApi.Params({
        action: "SubmitCustomPrompt",
        version: "2023-09-30",
        protocol: "HTTPS",
        pathname: `/openapi/tingwu/v2/tasks/${taskId}/custom-prompt`,
        method: "POST",
        authType: "AK",
        style: "ROA",
        reqBodyType: "json",
        bodyType: "json",
      });
      const response = await this.client.callApi(params, request, runtime);
      return response.body;
    } catch (error) {
      this.logger.error(
        "Failed to trigger custom prompt",
        (error as any)?.body ?? error
      );
      throw new InternalServerErrorException("Trigger custom prompt failed");
    }
  }

  async getTaskSnapshot(taskId: string) {
    try {
      const response = await this.client.getTaskInfo(taskId);
      const data = (response.body?.data ?? response.body?.Data ?? {}) as any;
      const taskStatus =
        data.TaskStatus ??
        data.taskStatus ??
        data.Status ??
        data.status ??
        undefined;
      if (taskStatus && taskStatus !== "ONGOING") {
        this.logger.debug(`Task ${taskId} current status: ${taskStatus}`);
      }
      const transcription =
        data.Transcription?.Paragraphs?.map((item: any) => ({
          id: item.ParagraphId,
          speakerId: item.SpeakerId,
          startMs: item.Words?.[0]?.Start ?? 0,
          endMs: item.Words?.[item.Words.length - 1]?.End ?? 0,
          text: item.Words?.map((word: any) => word.Text).join("") ?? "",
        })) ?? [];

      const summaries: any[] = [];
      if (data.Summarization?.Paragraph) {
        summaries.push({
          id: `${taskId}-paragraph`,
          type: "paragraph",
          title: "全文摘要",
          content: data.Summarization.Paragraph?.Content ?? "",
          updatedAt: new Date().toISOString(),
        });
      }
      if (data.Summarization?.Conversational) {
        summaries.push({
          id: `${taskId}-conversational`,
          type: "conversational",
          title: "发言总结",
          content: data.Summarization.Conversational?.map(
            (item: any) => `${item.SpeakerId}: ${item.Content}`
          ),
          updatedAt: new Date().toISOString(),
        });
      }
      if (data.MeetingAssistance?.Keywords) {
        summaries.push({
          id: `${taskId}-keywords`,
          type: "keywords",
          title: "关键词",
          content: data.MeetingAssistance.Keywords,
          updatedAt: new Date().toISOString(),
        });
      }
      if (data.AutoChapters) {
        summaries.push({
          id: `${taskId}-chapters`,
          type: "chapter",
          title: "章节速览",
          content: data.AutoChapters?.map(
            (item: any) => `${item.StartTime}s ${item.Title}`
          ),
          updatedAt: new Date().toISOString(),
        });
      }

      return {
        transcription,
        summaries,
        taskStatus,
      };
    } catch (error) {
      this.logger.error(
        "Failed to fetch task snapshot",
        (error as any)?.body ?? error
      );
      throw new InternalServerErrorException("Fetch task snapshot failed");
    }
  }

  async stopRealtimeTask(taskId: string) {
    try {
      const request = new CreateTaskRequest({
        type: "realtime",
        operation: "stop",
        input: new CreateTaskRequestInput({
          taskId,
        }),
      });
      await this.client.createTask(request);
    } catch (error) {
      this.logger.error(
        `Failed to stop realtime task ${taskId}`,
        (error as any)?.body ?? error
      );
      throw new InternalServerErrorException("Stop realtime task failed");
    }
  }

  private async waitForMeetingJoinUrl(taskId: string) {
    const attempts = 5;
    for (let index = 0; index < attempts; index += 1) {
      const url = await this.fetchMeetingJoinUrl(taskId);
      if (url) {
        return url;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return undefined;
  }

  private async fetchMeetingJoinUrl(taskId: string) {
    try {
      const response = await this.client.getTaskInfo(taskId);
      const data = (response.body?.data ?? response.body?.Data ?? {}) as any;
      return this.extractMeetingJoinUrl(data);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch meeting join url for task ${taskId}`,
        (error as any)?.body ?? error
      );
      return undefined;
    }
  }

  private extractMeetingJoinUrl(
    data: any,
    seen: WeakSet<object> = new WeakSet()
  ): string | undefined {
    if (!data) return undefined;
    if (typeof data === "string") {
      if (data.startsWith("ws://") || data.startsWith("wss://")) {
        return data;
      }
      return undefined;
    }
    if (typeof data !== "object") {
      return undefined;
    }
    if (seen.has(data as object)) {
      return undefined;
    }
    seen.add(data as object);

    const direct =
      data?.MeetingJoinUrlWs ??
      data?.meetingJoinUrlWs ??
      data?.MeetingJoinUrl ??
      data?.meetingJoinUrl ??
      data?.RealtimeMeetingJoinUrl ??
      data?.realtimeMeetingJoinUrl ??
      data?.WsUrl ??
      data?.wsUrl;
    if (typeof direct === "string" && direct.length > 0) {
      return direct;
    }
    const nestedSources = [
      data?.MeetingInfo,
      data?.RealtimeMeeting,
      data?.meetingInfo,
      data?.realtimeMeeting,
    ];
    for (const source of nestedSources) {
      const value = this.extractMeetingJoinUrl(source, seen);
      if (value) return value;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        const nested = this.extractMeetingJoinUrl(item, seen);
        if (nested) return nested;
      }
      return undefined;
    }

    for (const value of Object.values(data)) {
      const nested = this.extractMeetingJoinUrl(value, seen);
      if (nested) return nested;
    }

    return undefined;
  }
}
