import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosRequestConfig } from "axios";

type RealtimeTaskResponse = {
  Data: {
    TaskId: string;
    MeetingJoinUrl: string;
  };
};

@Injectable()
export class TingwuService {
  private readonly logger = new Logger(TingwuService.name);
  private readonly baseUrl: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly accessKeySecret: string;
  private readonly appKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService
  ) {
    const config = this.configService.get("tingwu");
    this.baseUrl = config.baseUrl;
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.appKey = config.appKey;
  }

  async createRealtimeTask(body: { meetingId: string; topic?: string }) {
    try {
      const response = await this.http.axiosRef.put<RealtimeTaskResponse>(
        `${this.baseUrl}/openapi/tingwu/v2/tasks?type=realtime`,
        {
          AppKey: this.appKey,
          Input: {
            SourceLanguage: "cn",
            Format: "pcm",
            SampleRate: 16000,
            TaskKey: body.meetingId,
          },
          Parameters: {
            Transcription: {
              OutputLevel: 2,
              DiarizationEnabled: true,
              Diarization: {
                SpeakerCount: 0,
              },
            },
            SummarizationEnabled: true,
            Summarization: {
              Types: ["Paragraph", "Conversational"],
            },
            MeetingAssistanceEnabled: true,
            AutoChaptersEnabled: true,
          },
        },
        this.requestConfig()
      );

      return {
        taskId: response.data.Data.TaskId,
        meetingJoinUrl: response.data.Data.MeetingJoinUrl,
      };
    } catch (error) {
      this.logger.error("Failed to create realtime task", error);
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
      const response = await this.http.axiosRef.post(
        `${this.baseUrl}/openapi/tingwu/v2/tasks/${taskId}/custom-prompt`,
        {
          CustomPromptEnabled: true,
          CustomPrompt: prompt,
        },
        this.requestConfig()
      );
      return response.data;
    } catch (error) {
      this.logger.error("Failed to trigger custom prompt", error);
      throw new InternalServerErrorException("Trigger custom prompt failed");
    }
  }

  async getTaskSnapshot(taskId: string) {
    try {
      const response = await this.http.axiosRef.get(
        `${this.baseUrl}/openapi/tingwu/v2/tasks/${taskId}`,
        this.requestConfig()
      );
      const data = response.data?.Data ?? {};
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
      };
    } catch (error) {
      this.logger.error("Failed to fetch task snapshot", error);
      throw new InternalServerErrorException("Fetch task snapshot failed");
    }
  }

  private requestConfig(): AxiosRequestConfig {
    return {
      headers: {
        "x-acs-region-id": this.region,
        "x-acs-access-key-id": this.accessKeyId,
        "x-acs-access-key-secret": this.accessKeySecret,
        "Content-Type": "application/json",
      },
    };
  }
}
