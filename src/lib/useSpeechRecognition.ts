import { useState, useEffect, useRef } from 'react';

interface UseSpeechRecognitionProps {
  language?: 'bn' | 'en';
  onResult: (text: string) => void;
}

export function useSpeechRecognition({ language = 'bn', onResult }: UseSpeechRecognitionProps) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isFallbackActiveRef = useRef<boolean>(false);

  // Check if we are in an iframe or if native is not supported
  const preferFallback = typeof window !== 'undefined' && (
    (window.self !== window.top) || // Inside an iframe
    !( (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition ) // Native not supported
  );

  const initRecognition = () => {
    // If we prefer fallback (e.g., inside an iframe due to permissions/cookies/service restrictions),
    // don't even instantiate native voice engine to avoid throwing errors immediately and disrupting user.
    if (preferFallback) {
      return null;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === 'bn' ? 'bn-BD' : 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      isFallbackActiveRef.current = false;
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        try {
          window.navigator.vibrate(50);
        } catch (e) {}
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Native speech recognition error:', event.error);
      
      // If native engine has any error other than user-cancelled ('aborted') or no speech ('no-speech'),
      // seamlessly fallback to our high-fidelity Gemini-powered custom browser recording.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.log('Seamlessly activating Gemini-powered voice input helper...');
        setError(null);
        try {
          recognition.abort();
        } catch (e) {}
        setIsListening(false);
        startMediaRecorder();
        return;
      }

      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (!isFallbackActiveRef.current) {
        setIsListening(false);
      }
    };

    return recognition;
  };

  useEffect(() => {
    recognitionRef.current = initRecognition();

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
    };
  }, [language]);

  const startMediaRecorder = async () => {
    try {
      setError(null);
      isFallbackActiveRef.current = true;
      setIsListening(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      // Probe and detect supported mimeTypes with high iOS Safari, macOS, and Android compatibility
      const targetMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4;codecs=mp4a',
        'audio/mp4',
        'audio/wav',
        'audio/aac',
        'audio/mpeg',
      ];
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        for (const candidate of targetMimeTypes) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            mimeType = candidate;
            break;
          }
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const recordedType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
        
        // Stop all audio tracks in the stream to turn off the microphone light
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {}
        });
        
        if (audioChunksRef.current.length === 0 || audioBlob.size < 500) {
          console.log("Audio recording is too brief or empty.");
          setIsListening(false);
          setIsTranscribing(false);
          return;
        }

        try {
          setIsTranscribing(true);
          
          // Convert Blob to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64data = reader.result as string;
              const base64payload = base64data.split(',')[1];
              
              // Try the Netlify function route first
              let res = await fetch('/.netlify/functions/gemini-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'transcribe',
                  model: 'gemini-3.5-flash',
                  audio: base64payload,
                  mimeType: recordedType,
                  language: language
                })
              });
              
              const isNetlifyFunctionOk = res.ok && res.status !== 404;
              if (!isNetlifyFunctionOk) {
                console.warn(`Netlify transcribe function returned status ${res.status}, falling back to local /api/transcribe...`);
                res = await fetch('/api/transcribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    audio: base64payload,
                    mimeType: recordedType,
                    language: language
                  })
                });
              }
              
              if (!res.ok) {
                throw new Error("Transcribe API error code: " + res.status);
              }

              const data = await res.json();
              if (data.text) {
                onResult(data.text);
              }
            } catch (err: any) {
              console.error("Audio transcribing engine failed:", err);
              setError("transcription-failed");
            } finally {
              setIsTranscribing(false);
              setIsListening(false);
            }
          };
        } catch (transcribeError) {
          console.error("Transcribe setup file-reader failed:", transcribeError);
          setError("transcription-failed");
          setIsTranscribing(false);
          setIsListening(false);
        }
      };
      
      mediaRecorder.start(250); // Slice recording every 250ms
      
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        try {
          window.navigator.vibrate(50);
        } catch (e) {}
      }
    } catch (micErr: any) {
      console.warn("Failed to start MediaRecorder recording:", micErr?.message || micErr);
      setError("not-allowed"); // Microphone permission blocked or unavailable
      setIsListening(false);
      isFallbackActiveRef.current = false;
    }
  };

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  const startListening = () => {
    setError(null);

    if (preferFallback) {
      startMediaRecorder();
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition();
    }

    if (!recognitionRef.current) {
      startMediaRecorder();
      return;
    }

    try {
      recognitionRef.current.lang = language === 'bn' ? 'bn-BD' : 'en-US';
      recognitionRef.current.start();
    } catch (err) {
      console.warn('Speech recognition start failed, using fallback custom web recorder directly...', err);
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      startMediaRecorder();
    }
  };

  const stopListening = () => {
    if (isFallbackActiveRef.current) {
      stopMediaRecorder();
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          console.error('Failed to stop speech recognition:', err);
        }
      }
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const isSupported = true; // Supported fallback is always provided

  return {
    isListening,
    isTranscribing,
    error,
    startListening,
    stopListening,
    toggleListening,
    isSupported,
  };
}
