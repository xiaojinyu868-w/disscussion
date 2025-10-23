import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { SpeakerSegment } from "@/store/useSessionStore";

type Props = {
  segments: SpeakerSegment[];
};

const TranscriptionList = ({ segments }: Props) => {
  if (!segments.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>等待实时转写...</Text>
      </View>
    );
  }
  return (
    <>
      {segments.map((segment) => (
        <View style={styles.segment} key={segment.id}>
          <Text style={styles.segmentTimestamp}>
            {formatTimestamp(segment.startMs)}
          </Text>
          <Text style={styles.segmentText}>{segment.text}</Text>
        </View>
      ))}
    </>
  );
};

const formatTimestamp = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emptyText: {
    color: colors.textSecondary,
  },
  segment: {
    backgroundColor: colors.bubbleBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  segmentTimestamp: {
    ...typography.caption,
    marginBottom: 8,
  },
  segmentText: {
    ...typography.body,
    color: "#3E3830",
  },
});

export default TranscriptionList;
