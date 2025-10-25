﻿import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "@/store/useSessionStore";
import { colors, gradients } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useRecorder } from "@/hooks/useRecorder";
import { useAudioUploader } from "@/hooks/useAudioUploader";
import TranscriptionList from "@/components/TranscriptionList";
import SummaryList from "@/components/SummaryList";
import { sessionApi } from "@/api/session";

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const HomeScreen = () => {
  const {
    sessionId,
    transcription,
    summaryCards,
    isRecording,
    toggleRecording,
    setTask,
    taskId,
    skillState,
    taskStatus,
  } = useSessionStore();

  const { uploadChunk } = useAudioUploader();
  const recorder = useRecorder(async (chunk) => {
    if (!sessionId) return false;
    try {
      await uploadChunk(chunk.base64);
      return true;
    } catch (error) {
      console.warn("Failed to upload chunk", error);
      return false;
    }
  });

  const waveformAnim = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<"transcription" | "summary">(
    "transcription"
  );
  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (taskId) return;
    const bootstrap = async () => {
      try {
        const response = await sessionApi.create();
        setTask(response.sessionId, response.taskId, response.meetingJoinUrl);
      } catch (error) {
        console.error("Failed to create session", error);
      }
    };
    bootstrap();
  }, [setTask, taskId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let polling = false;

    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const transcripts = await sessionApi.fetchTranscripts(sessionId);
        useSessionStore.getState().appendTranscription(
          transcripts.transcription
        );
        useSessionStore.getState().setTaskStatus(transcripts.taskStatus);
        const summaries = await sessionApi.fetchSummaries(sessionId);
        useSessionStore.getState().upsertSummaryCards(summaries.summaries);
      } catch (error) {
        console.warn("Failed to poll session updates", error);
      } finally {
        polling = false;
      }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  useEffect(() => {
    Animated.spring(waveformAnim, {
      toValue: recorder.level,
      useNativeDriver: true,
      damping: 12,
      stiffness: 120,
      mass: 0.7,
    }).start();
  }, [recorder.level, waveformAnim]);

  const remoteStatusHint = useMemo(() => {
    switch (taskStatus) {
      case "NEW":
        return "已连接听悟，正在等待音频…";
      case "PAUSED":
        return "听悟任务已暂停";
      case "FAILED":
        return "听悟任务失败，请检查网络";
      case "COMPLETED":
        return "听悟任务已完成";
      default:
        return undefined;
    }
  }, [taskStatus]);

  const statusMeta = useMemo(() => {
    if (recorder.status === "recording") {
      return { label: "录制进行中", tone: colors.success };
    }
    if (recorder.status === "paused") {
      return { label: "录制已暂停", tone: colors.warning };
    }
    if (taskStatus === "FAILED") {
      return { label: "连接异常", tone: "#F87171" };
    }
    if (taskStatus === "COMPLETED") {
      return { label: "任务已结束", tone: colors.textMuted };
    }
    if (taskStatus === "ONGOING") {
      return { label: "同步中", tone: colors.success };
    }
    return { label: "等待开始", tone: colors.textMuted };
  }, [taskStatus, recorder.status]);

  const recordingHint = useMemo(() => {
    if (remoteStatusHint && taskStatus !== "ONGOING") {
      return remoteStatusHint;
    }
    if (recorder.status === "recording") {
      return recorder.level < 0.1
        ? "未检测到声音，请靠近麦克风"
        : "正在捕获声音…";
    }
    if (recorder.status === "paused") {
      return "录音已暂停";
    }
    if (recorder.status === "stopped") {
      return "录音已停止";
    }
    return "准备录音";
  }, [remoteStatusHint, taskStatus, recorder.status, recorder.level]);

  const handleRecordToggle = async () => {
    if (recorder.status === "recording" || recorder.status === "paused") {
      await recorder.stop();
      toggleRecording(false);
      if (sessionId) {
        try {
          await sessionApi.complete(sessionId);
        } catch (error) {
          console.warn("Failed to complete session", error);
        }
      }
      return;
    }
    if (!sessionId) {
      try {
        const response = await sessionApi.create();
        setTask(response.sessionId, response.taskId, response.meetingJoinUrl);
      } catch (error) {
        console.error("Failed to initialize session before recording", error);
        return;
      }
    }
    try {
      await recorder.start();
      toggleRecording(true);
    } catch (error) {
      console.error("Failed to start recording", error);
    }
  };

  const handlePauseResume = async () => {
    if (recorder.status === "recording") {
      await recorder.pause();
      toggleRecording(false);
    } else if (recorder.status === "paused") {
      await recorder.resume();
      toggleRecording(true);
    }
  };

  const isPauseResumeDisabled =
    recorder.status === "idle" || recorder.status === "stopped";

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (!sessionId) return;
      const [transcripts, summaries] = await Promise.all([
        sessionApi.fetchTranscripts(sessionId),
        sessionApi.fetchSummaries(sessionId),
      ]);
      useSessionStore.getState().appendTranscription(
        transcripts.transcription
      );
      useSessionStore.getState().setTaskStatus(transcripts.taskStatus);
      useSessionStore.getState().upsertSummaryCards(summaries.summaries);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <LinearGradient colors={gradients.canvas} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <LinearGradient colors={gradients.hero} style={styles.heroGlow} />
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
        >
          <LinearGradient colors={gradients.panel} style={styles.recorderCard}>
            <View style={styles.recorderHeader}>
              <Text style={styles.sessionTitle}>会议快照</Text>
              <View style={styles.statusPill}>
                <View
                  style={[styles.statusDot, { backgroundColor: statusMeta.tone }]}
                />
                <Text style={styles.statusText}>{statusMeta.label}</Text>
              </View>
            </View>
          <View style={styles.timeMeta}>
            <Text style={styles.timerText}>
              {formatDuration(recorder.elapsedMs)}
            </Text>
            <Text style={styles.clockText}>
              {new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Text style={styles.tagline}>让每一次讨论都有清晰复盘</Text>
          <View style={styles.waveformWrap}>
            <Animated.View
                style={[
                  styles.waveform,
                  {
                    transform: [
                      {
                        scaleY: waveformAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.35, 1],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <Text style={styles.recordingHint}>{recordingHint}</Text>
            <View style={styles.controls}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  isPauseResumeDisabled && styles.secondaryButtonDisabled,
                ]}
                onPress={handlePauseResume}
                disabled={isPauseResumeDisabled}
              >
                <Text style={styles.secondaryLabel}>
                  {recorder.status === "paused" ? "继续录制" : "暂时暂停"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRecordToggle}>
                <LinearGradient
                  colors={gradients.accent}
                  style={[
                    styles.recordButton,
                    isRecording && styles.recordButtonActive,
                  ]}
                >
                  <Text style={styles.recordButtonText}>
                    {isRecording ? "停止录音" : "开始录音"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={styles.tab}
              activeOpacity={0.95}
              onPress={() => setActiveTab("transcription")}
            >
              <LinearGradient
                colors={
                  activeTab === "transcription"
                    ? gradients.tab
                    : ["transparent", "transparent"]
                }
                style={[
                  styles.tabInner,
                  activeTab === "transcription" && styles.tabActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === "transcription" && styles.tabLabelActive,
                  ]}
                >
                  实时转写
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tab}
              activeOpacity={0.95}
              onPress={() => setActiveTab("summary")}
            >
              <LinearGradient
                colors={
                  activeTab === "summary"
                    ? gradients.tab
                    : ["transparent", "transparent"]
                }
                style={[
                  styles.tabInner,
                  activeTab === "summary" && styles.tabActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === "summary" && styles.tabLabelActive,
                  ]}
                >
                  AI 总结
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {activeTab === "transcription" ? (
              <TranscriptionList segments={transcription} />
            ) : (
              <SummaryList cards={summaryCards} />
            )}
          </View>
        </ScrollView>

        <View style={styles.skillPanel}>
          <SkillButton
            label="内心OS"
            state={skillState.inner_os}
            onPress={() => handleSkillTrigger("inner_os")}
          />
          <SkillButton
            label="头脑风暴"
            state={skillState.brainstorm}
            onPress={() => handleSkillTrigger("brainstorm")}
          />
          <SkillButton label="别再说了" state="idle" onPress={() => {}} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  function handleSkillTrigger(skill: "inner_os" | "brainstorm") {
    if (skillState[skill] === "loading") return;
    useSessionStore.getState().setSkillState(skill, "loading");
    (async () => {
      try {
        if (!sessionId) throw new Error("Session not initialized");
        const response = await sessionApi.triggerSkill(sessionId, skill);
        if (response.cards?.length) {
          useSessionStore.getState().upsertSummaryCards(response.cards);
          setActiveTab("summary");
        }
        useSessionStore.getState().setSkillState(skill, "success");
      } catch (error) {
        console.error(error);
        useSessionStore.getState().setSkillState(skill, "error");
      } finally {
        setTimeout(() => {
          useSessionStore.getState().setSkillState(skill, "idle");
        }, 2000);
      }
    })();
  }
};

const SkillButton = ({
  label,
  onPress,
  state,
}: {
  label: string;
  state: "idle" | "loading" | "success" | "error";
  onPress: () => void;
}) => {
  let indicator = "";
  if (state === "loading") indicator = " …";
  if (state === "success") indicator = " ✓";
  if (state === "error") indicator = " ⚠️";

  return (
    <TouchableOpacity style={styles.skillButton} onPress={onPress}>
      <LinearGradient colors={gradients.skill} style={styles.skillBadge}>
        <Text style={styles.skillBadgeText}>{label.slice(0, 1)}</Text>
      </LinearGradient>
      <Text style={styles.skillButtonText}>
        {label}
        {indicator}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  heroGlow: {
    position: "absolute",
    top: -140,
    left: -120,
    right: -120,
    height: 280,
    borderRadius: 260,
    opacity: 0.9,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 220,
  },
  recorderCard: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 34,
    paddingHorizontal: 28,
    paddingVertical: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
    shadowColor: "#D2DAF3",
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 28 },
    elevation: 16,
  },
  recorderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  sessionTitle: {
    ...typography.display,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.accentMuted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    ...typography.label,
    color: colors.textPrimary,
  },
  timeMeta: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  timerText: {
    ...typography.display,
    color: colors.textPrimary,
    fontSize: 34,
  },
  clockText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  tagline: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 10,
  },
  waveformWrap: {
    marginTop: 26,
    marginBottom: 22,
    height: 88,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#E1E6FF",
  },
  waveform: {
    flex: 1,
    backgroundColor: colors.accent,
    opacity: 0.55,
  },
  recordingHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 24,
    width: "100%",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
  },
  secondaryButtonDisabled: {
    opacity: 0.45,
  },
  secondaryLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  recordButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 24,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 10,
  },
  recordButtonActive: {
    shadowOpacity: 0.38,
  },
  recordButtonText: {
    ...typography.body,
    color: colors.accentContrast,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    marginTop: 28,
    marginHorizontal: 20,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 24,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
  },
  tab: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  tabInner: {
    borderRadius: 18,
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: colors.tabActive,
  },
  tabLabel: {
    ...typography.subheading,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.accentContrast,
  },
  content: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  skillPanel: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    flexDirection: "row",
    backgroundColor: colors.panel,
    padding: 18,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
    shadowColor: "#1B2B42",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
    elevation: 9,
  },
  skillButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundAlt,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.panelBorder,
  },
  skillBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  skillBadgeText: {
    ...typography.label,
    color: colors.accentContrast,
  },
  skillButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});

export default HomeScreen;


















