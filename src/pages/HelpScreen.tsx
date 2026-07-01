import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  HelpCircle, 
  Phone, 
  Mail, 
  MessageSquare, 
  ChevronDown, 
  PlayCircle, 
  FileText, 
  ExternalLink,
  MessageCircle,
  X,
  Send,
  User,
  AtSign,
  MapPin,
  FileWarning,
  Shield,
  Heart,
  CreditCard,
  Flame,
  Ambulance,
  AlertCircle,
  Sparkles,
  Bot,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Screen } from '../types';
import { Language, translations } from '../translations';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ai } from '../lib/gemini';

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const FAQS: FAQ[] = [
  {
    category: 'ভূমি সেবা',
    question: 'কিভাবে অনলাইনে পর্চা (খতিয়ান) আবেদন করব?',
    answer: 'ই-পর্চা পোর্টালে গিয়ে আপনার বিভাগ, জেলা এবং উপজেলা নির্বাচন করুন। এরপর খতিয়ানের বিবরণ প্রদান করে ফি পরিশোধ করলেই আপনার আবেদন সম্পন্ন হবে।'
  },
  {
    category: 'ভূমি সেবা',
    question: 'অনলাইন নামজারি হতে কতদিন সময় লাগে?',
    answer: 'সাধারণত ২৮ কার্যদিবসের মধ্যে নামজারি প্রক্রিয়া সম্পন্ন করার লক্ষ্যমাত্রা ধরা হয়। তবে প্রেক্ষাপট অনুযায়ী এটি কম বা বেশি হতে পারে।'
  },
  {
    category: 'সাধারণ',
    question: 'অভিযোগ করার পর কতক্ষণ অপেক্ষা করতে হবে?',
    answer: 'আপনার অভিযোগ প্রশাসনের কাছে পৌঁছানোর ২৪-৪৮ ঘণ্টার মধ্যে প্রাথমিক ফিডব্যাক দেওয়া হয়। গুরুতর সমস্যার ক্ষেত্রে জরুরি ব্যবস্থা নেওয়া হয়।'
  },
  {
    category: 'সাধারণ',
    question: 'পাসওয়ার্ড ছাড়াই কি লগইন করা সম্ভব?',
    answer: 'হ্যাঁ, স্মার্ট উপজেলা অ্যাপে আপনি আপনার নিবন্ধিত মোবাইল নম্বরে ওটিপি (OTP) কোড পাওয়ার মাধ্যমে সহজ ও নিরাপদ লগইন করতে পারেন।'
  },
  {
    category: 'ট্রেড লাইসেন্স',
    question: 'ট্রেড লাইসেন্স করতে কি কি লাগে?',
    answer: 'আইনত ব্যবসার জন্য ট্রেড লাইসেন্স বাধ্যতামূলক। এর জন্য আবেদনকারীর এনআইডি (NID), পাসপোর্ট সাইজের ছবি, ব্যবসার জায়গার ভাড়ার চুক্তিপত্র বা কর পরিশোধের রসিদ এবং টিআইএন (TIN) সার্টিফিকেট প্রয়োজন।'
  },
  {
    category: 'পাসপোর্ট',
    question: 'ই-পাসপোর্ট আবেদনের সঠিক নিয়ম কি?',
    answer: 'প্রথমে epassport.gov.bd ওয়েবসাইটে গিয়ে আবেদন ফরম পূরণ করুন। এরপর ব্যাংকে ফি জমা দিয়ে আপনার নিকটস্থ পাসপোর্ট অফিসে (যেমন: গাজীপুর আঞ্চলিক পাসপোর্ট অফিস) বায়োমেট্রিক প্রদানের জন্য এপয়েন্টমেন্ট নিন।'
  },
  {
    category: 'জরুরি',
    question: 'গভীর রাতে ফায়ার সার্ভিসের প্রয়োজন হলে কি করব?',
    answer: 'জরুরি প্রয়োজনে শ্রীপুর ফায়ার সার্ভিসের হটলাইন নম্বর অথবা জাতীয় জরুরি সেবা ৯৯৯-এ কল করুন। আমাদের অ্যাপের "জরুরি সেবা" ট্যাব থেকেও সরাসরি কল দেওয়া সম্ভব।'
  },
  {
    category: 'সার্ভিস হাব',
    question: 'কিভাবে দক্ষ ইলেকট্রিশিয়ান বা প্লাম্বার খুঁজে পাব?',
    answer: 'অ্যাপের "সার্ভিস হাব" সেকশনে যান। সেখানে আপনার প্রয়োজনীয় ক্যাটাগরি (যেমন: ইলেকট্রিশিয়ান) সিলেক্ট করলে এলাকার সকল ভেরিফাইড সার্ভিস প্রোভাইডারের তালিকা ও নম্বর পেয়ে যাবেন।'
  },
];

export default function HelpScreen({ onNavigate, language = 'bn' }: { onNavigate?: (screen: Screen) => void, language?: Language }) {
  const t = translations[language] || translations['bn'];
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{ title: string; url: string } | null>(null);
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  
  // AI Search states
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiResponse, setAiResponse] = useState<{ answer: string; isMatch: boolean; originalQuestion?: string } | null>(null);

  const filteredFaqs = FAQS.filter(faq => {
    const keywords = searchQuery.toLowerCase().split(' ').filter(k => k.length > 0);
    if (keywords.length === 0) return true;
    return keywords.every(k => 
      faq.question.toLowerCase().includes(k) || 
      faq.category.toLowerCase().includes(k) ||
      faq.answer.toLowerCase().includes(k)
    );
  });

  const handleAISearch = async () => {
    if (!searchQuery.trim() || isAiSearching) return;
    
    setIsAiSearching(true);
    setAiResponse(null);

    try {
        const faqContext = FAQS.map(f => `Category: ${f.category}\nQ: ${f.question}\nA: ${f.answer}`).join('\n\n');
        const systemPrompt = `You are a Smart Assistant for the "Smart Upazila" (স্মার্ট উপজেলা) app. 
        Your goal is to answer user questions based ONLY on the provided knowledge base (FAQs). 
        
        KNOWLEDGE BASE:
        ${faqContext}
        
        RESPONSE GUIDELINES:
        1. If the user question matches a topic in the FAQs (even if worded differently), provide a concise but complete answer from it.
        2. If the user question is NOT covered by any FAQ, return exactly: "NO_MATCH".
        3. Do not invent information or provide external knowledge.
        4. If it's a greeting like 'Hi' or 'Hello', respond politely and say "How can I help you with Upazila services?".
        5. Use a professional and friendly tone.
        6. Use ${language === 'bn' ? 'Bengali' : 'English'} for your answer.
        
        USER QUESTION: ${searchQuery}`;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: systemPrompt,
        });

        const text = response.text?.trim() || "";
        if (text === "NO_MATCH" || text.includes("NO_MATCH")) {
            setAiResponse({ answer: '', isMatch: false });
        } else {
            setAiResponse({ answer: text, isMatch: true, originalQuestion: searchQuery });
        }
    } catch (error) {
        console.error("AI Search failed:", error);
    } finally {
        setIsAiSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');
    
    try {
      const form = e.target as HTMLFormElement;
      const name = (form.elements[0] as HTMLInputElement).value;
      const contact = (form.elements[1] as HTMLInputElement).value;
      const message = (form.elements[2] as HTMLTextAreaElement).value;

      await addDoc(collection(db, 'support_messages'), {
        name,
        contact,
        message,
        userId: auth.currentUser?.uid || 'anonymous',
        createdAt: serverTimestamp(),
        status: 'unread'
      });

      setFormStatus('success');
      setTimeout(() => {
          setIsContactOpen(false);
          setFormStatus('idle');
      }, 1500);
    } catch (error) {
      console.error("Error sending support message:", error);
      setFormStatus('idle');
      alert(language === 'bn' ? 'বার্তা পাঠানো সম্ভব হয়নি। আবার চেষ্টা করুন।' : 'Failed to send message. Please try again.');
    }
  };

  return (
    <div className="px-6 pb-24">
      <div className="mt-4 mb-8">
        <h2 className="text-2xl font-bn font-extrabold text-slate-800 dark:text-white mb-2 underline decoration-primary decoration-4 underline-offset-8">{t.help.title}</h2>
        <p className="text-sm text-muted font-bn italic opacity-80">{t.help.subtitle}</p>
      </div>

      {/* AI Powered Search Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-2">
              <div className="p-1.5 bg-secondary/10 rounded-lg">
                <Sparkles size={18} className="text-secondary animate-pulse" />
              </div>
              <h3 className="text-lg font-bn font-black text-slate-800 dark:text-white uppercase tracking-tight">স্মার্ট এআই এসিস্ট্যান্ট</h3>
           </div>
           <div className="flex items-center gap-1.5 bg-slate-900 dark:bg-white px-3 py-1.5 rounded-full shadow-lg shadow-black/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-white dark:text-slate-900 uppercase tracking-widest">Active Engine</span>
           </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-secondary/20 to-primary/20 rounded-[2.5rem] blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
          <div className="flex gap-2 relative">
              <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Search size={22} className="text-slate-400 group-focus-within:text-secondary transition-colors" />
                  </div>
                  <input 
                    type="text"
                    placeholder={t.help.searchPlaceholder}
                    value={searchQuery}
                    onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (!e.target.value) setAiResponse(null);
                    }}
                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-700/50 rounded-[2.2rem] py-5 pl-14 pr-6 font-bn text-slate-800 dark:text-white focus:outline-none focus:border-secondary/30 soft-shadow transition-all text-lg placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  />
              </div>
              <button 
                  onClick={handleAISearch}
                  disabled={isAiSearching || !searchQuery}
                  className="w-16 h-16 rounded-[1.8rem] bg-secondary text-white flex items-center justify-center shrink-0 shadow-xl shadow-secondary/20 hover:shadow-secondary/40 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
              >
                  {isAiSearching ? (
                     <Loader2 size={24} className="animate-spin" />
                  ) : (
                      <Send size={24} />
                  )}
              </button>
          </div>

          {!searchQuery && !aiResponse && (
            <div className="mt-5 flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-hide px-1">
               {(language === 'bn' ? ['ট্রেড লাইসেন্স নিয়ম', 'অভিযোগ সমাধান', 'পর্চা আবেদন', '৯৯৯ হেল্প'] : ['Trade license', 'Reporting issue', 'Khatian app', '999 Help']).map(hint => (
                 <button 
                  key={hint}
                  onClick={() => {
                    setSearchQuery(hint);
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 rounded-2xl text-xs font-bn border border-slate-100 dark:border-slate-800 hover:text-secondary hover:border-secondary/30 hover:bg-secondary/5 transition-all whitespace-nowrap shadow-sm"
                 >
                   {hint}
                 </button>
               ))}
            </div>
          )}
        </div>

        {/* AI Result Area */}
        <AnimatePresence mode="wait">
            {aiResponse && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="mt-8"
                >
                    {aiResponse.isMatch ? (
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-[3.5rem] border border-slate-100 dark:border-slate-700 soft-shadow relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                              <Bot size={150} />
                           </div>
                           
                           <div className="flex items-center justify-between mb-8">
                             <div className="flex items-center gap-4">
                               <div className="w-14 h-14 rounded-[2rem] bg-gradient-to-tr from-secondary to-blue-600 flex items-center justify-center text-white shadow-xl shadow-secondary/25">
                                  <Bot size={28} />
                               </div>
                               <div>
                                 <h4 className="font-bn font-black text-slate-800 dark:text-white text-xl leading-none mb-1.5">{t.help.aiFound}</h4>
                                 <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-[0.2em] bg-emerald-500/10 px-2 py-0.5 rounded-full">Verified by AI</span>
                                    <span className="text-[9px] text-slate-300 dark:text-slate-600">|</span>
                                    <span className="text-[9px] text-slate-400 font-bn">লাইভ সোর্স থেকে প্রাপ্ত</span>
                                 </div>
                               </div>
                             </div>
                             <div className="hidden sm:flex text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 rounded-full items-center gap-2 border border-slate-100 dark:border-slate-800">
                                <Search size={12} className="text-slate-300" /> "{aiResponse.originalQuestion}"
                             </div>
                           </div>

                           <div className="relative">
                             <div className="absolute -left-4 top-0 bottom-0 w-1.5 bg-gradient-to-b from-secondary to-transparent rounded-full opacity-50" />
                             <div className="p-1">
                                <p className="text-lg font-bn text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                                   {aiResponse.answer}
                                </p>
                             </div>
                           </div>

                           <div className="mt-8 pt-8 border-t border-slate-50 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-6">
                              <div className="flex items-center gap-4">
                                 <div className="flex -space-x-3">
                                    {[1,2,3,4].map(i => (
                                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 overflow-hidden shadow-sm">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i+25}`} alt="user" />
                                      </div>
                                    ))}
                                 </div>
                                 <div className="flex flex-col">
                                    <span className="text-[10px] font-bn font-black text-slate-800 dark:text-slate-300">ভেরিফাইড তথ্য</span>
                                    <span className="text-[9px] font-bn text-slate-400">এই মাসে ২০০+ মানুষ একই প্রশ্ন করেছেন</span>
                                 </div>
                              </div>
                              <button 
                                onClick={() => onNavigate?.('REPORT')}
                                className="group/btn flex items-center gap-2 text-xs font-bn font-bold text-slate-400 hover:text-secondary transition-all"
                              >
                                আরও বিষদ জানতে চান? 
                                <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                              </button>
                           </div>
                        </div>
                    ) : (
                        <div className="bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-100 dark:border-rose-500/20 p-12 rounded-[4rem] text-center relative overflow-hidden shadow-2xl shadow-rose-200/20">
                           <div className="absolute -top-10 -right-10 p-8 opacity-5 text-rose-500 rotate-12">
                              <AlertCircle size={200} />
                           </div>
                           <div className="w-24 h-24 rounded-[2.5rem] bg-rose-500 text-white flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-rose-500/40 animate-pulse-slow">
                              <MessageSquare size={44} />
                           </div>
                           <h4 className="text-2xl font-bn font-black text-slate-800 dark:text-white mb-4">ক্ষমা করবেন, আমি উত্তরটি জানি না</h4>
                           <p className="text-base font-bn text-slate-600 dark:text-slate-400 mb-10 max-w-sm mx-auto leading-relaxed">
                              {t.help.aiNoMatch}
                           </p>
                           <button 
                             onClick={() => onNavigate?.('REPORT')}
                             className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-12 py-6 rounded-[2.5rem] font-bn font-black text-xl flex items-center gap-4 mx-auto transition-all active:scale-95 shadow-2xl shadow-slate-900/30 dark:shadow-none hover:bg-slate-800 dark:hover:bg-slate-50"
                           >
                             <Send size={24} />
                             {t.help.submitToSupport}
                           </button>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
      </section>

      {/* FAQs */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle size={22} className="text-primary" />
          <h3 className="text-lg font-bn font-bold text-slate-800 dark:text-white">{t.help.faqTitle}</h3>
        </div>
        
        <div className="space-y-3">
          {filteredFaqs.map((faq, index) => (
            <motion.div 
              key={`faq-${index}-${faq.question.slice(0, 10)}`}
              className="bg-white dark:bg-slate-800 border border-slate-50 dark:border-slate-700 rounded-[1.5rem] overflow-hidden soft-shadow"
            >
              <button 
                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bn font-bold uppercase tracking-widest text-primary/70">{faq.category}</span>
                  <span className="font-bn font-medium text-slate-700 dark:text-slate-300">{faq.question}</span>
                </div>
                <ChevronDown 
                  size={20} 
                  className={cn("text-slate-400 transition-transform duration-300", activeFaq === index && "rotate-180")} 
                />
              </button>
              
              <AnimatePresence>
                {activeFaq === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-5 pb-5 pt-0"
                  >
                    <div className="h-px bg-slate-50 dark:bg-slate-700 mb-4" />
                    <p className="text-sm font-bn text-slate-600 dark:text-slate-400 leading-relaxed italic">
                      {faq.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
          {filteredFaqs.length === 0 && (
            <p className="text-center font-bn text-muted py-6">{t.help.noResults}</p>
          )}
        </div>
      </section>

      {/* Quick Contact - Interactive */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={22} className="text-secondary" />
            <h3 className="text-lg font-bn font-bold text-slate-800 dark:text-white">{t.help.contactTitle}</h3>
          </div>
          <p className="text-[10px] text-muted font-bn uppercase tracking-widest">Available 24/7</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <ContactCard 
            icon={Phone} 
            title={language === 'bn' ? "কল সেন্টার" : "Call Center"} 
            value={language === 'bn' ? "১৬১২২ (ল্যান্ড সার্ভিস)" : "16122 (Land Services)"} 
            color="#0F9D58" 
            onClick={() => window.open('tel:16122', '_self')}
          />
          <ContactCard 
            icon={Mail} 
            title={language === 'bn' ? "ইমেইল সাপোর্ট" : "Email Support"} 
            value="support@smartupazila.gov.bd" 
            color="#4285F4" 
            onClick={() => setIsContactOpen(true)}
          />
          <ContactCard 
            icon={MessageCircle} 
            title={language === 'bn' ? "হোয়াটসঅ্যাপ" : "WhatsApp"} 
            value="+৮৮০১৭০০০০০০০০" 
            color="#25D366" 
            onClick={() => window.open('https://wa.me/8801700000000', '_blank')}
          />
        </div>
      </section>

      {/* Emergency Helplines */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle size={22} className="text-red-600" />
          <h3 className="text-lg font-bn font-bold text-slate-800 dark:text-white">{t.help.emergencyTitle}</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <HelplineCard 
            icon={Shield} 
            title={language === 'bn' ? "জরুরি সেবা" : "Emergency"} 
            number={language === 'bn' ? "৯৯৯" : "999"} 
            color="#DC2626" 
            description={language === 'bn' ? "পুলিশ, ফায়ার ও অ্যাম্বুলেন্স" : "Police, Fire & Ambulance"}
          />
          <HelplineCard 
            icon={MessageCircle} 
            title={language === 'bn' ? "তথ্য সেবা" : "Info Service"} 
            number={language === 'bn' ? "৩৩৩" : "333"} 
            color="#4F46E5" 
            description={language === 'bn' ? "সরকারি তথ্য ও সেবা" : "Govt Info & Services"}
          />
          <HelplineCard 
            icon={Heart} 
            title={language === 'bn' ? "নারী ও শিশু" : "Women & Child"} 
            number={language === 'bn' ? "১০৯" : "109"} 
            color="#EC4899" 
            description={language === 'bn' ? "সহায়তা ও নিরাপত্তা" : "Help & Security"}
          />
          <HelplineCard 
            icon={CreditCard} 
            title={language === 'bn' ? "NID হেল্প" : "NID Help"} 
            number={language === 'bn' ? "১০৫" : "105"} 
            color="#059669" 
            description={language === 'bn' ? "পরিচয়পত্র সংক্রান্ত তথ্য" : "ID Card Info"}
          />
        </div>
      </section>

      {/* Tutorials */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <PlayCircle size={22} className="text-red-500" />
          <h3 className="text-lg font-bn font-bold text-slate-800 dark:text-white">{t.help.tutorialTitle}</h3>
        </div>

        <div className="space-y-4">
          <GuideItem 
            icon={FileText} 
            title={language === 'bn' ? "কিভাবে নামজারি আবেদন করবেন?" : "How to apply for Mutation?"} 
            subtitle={language === 'bn' ? "পিডিএফ গাইড (২.৫ এমবি)" : "PDF Guide (2.5 MB)"} 
            onClick={() => window.open('https://land.gov.bd/', '_blank')}
          />
          <GuideItem 
            icon={PlayCircle} 
            title={language === 'bn' ? "স্মার্ট উপজেলা অ্যাপ ব্যবহার নির্দেশিকা" : "Smart Upazila App User Guide"} 
            subtitle={language === 'bn' ? "ভিডিও টিউটোরিয়াল (৫ মিনিট)" : "Video Tutorial (5 min)"} 
            onClick={() => setActiveVideo({
                title: language === 'bn' ? "স্মার্ট উপজেলা অ্যাপ ব্যবহার নির্দেশিকা" : "Smart Upazila App User Guide",
                url: "https://www.youtube.com/embed/dQw4w9WgXcQ" // Example educational placeholder
            })}
          />
        </div>
      </section>

      {/* Video Player Modal */}
      <AnimatePresence>
        {activeVideo && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setActiveVideo(null)}
                    className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
                />
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative w-full max-w-4xl aspect-video bg-black rounded-[2rem] overflow-hidden shadow-2xl"
                >
                    <button 
                        onClick={() => setActiveVideo(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <iframe 
                        className="w-full h-full"
                        src={activeVideo.url}
                        title={activeVideo.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                    ></iframe>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Report Section */}
      <section className="mb-10">
        <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-[2.5rem] border border-amber-100 dark:border-amber-900 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[2rem] bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
                <FileWarning size={32} />
            </div>
            <h3 className="text-xl font-bn font-bold text-slate-800 dark:text-white mb-2">{t.help.reportTitle}</h3>
            <p className="text-sm font-bn text-slate-600 dark:text-slate-400 mb-6">{t.help.reportSubtitle}</p>
            
            <button 
                onClick={() => onNavigate?.('REPORT')}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bn font-bold shadow-lg shadow-amber-200 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                {t.help.reportButton}
                <ExternalLink size={18} />
            </button>
        </div>
      </section>

      {/* Contact Trigger */}
      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsContactOpen(true)}
        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-5 rounded-[2rem] font-bn font-bold text-xl shadow-xl shadow-slate-900/10 dark:shadow-white/5 transition-all flex items-center justify-center gap-3"
      >
        <MessageSquare size={24} />
        {t.help.contactButton}
      </motion.button>

      {/* Contact Modal */}
      <AnimatePresence>
        {isContactOpen && (
          <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsContactOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-xl sm:max-w-2xl md:max-w-3xl bg-white dark:bg-slate-900 rounded-t-[3.5rem] sm:rounded-[3.5rem] shadow-2xl p-6 sm:p-10 overflow-hidden max-h-[92vh] overflow-y-auto"
            >
              <button 
                onClick={() => setIsContactOpen(false)}
                className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all z-20"
              >
                <X size={20} className="sm:size-[24px]" />
              </button>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.1 } }
                }}
                className="relative z-10"
              >
                <motion.div 
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 }
                  }}
                  className="mb-6 sm:mb-8"
                >
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1.2rem] sm:rounded-[2rem] bg-secondary/10 flex items-center justify-center text-secondary mb-4 sm:mb-6 shadow-inner">
                      <AtSign size={24} className="sm:size-[32px]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bn font-bold text-slate-800 dark:text-white mb-1.5 sm:mb-2">{t.help.modalTitle}</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-bn text-sm sm:text-base">{t.help.modalSubtitle}</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
                  {/* Contact Info */}
                  <motion.div 
                    variants={{
                      hidden: { opacity: 0, x: -20 },
                      visible: { opacity: 1, x: 0 }
                    }}
                    className="space-y-4 sm:space-y-6"
                  >
                    <h4 className="text-base sm:text-lg font-bn font-bold text-slate-800 dark:text-white border-l-4 border-secondary pl-3">{t.help.officeAddress}</h4>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 shrink-0 soft-shadow">
                              <MapPin size={18} className="sm:size-[20px]" />
                          </div>
                          <p className="text-xs sm:text-sm font-bn text-slate-600 dark:text-slate-400 leading-snug">{t.help.address}</p>
                      </div>
                      <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 shrink-0 soft-shadow">
                              <Phone size={18} className="sm:size-[20px]" />
                          </div>
                          <p className="text-xs sm:text-sm font-bn text-slate-600 dark:text-slate-400 leading-snug">+৮৮০১৭০০০০০০০০</p>
                      </div>
                      <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 shrink-0 soft-shadow">
                              <Mail size={18} className="sm:size-[20px]" />
                          </div>
                          <p className="text-xs sm:text-sm font-bn text-slate-600 dark:text-slate-400 leading-snug">info@smartupazila.gov.bd</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Form */}
                  <motion.form 
                    variants={{
                      hidden: { opacity: 0, x: 20 },
                      visible: { opacity: 1, x: 0 }
                    }}
                    onSubmit={handleSubmit} 
                    className="space-y-3 sm:space-y-4"
                  >
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-3.5 sm:top-4 text-slate-400 sm:size-[18px]" />
                      <input 
                        type="text" 
                        required
                        placeholder={t.help.namePlaceholder}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl sm:rounded-2xl py-3 sm:py-4 pl-11 sm:pl-12 pr-4 font-bn text-xs sm:text-base text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-3.5 sm:top-4 text-slate-400 sm:size-[18px]" />
                      <input 
                        type="text" 
                        required
                        placeholder={t.help.contactPlaceholder}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl sm:rounded-2xl py-3 sm:py-4 pl-11 sm:pl-12 pr-4 font-bn text-xs sm:text-base text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <textarea 
                      required
                      placeholder={t.help.messagePlaceholder}
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl sm:rounded-[2rem] p-4 sm:p-5 font-bn text-xs sm:text-base text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    ></textarea>

                    <button 
                      disabled={formStatus !== 'idle'}
                      className={cn(
                          "w-full py-3.5 sm:py-5 rounded-xl sm:rounded-[2rem] font-bn font-bold text-sm sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-lg transition-all active:scale-[0.98]",
                          formStatus === 'idle' ? "bg-primary text-white shadow-primary/20" : 
                          formStatus === 'sending' ? "bg-slate-200 text-slate-500 cursor-not-allowed" :
                          "bg-green-500 text-white shadow-green-200"
                      )}
                    >
                      {formStatus === 'idle' && (
                          <>
                              {t.help.sendButton} <Send size={18} className="sm:size-[20px]" />
                          </>
                      )}
                      {formStatus === 'sending' && (
                          <div className="flex items-center gap-2">
                              <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                              {t.help.sending}
                          </div>
                      )}
                      {formStatus === 'success' && t.help.success}
                    </button>
                  </motion.form>
                </div>
              </motion.div>

              {/* Decorative background blur blobs */}
              <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-secondary/10 rounded-full blur-3xl -z-0" />
              <div className="absolute -right-10 top-20 w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-0" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HelplineCard({ icon: Icon, title, number, color, description }: { icon: any, title: string, number: string, color: string, description: string }) {
  const handleCall = () => {
    // English mapping for the dialer
    if (!number) return;
    const enNumber = number.replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d).toString());
    window.location.href = `tel:${enNumber}`;
  };

  return (
    <motion.button 
      whileTap={{ scale: 0.95 }}
      onClick={handleCall}
      className="bg-white dark:bg-slate-800 p-5 rounded-[2.5rem] border border-slate-50 dark:border-slate-700 soft-shadow flex flex-col items-center text-center group transition-all hover:border-primary/30"
    >
      <div 
        className="w-14 h-14 rounded-[1.5rem] flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon size={28} />
      </div>
      <h4 className="text-[10px] font-bn font-bold text-muted uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-2xl font-bn font-extrabold text-slate-800 dark:text-white mb-1">{number}</p>
      <p className="text-[9px] font-bn text-slate-500 dark:text-slate-400 opacity-70 leading-tight">{description}</p>
    </motion.button>
  );
}

function ContactCard({ icon: Icon, title, value, color, onClick }: { icon: any, title: string, value: string, color: string, onClick?: () => void }) {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-800 p-5 rounded-[2rem] border border-slate-50 dark:border-slate-700 soft-shadow flex items-center gap-4 transition-all",
        onClick && "cursor-pointer hover:border-primary/30"
      )}
    >
      <div 
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon size={24} />
      </div>
      <div>
        <h4 className="text-xs font-bn font-bold text-muted uppercase tracking-wider">{title}</h4>
        <p className="font-sans font-semibold text-slate-800 dark:text-slate-200">{value}</p>
      </div>
    </motion.div>
  );
}

function GuideItem({ icon: Icon, title, subtitle, onClick }: { icon: any, title: string, subtitle: string, onClick?: () => void }) {
  return (
    <button 
        onClick={onClick}
        className="w-full bg-white dark:bg-slate-800 p-5 rounded-[2rem] border border-slate-50 dark:border-slate-700 soft-shadow flex items-center justify-between text-left group active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-primary transition-colors">
          <Icon size={24} />
        </div>
        <div>
          <h4 className="font-bn font-bold text-slate-800 dark:text-slate-200">{title}</h4>
          <p className="text-[11px] text-muted">{subtitle}</p>
        </div>
      </div>
      <ChevronDown size={20} className="text-slate-300 -rotate-90" />
    </button>
  );
}
