import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, X, Filter, Sparkles, Loader2, Mic, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';

interface ExploreFilterProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  showMap: boolean;
  onToggleMap: () => void;
  language?: 'bn' | 'en';
  onAiSearch?: () => void;
  isAiLoading?: boolean;
}

export default function ExploreFilter({ 
  searchQuery, 
  onSearchChange, 
  showMap, 
  onToggleMap,
  language = 'bn',
  onAiSearch,
  isAiLoading = false
}: ExploreFilterProps) {
  // Use speech recognition hook for voice typing/search
  const {
    isListening,
    isTranscribing,
    toggleListening,
    isSupported,
    error: speechError
  } = useSpeechRecognition({
    language: language === 'bn' ? 'bn' : 'en',
    onResult: (text) => {
      onSearchChange(text);
      // Auto-trigger advanced Gemini AI search if context exists and queries are auto-submitted
      if (onAiSearch && text.trim().length > 1) {
        setTimeout(() => {
          onAiSearch();
        }, 150);
      }
    }
  });

  const [showSpeechError, setShowSpeechError] = useState(false);

  useEffect(() => {
    if (speechError && speechError !== 'aborted') {
      setShowSpeechError(true);
      const timer = setTimeout(() => {
        setShowSpeechError(false);
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  return (
    <div className="px-6 mb-6">
      <AnimatePresence>
        {showSpeechError && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mb-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-2xl flex items-start gap-2 text-xs font-bn text-rose-600 dark:text-rose-400 overflow-hidden"
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              {speechError === 'not-allowed' ? (
                language === 'bn' 
                  ? "মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে গিয়ে মাইক্রোফোন পারমিশন সচল করুন।" 
                  : "Microphone permission not granted. Please allow microphone access in your browser settings."
              ) : speechError === 'service-not-allowed' ? (
                language === 'bn' 
                  ? "আইফ্রেম (iframe) সীমাবদ্ধতার কারণে ভয়েস সার্ভিসটি ব্লক করা হয়েছে। ভয়েস সার্ভিসটি ব্যবহার করতে অনুগ্রহ করে অ্যাপটি সরাসরি নতুন ট্যাবে (New Tab) ওপেন করুন।" 
                  : "Voice recognition service is blocked in this preview iframe. Please open the app in a New Tab to use voice commands."
              ) : (
                language === 'bn' 
                  ? "ভয়েস সিস্টেমে ত্রুটি হয়েছে। অনুগ্রহ করে ইন্টারনেট কানেকশন বা মাইক্রোফোন সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।" 
                  : `Voice input system error. Please check your connection or try again.`
              )}
            </div>
            <button onClick={() => setShowSpeechError(false)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 shrink-0">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex bg-white dark:bg-slate-900 p-2 rounded-[2.5rem] shadow-xl shadow-black/5 border border-slate-100 dark:border-slate-800">
        <div className="relative flex-1 flex items-center">
          <div className="absolute left-4 text-slate-300">
            {isAiLoading ? <Loader2 size={20} className="animate-spin text-primary" /> : <Search size={20} />}
          </div>
          <input 
            placeholder={isTranscribing ? (language === 'bn' ? "ভয়েস প্রসেস হচ্ছে..." : "Processing audio...") : isListening ? (language === 'bn' ? "বলুন, শুনছি..." : "Listening... Speak now...") : (language === 'bn' ? "সেবা বা তথ্য খুঁজুন..." : "Search services...")}
            disabled={isTranscribing}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onAiSearch && searchQuery.length > 2) {
                onAiSearch();
              }
            }}
            className={cn(
              "w-full bg-transparent py-4 pl-12 pr-[7.5rem] outline-none font-bn text-base font-bold text-slate-800 dark:text-white transition-all",
              isTranscribing
                ? "text-slate-400 cursor-not-allowed"
                : isListening ? "placeholder:text-rose-400 text-rose-500" : "placeholder:text-slate-300"
            )}
          />
          
          <div className="absolute right-4 flex items-center gap-1.5">
            {searchQuery && (
              <button 
                onClick={() => {
                  onSearchChange('');
                }}
                className="text-slate-300 hover:text-rose-500 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            )}
            
            {isSupported && (
              <button
                onClick={toggleListening}
                disabled={isTranscribing}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all relative shrink-0",
                  isListening
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/25"
                    : isTranscribing
                      ? "text-primary hover:bg-transparent"
                      : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                )}
                title={language === 'bn' ? "ভয়েস রিডিং" : "Voice Search"}
              >
                {isListening && (
                  <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping pointer-events-none" />
                )}
                {isTranscribing ? (
                  <Loader2 size={18} className="animate-spin text-primary" />
                ) : (
                  <Mic size={18} className={cn(isListening && "animate-pulse")} />
                )}
              </button>
            )}

            <button 
              onClick={onAiSearch}
              disabled={!searchQuery || isAiLoading}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                searchQuery && !isAiLoading ? "text-primary hover:bg-primary/10" : "text-slate-200"
              )}
              title="Ask AI"
            >
              <Sparkles size={18} className={cn(isAiLoading && "animate-pulse")} />
            </button>
          </div>
        </div>
        
        <div className="flex gap-2 p-1">
          <button 
            onClick={onToggleMap}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              showMap ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-50 dark:bg-slate-800 text-slate-400"
            )}
          >
            {showMap ? <Filter size={20} /> : <MapPin size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
