import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useSessionStore } from "@/store/useSessionStore";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { useTingwuRealtime } from "@/hooks/useTingwuRealtime";
import { useRecorder } from "@/hooks/useRecorder";
import { useEffect, useState } from "react";
import TranscriptionList from "@/components/TranscriptionList";
import SummaryList from "@/components/SummaryList";
import { sessionApi } from "@/api/session";

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
  } = useSessionStore();
  const { startStreaming } = useTingwuRealtime({
    onConnectionError: () => toggleRecording(false),
  });
  const recorder = useRecorder(async (buffer) => {
    await startStreaming(buffer);
  });
  const [activeTab, setActiveTab] = useState<"transcription" | "summary">(
    "transcription"
  );
  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // TODO: fetch session task info from backend
    const bootstrap = async () => {
      if (taskId) return;
      try {
        // TODO: call backend
        const response = await sessionApi.create();
        setTask(response.sessionId, response.taskId, response.meetingJoinUrl);
      } catch (error) {
        console.error("Failed to create session", error);
      }
    };
    bootstrap();
  }, [setTask, taskId]);

  const handleRecordToggle = async () => {
    if (recorder.status === "recording") {
      await recorder.stop();
      toggleRecording(false);
    } else {
      await recorder.start();
      toggleRecording(true);
    }
  };

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
      useSessionStore.getState().upsertSummaryCards(summaries.summaries);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSkillTrigger = async (skill: "inner_os" | "brainstorm") => {
    if (skillState[skill] === "loading") return;
    useSessionStore.getState().setSkillState(skill, "loading");
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
  };

  return (
    <View style={styles.container}>
      <View style={styles.recorderCard}>
        <View style={styles.waveform} />
        <Text style={styles.timerText}>{isRecording ? "27:40" : "00:00"}</Text>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.iconText}>⏱️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordingActive,
            ]}
            onPress={handleRecordToggle}
          >
            <Text style={styles.iconText}>{isRecording ? "⏹" : "⏺"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        <Text
          style={[
            styles.tab,
            activeTab === "transcription" && styles.tabActive,
          ]}
          onPress={() => setActiveTab("transcription")}
        >
          实时转写
        </Text>
        <Text
          style={[styles.tab, activeTab === "summary" && styles.tabActive]}
          onPress={() => setActiveTab("summary")}
        >
          AI总结
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === "transcription" ? (
          <TranscriptionList segments={transcription} />
        ) : (
          <SummaryList cards={summaryCards} />
        )}
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
    </View>
  );
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
    backgroundColor: colors.background,
    paddingTop: 32,
  },
  recorderCard: {
    backgroundColor: colors.panel,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
  },
  waveform: {
    width: "100%",
    height: 80,
    backgroundColor: "#2B2B30",
    borderRadius: 16,
    marginBottom: 12,
  },
  timerText: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  controls: {
    flexDirection: "row",
    gap: 16,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    backgroundColor: "#2B2B30",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  recordButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingActive: {
    backgroundColor: "#FF7875",
  },
  iconText: {
    color: colors.textPrimary,
    fontSize: 20,
  },
  tabs: {
    flexDirection: "row",
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: colors.tabBackground,
    borderRadius: 16,
    padding: 6,
  },
  tab: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    color: "#8D7F6A",
  },
  tabActive: {
    backgroundColor: colors.tabActive,
    color: "#4C3B24",
    fontWeight: "600",
  },
  content: {
    flex: 1,
    marginTop: 16,
    paddingHorizontal: 20,
  },
  skillPanel: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.panel,
    padding: 16,
    borderRadius: 20,
  },
  skillButton: {
    backgroundColor: colors.tabBackground,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skillButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: "#4C3B24",
  },
});

export default HomeScreen;
