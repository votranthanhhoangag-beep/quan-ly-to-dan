import { useCallback, useEffect, useRef, useState } from 'react';

export type TroLyVoiceMode = 'off' | 'waiting_name' | 'listening_command' | 'speaking';

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike {
  isFinal: boolean;
  0?: RecognitionAlternativeLike;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => RecognitionLike;

interface UseTroLyWakeOptions {
  onCommand: (commandText: string) => string | Promise<string>;
}

export const normalizeVi = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stopPhrases = ['ngung', 'tam dung', 'thoi khong thao tac', 'ngu di'];

const extractWakeRemainder = (transcript: string) => {
  const normalized = normalizeVi(transcript);
  const match = /^(?:(?:da|oi)\s+)?tro\s+ly(?:\s+oi)?\b\s*(.*)$/u.exec(normalized);
  return match ? match[1].trim() : null;
};

export function useTroLyWake({ onCommand }: UseTroLyWakeOptions) {
  const [mode, setMode] = useState<TroLyVoiceMode>('off');
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const modeRef = useRef<TroLyVoiceMode>('off');
  const activeRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const networkRetryIndexRef = useRef(0);
  const retryAttemptCountRef = useRef(0);
  const retryScheduledRef = useRef(false);
  const processingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakRef = useRef<(text: string, nextMode?: TroLyVoiceMode) => void>(() => undefined);
  const wakeAndListenRef = useRef<(remainder?: string) => void>(() => undefined);
  const runCommandRef = useRef<(commandText: string) => void>(() => undefined);
  const pendingWakeCommandRef = useRef('');

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const updateMode = useCallback((nextMode: TroLyVoiceMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const startRecognitionRef = useRef<() => void>(() => undefined);

  const scheduleRecognitionRestart = useCallback(() => {
    if (!activeRef.current || modeRef.current === 'speaking') return;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    if (retryAttemptCountRef.current >= 3) {
      retryScheduledRef.current = false;
      setError('Không thể kết nối nhận diện giọng nói sau 3 lần thử. Hãy kiểm tra kết nối rồi bật lại Trợ lý.');
      return;
    }
    retryAttemptCountRef.current += 1;
    retryScheduledRef.current = true;
    const delay = [2000, 4000, 8000][retryAttemptCountRef.current - 1];
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      startRecognitionRef.current();
    }, delay);
  }, []);

  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // Recognition may already be stopped.
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!activeRef.current ||
      recognitionRef.current ||
      modeRef.current === 'speaking') return;
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Trình duyệt chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Edge mới nhất.');
      activeRef.current = false;
      updateMode('off');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      networkRetryIndexRef.current = 0;
      if (retryScheduledRef.current) {
        retryScheduledRef.current = false;
      } else {
        retryAttemptCountRef.current = 0;
      }
      setError(current =>
        current.startsWith('Mất kết nối') || current.startsWith('Đang khởi tạo lại')
          ? ''
          : current
      );
    };

    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const resultItem = event.results[index];
        const transcript = resultItem.isFinal ? resultItem[0]?.transcript?.trim() : '';
        if (!transcript) continue;
        networkRetryIndexRef.current = 0;
        retryAttemptCountRef.current = 0;
        retryScheduledRef.current = false;
        setError(current => current.startsWith('Mất kết nối') ? '' : current);
        setHeard(transcript);

        if (modeRef.current === 'waiting_name') {
          const wakeRemainder = extractWakeRemainder(transcript);
          if (wakeRemainder === null) continue;
          stopRecognition();
          wakeAndListenRef.current(wakeRemainder || undefined);
          return;
        }

        if (modeRef.current === 'listening_command') {
          const wakeRemainder = extractWakeRemainder(transcript);
          const cleanCommand = wakeRemainder === null ? transcript.trim() : wakeRemainder;
          if (!cleanCommand) continue;
          const spoken = normalizeVi(cleanCommand);
          if (stopPhrases.some(phrase => spoken.includes(phrase))) {
            stopRecognition();
            speakRef.current('Dạ, em tạm ngưng.', 'waiting_name');
            break;
          }
          runCommandRef.current(cleanCommand);
          break;
        }
      }
    };

    recognition.onerror = event => {
      if (event.error === 'network') {
        networkRetryIndexRef.current += 1;
        const nextAttempt = retryAttemptCountRef.current + 1;
        const delay = [2000, 4000, 8000][Math.min(nextAttempt - 1, 2)];
        setError(`Mất kết nối nhận diện giọng nói. Lần thử ${Math.min(nextAttempt, 3)} sau ${delay / 1000} giây.`);
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Không có quyền sử dụng micro. Hãy cấp quyền trong trình duyệt rồi bật Trợ lý lại.');
        activeRef.current = false;
        updateMode('off');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Không thể nhận diện giọng nói (${event.error}).`);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!activeRef.current || modeRef.current === 'speaking') return;
      scheduleRecognitionRestart();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (startError) {
      recognitionRef.current = null;
      if (startError instanceof Error && startError.name === 'InvalidStateError') {
        setError('Đang khởi tạo lại nhận diện giọng nói.');
        scheduleRecognitionRestart();
      } else {
        setError(startError instanceof Error ? `Không thể khởi động micro: ${startError.message}` : 'Không thể khởi động micro.');
        activeRef.current = false;
        updateMode('off');
      }
    }
  }, [scheduleRecognitionRestart, stopRecognition, updateMode]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const playWakeTone = useCallback(() => {
    const AudioContextConstructor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const context = audioContextRef.current || new AudioContextConstructor();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      // Speech output remains available even if an AudioContext beep is blocked.
    }
  }, []);

  const finishSpeech = useCallback((nextMode: TroLyVoiceMode) => {
    updateMode(nextMode);
    const pendingCommand = pendingWakeCommandRef.current;
    if (activeRef.current && nextMode === 'listening_command' && pendingCommand) {
      pendingWakeCommandRef.current = '';
      runCommandRef.current(pendingCommand);
      return;
    }
    if (activeRef.current && nextMode !== 'off') scheduleRecognitionRestart();
  }, [scheduleRecognitionRestart, updateMode]);

  const speak = useCallback((text: string, nextMode: TroLyVoiceMode = 'listening_command') => {
    stopRecognition();
    recognitionRef.current = null;
    updateMode('speaking');
    setResult(text);

    const synthesis = window.speechSynthesis;
    if (!synthesis) {
      setError('Trình duyệt chưa hỗ trợ đọc phản hồi bằng giọng nói.');
      finishSpeech(nextMode);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    const vietnameseVoice = synthesis.getVoices().find(voice =>
      voice.lang.toLocaleLowerCase('vi').startsWith('vi'));
    if (vietnameseVoice) utterance.voice = vietnameseVoice;
    utterance.onend = () => finishSpeech(nextMode);
    utterance.onerror = () => finishSpeech(nextMode);
    synthesis.speak(utterance);
  }, [finishSpeech, stopRecognition, updateMode]);

  const wakeAndListen = useCallback((remainder?: string) => {
    playWakeTone();
    pendingWakeCommandRef.current = remainder?.trim() || '';
    speak('Trợ lý nghe, anh cần làm gì?', 'listening_command');
  }, [playWakeTone, speak]);

  const runCommand = useCallback((commandText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    void Promise.resolve(onCommandRef.current(commandText))
      .then(response => {
        setResult(response);
        speakRef.current(response, 'listening_command');
      })
      .catch(commandError => {
        const message = commandError instanceof Error ? commandError.message : 'Lỗi không xác định.';
        setError(`Không thể thực hiện lệnh: ${message}`);
        setResult(`Không thể thực hiện lệnh: ${message}`);
        speakRef.current('Em gặp lỗi khi thực hiện thao tác. Anh vui lòng thử lại.', 'listening_command');
      })
      .finally(() => {
        processingRef.current = false;
      });
  }, []);

  useEffect(() => {
    speakRef.current = speak;
    wakeAndListenRef.current = wakeAndListen;
    runCommandRef.current = runCommand;
  }, [runCommand, speak, wakeAndListen]);

  const toggle = useCallback(() => {
    if (activeRef.current) {
      activeRef.current = false;
      stopRecognition();
      recognitionRef.current = null;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setError('');
      updateMode('off');
      return;
    }
    setError('');
    setHeard('');
    setResult('');
    activeRef.current = true;
    updateMode('waiting_name');
    startRecognition();
  }, [startRecognition, stopRecognition, updateMode]);

  useEffect(() => () => {
    activeRef.current = false;
    stopRecognition();
    recognitionRef.current = null;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    window.speechSynthesis?.cancel();
    void audioContextRef.current?.close();
  }, [stopRecognition]);

  return {
    mode,
    heard,
    result,
    error,
    toggle,
    speak
  };
}
