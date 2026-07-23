import { useState, useRef, useCallback, useEffect } from "react";

const isSupported = typeof window !== "undefined"
  && typeof window.speechSynthesis !== "undefined"
  && typeof window.SpeechSynthesisUtterance !== "undefined";

const CHINESE_VOICE_PATTERN = /zh[-_]CN|chinese|mandarin|中文/i;

let voicesCache: SpeechSynthesisVoice[] | null = null;

function getVoices(): SpeechSynthesisVoice[] {
  if (!isSupported) return [];
  if (voicesCache && voicesCache.length > 0) return voicesCache;
  voicesCache = speechSynthesis.getVoices();
  return voicesCache;
}

export function getChineseVoices(): SpeechSynthesisVoice[] {
  const voices = getVoices();
  return voices.filter((v) => CHINESE_VOICE_PATTERN.test(v.lang));
}

function splitSentences(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inParen = 0;

  for (const ch of text) {
    current += ch;
    if (ch === "(" || ch === "（") inParen++;
    if (ch === ")" || ch === "）") inParen = Math.max(0, inParen - 1);
    if (inParen === 0 && /[。！？!?；;\n]/.test(ch)) {
      const s = current.trim();
      if (s.length > 0) result.push(s);
      current = "";
    }
  }

  const rest = current.trim();
  if (rest.length > 0) result.push(rest);
  return result.filter((s) => s.length > 0);
}

export interface TTSState {
  status: "idle" | "playing" | "paused";
  sentenceIndex: number;
  totalSentences: number;
  speed: number;
  voice: SpeechSynthesisVoice | null;
  voices: SpeechSynthesisVoice[];
  supported: boolean;
}

export default function useTTS() {
  const [status, setStatus] = useState<TTSState["status"]>("idle");
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [totalSentences, setTotalSentences] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getChineseVoices());

  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isStoppedRef = useRef(false);

  useEffect(() => {
    if (!isSupported) return;
    const updateVoices = () => {
      voicesCache = speechSynthesis.getVoices();
      const zh = getChineseVoices();
      setVoices(zh);
      if (!voice && zh.length > 0) setVoice(zh[0]);
    };
    updateVoices();
    speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  const speakImpl = useCallback(
    (text: string, idx: number) => {
      if (isStoppedRef.current) return;
      if (idx >= sentencesRef.current.length) {
        setStatus("idle");
        setSentenceIndex(0);
        return;
      }

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = voice?.lang ?? "zh-CN";
      utter.rate = speed;
      utter.volume = 1;
      if (voice) utter.voice = voice;

      utter.onstart = () => {
        setSentenceIndex(idx);
        currentIndexRef.current = idx;
      };

      utter.onend = () => {
        if (!isStoppedRef.current) {
          const nextIdx = idx + 1;
          speakImpl(sentencesRef.current[nextIdx] ?? "", nextIdx);
        }
      };

      utter.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("TTS error:", e.error);
          setStatus("idle");
        }
      };

      speechSynthesis.speak(utter);
    },
    [speed, voice],
  );

  const play = useCallback(
    (text: string, startIndex = 0) => {
      if (!isSupported) return;
      speechSynthesis.cancel();
      isStoppedRef.current = false;

      const sentences = splitSentences(text);
      if (sentences.length === 0) return;

      sentencesRef.current = sentences;
      setTotalSentences(sentences.length);
      setStatus("playing");

      setTimeout(() => speakImpl(sentences[startIndex] ?? "", startIndex), 50);
    },
    [speakImpl],
  );

  const pause = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.resume();
    setStatus("playing");
  }, []);

  const stop = useCallback(() => {
    if (!isSupported) return;
    isStoppedRef.current = true;
    speechSynthesis.cancel();
    setStatus("idle");
    setSentenceIndex(0);
    setTotalSentences(0);
  }, []);

  const skipForward = useCallback(() => {
    if (!isSupported) return;
    const idx = Math.min(currentIndexRef.current + 1, sentencesRef.current.length - 1);
    isStoppedRef.current = true;
    speechSynthesis.cancel();
    isStoppedRef.current = false;
    setTimeout(() => speakImpl(sentencesRef.current[idx] ?? "", idx), 50);
  }, [speakImpl]);

  const skipBackward = useCallback(() => {
    if (!isSupported) return;
    const idx = Math.max(currentIndexRef.current - 2, 0);
    isStoppedRef.current = true;
    speechSynthesis.cancel();
    isStoppedRef.current = false;
    setTimeout(() => speakImpl(sentencesRef.current[idx] ?? "", idx), 50);
  }, [speakImpl]);

  const changeSpeed = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      if (status === "playing") {
        const idx = currentIndexRef.current;
        isStoppedRef.current = true;
        speechSynthesis.cancel();
        isStoppedRef.current = false;
        setTimeout(() => {
          speakImpl(sentencesRef.current[idx] ?? "", idx);
        }, 50);
      }
    },
    [status, speakImpl],
  );

  const changeVoice = useCallback(
    (newVoice: SpeechSynthesisVoice) => {
      setVoice(newVoice);
      if (status === "playing") {
        const idx = currentIndexRef.current;
        isStoppedRef.current = true;
        speechSynthesis.cancel();
        isStoppedRef.current = false;
        setTimeout(() => {
          speakImpl(sentencesRef.current[idx] ?? "", idx);
        }, 50);
      }
    },
    [status, speakImpl],
  );

  return {
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    changeSpeed,
    changeVoice,
    status,
    sentenceIndex,
    totalSentences,
    speed,
    voice,
    voices,
    supported: isSupported,
  };
}
