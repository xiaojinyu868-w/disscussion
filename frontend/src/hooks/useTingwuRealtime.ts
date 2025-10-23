import { useEffect, useRef } from "react";
import { useSessionStore } from "@/store/useSessionStore";

type RealtimeMessage =
  | {
      type: "transcription";
      payload: {
        id: string;
        speakerId: string;
        startMs: number;
        endMs: number;
        text: string;
      };
    }
  | {
      type: "summary";
      payload: {
        id: string;
        summaryType: string;
        title?: string;
        content: string | string[];
        updatedAt: string;
      };
    };

type Options = {
  onConnectionError?: (error: Error) => void;
};

export const useTingwuRealtime = ({ onConnectionError }: Options = {}) => {
  const meetingJoinUrl = useSessionStore((state) => state.meetingJoinUrl);
  const appendTranscription = useSessionStore(
    (state) => state.appendTranscription
  );
  const upsertSummaryCards = useSessionStore(
    (state) => state.upsertSummaryCards
  );
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const startStreaming = async (audioChunk: ArrayBuffer) => {
    if (!meetingJoinUrl) return;
    const socket = ensureSocket();
    if (!socket) return;
    socket.send(audioChunk);
  };

  const ensureSocket = () => {
    if (!meetingJoinUrl) return null;

    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      return socketRef.current;
    }

    const ws = new WebSocket(meetingJoinUrl);

    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      try {
        const message: RealtimeMessage = JSON.parse(event.data);
        if (message.type === "transcription") {
          appendTranscription([message.payload]);
        } else if (message.type === "summary") {
          upsertSummaryCards([
            {
              id: message.payload.id,
              type: message.payload.summaryType as any,
              title: message.payload.title,
              content: message.payload.content,
              updatedAt: message.payload.updatedAt,
            },
          ]);
        }
      } catch (error) {
        console.warn("Failed to parse realtime message", error);
      }
    };

    ws.onerror = (event) => {
      console.error("Realtime socket error", event);
      onConnectionError?.(new Error("Realtime connection error"));
    };

    ws.onclose = () => {
      clearHeartbeat();
      socketRef.current = null;
      // Auto-reconnect
      setTimeout(() => {
        ensureSocket();
      }, 2000);
    };

    ws.onopen = () => {
      heartbeatRef.current = setInterval(() => {
        if (
          socketRef.current &&
          socketRef.current.readyState === WebSocket.OPEN
        ) {
          socketRef.current.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);
    };

    socketRef.current = ws;
    return ws;
  };

  const clearHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  useEffect(() => {
    if (!meetingJoinUrl) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      clearHeartbeat();
      return;
    }

    ensureSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      clearHeartbeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingJoinUrl]);

  return {
    startStreaming,
  };
};
