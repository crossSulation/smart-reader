import { SkipPrevious, PlayArrow, Pause, SkipNext, Stop } from "@mui/icons-material";
import type { TTSState } from "../hooks/useTTS";

interface TTSControlBarProps {
  tts: TTSState & {
    pause: () => void;
    resume: () => void;
    stop: () => void;
    skipForward: () => void;
    skipBackward: () => void;
    changeSpeed: (s: number) => void;
    changeVoice: (v: SpeechSynthesisVoice) => void;
  };
}

export default function TTSControlBar({ tts }: TTSControlBarProps) {
  if (tts.status === "idle") return null;

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => tts.skipBackward()}
          className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Skip backward"
        >
          <SkipPrevious fontSize="small" />
        </button>

        {tts.status === "playing" ? (
          <button
            type="button"
            onClick={() => tts.pause()}
            className="rounded-full bg-blue-600 p-1.5 text-white hover:bg-blue-700"
            title="Pause"
          >
            <Pause fontSize="small" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => tts.resume()}
            className="rounded-full bg-blue-600 p-1.5 text-white hover:bg-blue-700"
            title="Resume"
          >
            <PlayArrow fontSize="small" />
          </button>
        )}

        <button
          type="button"
          onClick={() => tts.skipForward()}
          className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Skip forward"
        >
          <SkipNext fontSize="small" />
        </button>

        <button
          type="button"
          onClick={() => tts.stop()}
          className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Stop"
        >
          <Stop fontSize="small" />
        </button>

        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          {tts.sentenceIndex + 1} / {tts.totalSentences}
        </span>

        <select
          value={tts.speed}
          onChange={(e) => tts.changeSpeed(Number(e.target.value))}
          className="ml-auto rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          title="Speed"
        >
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>

        {tts.voices.length > 1 && (
          <select
            value={tts.voice?.voiceURI ?? ""}
            onChange={(e) => {
              const v = tts.voices.find((v) => v.voiceURI === e.target.value);
              if (v) tts.changeVoice(v);
            }}
            className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            title="Voice"
          >
            {tts.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
