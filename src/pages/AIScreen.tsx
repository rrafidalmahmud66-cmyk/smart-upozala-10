import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ChevronLeft, Sparkles, Mic, MicOff, AlertTriangle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ai } from '../lib/gemini';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';

import { Language, translations } from '../translations';
import { Screen } from '../types';

export default function AIScreen({ onBack, language = 'bn', currentScreen }: { onBack: () => void, language?: Language, currentScreen?: Screen }) {
  const t = translations[language] || translations['bn'];
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: language === 'bn' ? 'আসসালামু আলাইকুম! স্মার্ট উপজেলা এআই অ্যাসিস্ট্যান্ট-এ আপনাকে স্বাগতম। আমি আপনাকে কীভাবে সাহায্য করতে পারি?' : 'Welcome! I am your Smart Upazila AI Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  // Use Speech Recognition hook
  const {
    isListening,
    isTranscribing,
    toggleListening,
    isSupported,
    error: speechError
  } = useSpeechRecognition({
    language: language === 'bn' ? 'bn' : 'en',
    onResult: (text) => {
      setInput(prev => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${text}` : text;
      });
    }
  });

  const [showSpeechError, setShowSpeechError] = useState(false);

  useEffect(() => {
    if (speechError && speechError !== 'aborted') {
      setShowSpeechError(true);
      const timer = setTimeout(() => {
        setShowSpeechError(false);
      }, 9000); // Dismiss after 9s automatically
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  // Initialize chat instance
  useEffect(() => {
    const screenInfo = currentScreen ? `The user is currently on the ${currentScreen} screen of the app.` : "";
    const systemPrompt = `You are the 'Smart Upazila' AI Assistant for Sreepur, Gazipur. Provide accurate information about local government services.
    
    KEY SERVICE INFORMATION:
    1. Trade License (ট্রেড লাইসেন্স): 
       - Issued by Sreepur Paurashava (urban) or Union Parishad (rural).
       - Requirements: NID, 2-3 Passport photos, Rent agreement/Tax receipt, TIN certificate.
       - Process: Fill form -> Submit to local Paurashava/UP office -> Pay fee -> Collect.
    
    2. e-Passport (ই-পাসপোর্ট):
       - Application: epassport.gov.bd
       - Documents: NID (mandatory for 18+), Birth Certificate (for <18), Utility bill, Profession proof.
       - Office: Regional Passport Office, Gazipur (usually).
    
    3. Land Mutation (নামজারি):
       - Applied at: AC (Land) Office, Sreepur.
       - Documents: Khatian, Sale Deed, NID, Land Tax receipt (Dakhila).
    
    4. Citizen Reports (অভিযোগ):
       - Use the 'অভিযোগ (Ovijog)' button on the HOME screen to report waste, roads, etc.
    
    CONTEXTUAL RULES:
    ${screenInfo}
    If the user is on the HOME screen, they can see tracking, latest news, and main services.
    If the user is on the SERVICE_HUB screen, they are looking for local providers like plumbers, electricians.
    If the user is on the REPORT screen, guide them on filling the title, category, location, and image.
    If a user asks for hospitals, pharmacies, or local facilities, tell them to visit the 'EXPLORE' screen (the compass icon) to see them on a map.
    
    If you don't have specific info about a building or office location, tell the user to check the 'EXPLORE' page or visit the 'Upazila Nirbahi Office (UNO)'.`;

    chatRef.current = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: systemPrompt
      },
      // Important: Initialize with existing message if it's not the default greeting
      history: [] 
    });
  }, [currentScreen, language]);

  const suggestions = language === 'bn' ? [
    "অভিযোগ কিভাবে করব?",
    "জরুরি হেল্পলাইন নম্বর",
    "ট্রেড লাইসেন্স আবেদন",
    "অর্ডার ট্র্যাক সমস্যা"
  ] : [
    "How to report?",
    "Emergency numbers",
    "Trade license info",
    "Tracking issues"
  ];

  const screenContextMessages = {
    HOME: language === 'bn' ? 'আপনি বর্তমানে হোম স্ক্রিনে আছেন।' : 'You are currently on the Home screen.',
    SERVICE_HUB: language === 'bn' ? 'আপনি বর্তমানে সার্ভিস হাব বা তথ্যকেন্দ্রে আছেন।' : 'You are currently in the Service Hub.',
    REPORT: language === 'bn' ? 'আপনি বর্তমানে অভিযোগ জমা দেওয়ার স্ক্রিনে আছেন।' : 'You are currently on the Report/Complaint screen.',
    EMERGENCY: language === 'bn' ? 'আপনি বর্তমানে জরুরি সেবা স্ক্রিনে আছেন।' : 'You are currently on the Emergency Services screen.',
    PROFILE: language === 'bn' ? 'আপনি বর্তমানে প্রোফাইল বা সেটিংস স্ক্রিনে আছেন।' : 'You are currently on the Profile screen.',
    EXPLORE: language === 'bn' ? 'আপনি বর্তমানে এক্সপ্লোর বা ম্যাপ স্ক্রিনে আছেন।' : 'You are currently on the Explore/Map screen.',
  };

  useEffect(() => {
    if (currentScreen && screenContextMessages[currentScreen as keyof typeof screenContextMessages]) {
      // Small prompt to let the user know AI knows where they are
      console.log("AI knows user is on:", currentScreen);
    }
  }, [currentScreen]);

  const handleSend = async (customMsg?: string) => {
    const userMsg = (customMsg || input).trim();
    if (!userMsg || isTyping) return;
    
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      if (!chatRef.current) {
        throw new Error("Chat not initialized");
      }

      const response = await chatRef.current.sendMessage({ message: userMsg });
      const botText = response.text || (language === 'bn' ? 'দুঃখিত, আমি এই মুহূর্তে উত্তর দিতে পারছি না।' : 'Sorry, I cannot answer right now.');
      
      setMessages(prev => [...prev, { role: 'model', text: botText }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: language === 'bn' ? 'একটি সমস্যা হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।' : 'Something went wrong. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-dark-bg">
      {/* Header */}
      <header className="px-6 py-4 flex items-center gap-4 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl bg-slate-50 dark:bg-slate-800 dark:text-white">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-white shadow-lg shadow-blue-100 dark:shadow-none">
            <Bot size={20} />
          </div>
          <div className="flex flex-col">
            <h3 className="font-display font-bold text-title leading-tight">Smart AI</h3>
            <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
               <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-hide dark:bg-dark-bg"
      >
        {messages.map((msg, i) => (
          <motion.div
            key={`${i}-${msg.role}`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div className={cn(
              "p-4 rounded-[2rem] font-bn text-lg shadow-sm border transition-colors",
              msg.role === 'user' 
                ? "bg-slate-900 dark:bg-slate-800 text-white rounded-tr-none border-slate-800 dark:border-slate-700 shadow-xl shadow-black/10" 
                : "bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 rounded-tl-none border-slate-100 dark:border-slate-700/50 backdrop-blur-md"
            )}>
              {msg.text}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 mr-auto max-w-[85%]"
          >
            <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-100 dark:shadow-none">
               <Bot size={20} />
            </div>
            <div className="bg-white dark:bg-slate-800/80 p-5 rounded-[2rem] rounded-tl-none border border-slate-100 dark:border-slate-700/50 backdrop-blur-md shadow-sm">
              <div className="flex gap-1.5 items-center">
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity }} className="w-2 h-2 rounded-full bg-secondary" />
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 rounded-full bg-secondary" />
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} className="w-2 h-2 rounded-full bg-secondary" />
              </div>
            </div>
          </motion.div>
        )}

        {messages.length < 3 && !isTyping && (
          <div className="pt-4 flex flex-col gap-3">
             <p className="text-[10px] font-bn font-bold text-muted uppercase tracking-widest px-2">{language === 'bn' ? "কিভাবে সাহায্য করতে পারি?" : "How can I help?"}</p>
             <div className="flex flex-wrap gap-2">
                {suggestions.map((s, idx) => (
                  <button 
                    key={`suggest-${idx}`}
                    onClick={() => handleSend(s)}
                    className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bn text-sm hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
                  >
                    {s}
                  </button>
                ))}
             </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-white dark:bg-dark-bg border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
        <AnimatePresence>
          {showSpeechError && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs font-bn text-rose-600 dark:text-rose-400 overflow-hidden"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-500" />
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

        <div className="relative flex items-center gap-2">
           <div className="flex-1 relative">
             <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isTranscribing ? (language === 'bn' ? "ভয়েস প্রসেস হচ্ছে..." : "Processing audio...") : isListening ? (language === 'bn' ? "বলুন, শুনছি..." : "Listening... Speak now...") : (language === 'bn' ? "জিজ্ঞাসা করুন..." : "Ask anything...")}
              disabled={isTranscribing}
              className={cn(
                "w-full border-2 rounded-[2rem] py-4 pl-6 pr-14 outline-none transition-all font-bn text-lg dark:text-white",
                isTranscribing
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 placeholder:text-slate-400"
                  : isListening
                    ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 placeholder:text-rose-400"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 focus:border-primary focus:bg-white dark:focus:bg-slate-800"
              )}
             />
             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary">
                {isTranscribing ? <Loader2 size={20} className="animate-spin text-slate-400" /> : <Sparkles size={20} />}
             </div>
           </div>

           {isSupported && (
             <button 
              onClick={toggleListening}
              disabled={isTranscribing}
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 relative shrink-0",
                isListening 
                  ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 scale-105" 
                  : isTranscribing
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
              title={language === 'bn' ? "ভয়েস কমান্ড" : "Voice Command"}
             >
               {isListening && (
                 <span className="absolute inset-0 rounded-2xl bg-rose-500/30 animate-ping pointer-events-none" />
               )}
               {isTranscribing ? (
                 <Loader2 size={22} className="animate-spin text-primary" />
               ) : (
                 <Mic size={22} className={cn(isListening && "animate-pulse")} />
               )}
             </button>
           )}

           <button 
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 dark:shadow-none shrink-0"
           >
             <Send size={24} />
           </button>
        </div>
        <p className="text-center text-[10px] text-muted font-bn mt-4 tracking-wider uppercase">{language === 'bn' ? 'Gemini AI ইঞ্জিন দ্বারা চালিত' : 'Powered by Gemini AI Engine'}</p>
      </div>
    </div>
  );
}
