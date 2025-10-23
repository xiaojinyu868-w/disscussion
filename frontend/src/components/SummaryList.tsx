import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { SummaryCard } from "@/store/useSessionStore";

type Props = {
  cards: SummaryCard[];
};

const SummaryList = ({ cards }: Props) => {
  if (!cards.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>等待 AI 总结更新...</Text>
      </View>
    );
  }

  return (
    <>
      {cards.map((card) => (
        <View key={card.id} style={styles.card}>
          {card.title ? (
            <Text style={styles.title}>{card.title}</Text>
          ) : null}
          {renderContent(card.content)}
          <Text style={styles.timestamp}>{card.updatedAt}</Text>
        </View>
      ))}
    </>
  );
};

const renderContent = (content: string | string[] | Record<string, unknown>) => {
  if (Array.isArray(content)) {
    return content.map((item, index) => (
      <Text key={index} style={styles.body}>
        • {item}
      </Text>
    ));
  }
  if (typeof content === "object" && content !== null) {
    return Object.entries(content).map(([key, value]) => (
      <Text key={key} style={styles.body}>
        {key}: {String(value)}
      </Text>
    ));
  }
  return <Text style={styles.body}>{content}</Text>;
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
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    ...typography.heading,
    color: "#4C3B24",
    marginBottom: 8,
  },
  body: {
    ...typography.body,
    color: "#463C2B",
    marginBottom: 6,
  },
  timestamp: {
    ...typography.caption,
    marginTop: 8,
  },
});

export default SummaryList;
