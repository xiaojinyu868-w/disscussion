import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

type RecorderStatus = "idle" | "recording" | "stopped";

export const useRecorder = (onChunk: (arrayBuffer: ArrayBuffer) => void) => {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const recordingRef = useRef<Audio.Recording | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const start = async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) throw new Error("Microphone permission denied");

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await recording.startAsync();
    recordingRef.current = recording;
    setStatus("recording");

    tickRef.current = setInterval(async () => {
      if (!recordingRef.current) return;
      try {
        const uri = recordingRef.current.getURI();
        if (!uri) return;
        const file = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const buffer = Uint8Array.from(atob(file), (c) => c.charCodeAt(0))
          .buffer;
        onChunk(buffer);
      } catch (error) {
        console.warn("Failed to read audio chunk", error);
      }
    }, 1000);
  };

  const stop = async () => {
    if (!recordingRef.current) return;

    clearTick();
    await recordingRef.current.stopAndUnloadAsync();
    recordingRef.current = null;
    setStatus("stopped");
  };

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTick();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => null);
        recordingRef.current = null;
      }
    };
  }, []);

  return {
    status,
    start,
    stop,
  };
};
