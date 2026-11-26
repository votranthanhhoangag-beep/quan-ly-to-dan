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

const DEFAULT_WAKE_WORD = 'trợ lý';
const WAKE_WORD_STORAGE_KEY = 'erp.voice.wakeWord';
const WAKE_ACKNOWLEDGEMENT = 'Trợ lý nghe rõ, mời anh ra lệnh.';

interface UseTroLyWakeOptions {
  onCommand: (commandText: string) => string | Promise<string>;
  onLocalTranscript?: (commandText: string, isFinal: boolean) => { handled: boolean; message?: string };
  getUnrecognizedMessage?: () => string;
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

const extractWakeRemainder = (transcript: string, wakeWord: string) => {
  const normalized = normalizeVi(transcript);
  const wakePrefix = normalizeVi(wakeWord) || normalizeVi(DEFAULT_WAKE_WORD);
  const command = normalized.replace(/^(?:(?:da|oi)\s+)?/u, '');
  if (command !== wakePrefix && !command.startsWith(`${wakePrefix} `)) return null;
  const remainder = command.slice(wakePrefix.length).trim().replace(/^oi\b\s*/u, '');
  const wakePrefixLength = normalized.length - remainder.length;
  let sourceOffset = 0;
  while (sourceOffset < transcript.length &&
    normalizeVi(transcript.slice(0, sourceOffset)).length < wakePrefixLength) sourceOffset += 1;
  return transcript.slice(sourceOffset).trim();
};

const isWakeAcknowledgement = (remainder: string) =>
  /^(?:(?:em|ban|co) )?(?:nghe(?: khong)?|co nghe khong|khong)?$/u.test(normalizeVi(remainder));

export function useTroLyWake({ onCommand, onLocalTranscript, getUnrecognizedMessage }: UseTroLyWakeOptions) {
  const [mode, setMode] = useState<TroLyVoiceMode>('off');
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [wakeWord, setWakeWordState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WAKE_WORD;
    try {
      return window.localStorage.getItem(WAKE_WORD_STORAGE_KEY)?.trim() || DEFAULT_WAKE_WORD;
    } catch {
      return DEFAULT_WAKE_WORD;
    }
  });
  const modeRef = useRef<TroLyVoiceMode>('off');
  const activeRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const networkRetryIndexRef = useRef(0);
  const retryAttemptCountRef = useRef(0);
  const retryScheduledRef = useRef(false);
  const processingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const onLocalTranscriptRef = useRef(onLocalTranscript);
  const getUnrecognizedMessageRef = useRef(getUnrecognizedMessage);
  const wakeWordRef = useRef(wakeWord);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakRef = useRef<(text: string, nextMode?: TroLyVoiceMode) => void>(() => undefined);
  const wakeAndListenRef = useRef<(remainder?: string) => void>(() => undefined);
  const runCommandRef = useRef<(commandText: string) => void>(() => undefined);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    onLocalTranscriptRef.current = onLocalTranscript;
    getUnrecognizedMessageRef.current = getUnrecognizedMessage;
  }, [getUnrecognizedMessage, onLocalTranscript]);

  useEffect(() => {
    const storedWakeWord = wakeWord.trim() || DEFAULT_WAKE_WORD;
    wakeWordRef.current = storedWakeWord;
    try {
      window.localStorage.setItem(WAKE_WORD_STORAGE_KEY, storedWakeWord);
    } catch {
      setError('Không thể lưu từ khóa đánh thức trên thiết bị.');
    }
  }, [wakeWord]);

  const setWakeWord = useCallback((value: string) => {
    setWakeWordState(value.slice(0, 40));
  }, []);

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
    recognition.interimResults = true;
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
        const transcript = resultItem[0]?.transcript?.trim() || '';
        if (!transcript) continue;
        networkRetryIndexRef.current = 0;
        setHeard(transcript);

        if (modeRef.current === 'waiting_name') {
          if (!resultItem.isFinal) continue;
          retryAttemptCountRef.current = 0;
          retryScheduledRef.current = false;
          setError(current => current.startsWith('Mất kết nối') ? '' : current);
          const wakeRemainder = extractWakeRemainder(transcript, wakeWordRef.current);
          if (wakeRemainder === null) continue;
          stopRecognition();
          wakeAndListenRef.current(
            !wakeRemainder || isWakeAcknowledgement(wakeRemainder) ? undefined : wakeRemainder
          );
          return;
        }

        if (modeRef.current === 'listening_command') {
          const wakeRemainder = extractWakeRemainder(transcript, wakeWordRef.current);
          if (wakeRemainder !== null && isWakeAcknowledgement(wakeRemainder)) {
            if (!resultItem.isFinal) continue;
            stopRecognition();
            speakRef.current(WAKE_ACKNOWLEDGEMENT, 'listening_command');
            break;
          }
          const cleanCommand = wakeRemainder === null ? transcript.trim() : wakeRemainder;
          if (!cleanCommand) continue;
          const spoken = normalizeVi(cleanCommand);
          const localResult = onLocalTranscriptRef.current?.(cleanCommand, resultItem.isFinal);
          if (localResult?.handled) {
            setResult(localResult.message || '');
            if (resultItem.isFinal) {
              retryAttemptCountRef.current = 0;
              retryScheduledRef.current = false;
              setError(current => current.startsWith('Mất kết nối') ? '' : current);
            }
            break;
          }
          if (!resultItem.isFinal) continue;
          retryAttemptCountRef.current = 0;
          retryScheduledRef.current = false;
          setError(current => current.startsWith('Mất kết nối') ? '' : current);
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
    const command = remainder?.trim();
    if (command) {
      updateMode('listening_command');
      const localResult = onLocalTranscriptRef.current?.(command, true);
      if (localResult?.handled) {
        setResult(localResult.message || '');
        scheduleRecognitionRestart();
        return;
      }
      runCommandRef.current(command);
      return;
    }
    speak(WAKE_ACKNOWLEDGEMENT, 'listening_command');
  }, [playWakeTone, scheduleRecognitionRestart, speak, updateMode]);

  const runCommand = useCallback((commandText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    void Promise.resolve(onCommandRef.current(commandText))
      .then(response => {
        if (response.startsWith('Chưa nhận ra')) {
          setResult(getUnrecognizedMessageRef.current?.() ||
            'Nghe chưa rõ — giữ nguyên ô hiện tại, chờ lệnh tiếp theo.');
          return;
        }
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
    wakeWord,
    setWakeWord,
    toggle,
    speak
  };
}
