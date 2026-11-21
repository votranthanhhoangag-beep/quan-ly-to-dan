import { useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface VoiceFillControlProps {
  onTranscript: (transcript: string) => string;
}

export default function VoiceFillControl({ onTranscript }: VoiceFillControlProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const startListening = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('Trình duyệt chưa hỗ trợ nhập giọng nói. Hãy dùng Chrome hoặc Edge mới nhất.');
      return;
    }

    setMessage('');
    setTranscript('');
    setSummary('');
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = event => {
        let currentTranscript = '';
        let finalTranscript = '';
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const phrase = result[0]?.transcript || '';
          currentTranscript += `${phrase} `;
          if (result.isFinal) finalTranscript += `${phrase} `;
        }
        setTranscript(currentTranscript.trim());
        if (finalTranscript.trim()) {
          setSummary(onTranscriptRef.current(finalTranscript.trim()));
        }
      };
      recognition.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMessage('Chưa có quyền dùng micro. Hãy cho phép micro trong cài đặt trình duyệt rồi thử lại.');
        } else if (event.error === 'no-speech') {
          setMessage('Chưa nghe rõ tiếng nói. Hãy thử nói lại gần micro hơn.');
        } else if (event.error !== 'aborted') {
          setMessage('Không thể nhận diện giọng nói lúc này. Hãy thử lại hoặc nhập bằng bàn phím.');
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        if (recognitionRef.current === recognition) recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setIsListening(false);
      setMessage(error instanceof Error
        ? 'Không thể bật micro. Hãy kiểm tra quyền truy cập micro của trình duyệt.'
        : 'Không thể bật micro. Hãy thử lại hoặc nhập bằng bàn phím.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  return (
    <div style={{ display: 'grid', gap: '6px', minWidth: '220px' }}>
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        aria-pressed={isListening}
        style={{
          padding: '7px 12px',
          border: 0,
          borderRadius: '6px',
          backgroundColor: isListening ? '#dc2626' : '#0f766e',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          animation: isListening ? 'voice-fill-pulse 1.2s ease-in-out infinite' : undefined
        }}
      >
        {isListening ? '🎙 Đang nghe… Bấm để dừng' : '🎙 Nói để điền'}
      </button>
      {isListening && (
        <div aria-live="polite" style={{ color: '#b91c1c', fontSize: '12px', fontWeight: 600 }}>
          {transcript || 'Đang chờ bạn nói…'}
        </div>
      )}
      {!isListening && transcript && (
        <div aria-live="polite" style={{ color: '#475569', fontSize: '12px' }}>
          Đã nghe: {transcript}
        </div>
      )}
      {message && <div role="status" style={{ color: '#9a3412', fontSize: '12px' }}>{message}</div>}
      {summary && <div role="status" style={{ color: '#166534', fontSize: '12px', fontWeight: 600 }}>{summary}</div>}
      <style>{'@keyframes voice-fill-pulse { 50% { opacity: .55; } }'}</style>
    </div>
  );
}
