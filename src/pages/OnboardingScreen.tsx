import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Heart, Shield, Zap, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

const STEPS = [
  {
    title: "সব সেবা এখন হাতের মুঠোয়",
    desc: "শ্রীপুর উপজেলার সকল নাগরিক সেবা ডিজিটাল মাধ্যমে এখন আপনার হাতের নাগালে। যখন খুশি, যেখানে বসে অত্যন্ত সহজে সেবা গ্রহণ করুন।",
    icon: Zap,
    color: "bg-gradient-to-tr from-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/10 dark:shadow-blue-500/5",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600"
  },
  {
    title: "জরুরি প্রয়োজনে স্মার্ট সাপোর্ট",
    desc: "হাসপাতাল, ফায়ার সার্ভিস, বিদ্যুৎ বা পুলিশের অতি জরুরি সহায়তা নিন মুহূর্তের মধ্যেই। সরাসরি হটলাইনে যুক্ত হয়ে বাঁচান অমূল্য প্রাণ ও সময়।",
    icon: Shield,
    color: "bg-gradient-to-tr from-emerald-500 to-teal-600",
    shadow: "shadow-emerald-500/10 dark:shadow-emerald-500/5",
    image: "https://images.unsplash.com/photo-1516574187841-f70288e8d259?auto=format&fit=crop&q=80&w=600"
  },
  {
    title: "উন্নত ও স্মার্ট উপজেলা গড়ুন",
    desc: "এলাকার কোনো সমস্যা বা অভিযোগ সরাসরি ম্যাপে চিহ্নিত করে অ্যাডমিনকে জানান। আপনার স্বতঃস্ফূর্ত অংশগ্রহণই গড়বে ডিজিটাল সোনার শ্রীপুর।",
    icon: Heart,
    color: "bg-gradient-to-tr from-amber-500 to-rose-500",
    shadow: "shadow-amber-500/10 dark:shadow-amber-500/5",
    image: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&q=80&w=600"
  }
];

export default function OnboardingScreen({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else onFinish();
  };

  const current = STEPS[step];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden select-none">
      {/* Visual Header / Cover Image Area */}
      <div className="relative h-[48%] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img 
            key={step}
            initial={{ scale: 1.15, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            src={current.image}
            className="w-full h-full object-cover"
          />
        </AnimatePresence>
        {/* Soft designer gradient to translate cleanly to the card area */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-50 via-slate-50/70 to-transparent dark:from-slate-950 dark:via-slate-950/70" />
        <div className="absolute top-6 right-6 z-20">
          <button 
            onClick={onFinish}
            className="px-5 py-2 rounded-2xl bg-white/10 dark:bg-black/20 backdrop-blur-md text-white border border-white/20 text-xs font-bn font-bold hover:bg-white/25 active:scale-95 transition-all shadow-md"
          >
            এড়িয়ে যান
          </button>
        </div>
      </div>

      {/* Structured Content Area */}
      <div className="flex-1 px-8 pb-10 flex flex-col justify-between relative z-10 -mt-6">
        <div>
          {/* Progress Indicator Dots */}
          <div className="flex gap-2.5 justify-start mb-8 pl-1">
            {STEPS.map((_, i) => (
              <button 
                key={i} 
                onClick={() => setStep(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-350 cursor-pointer outline-none",
                  i === step 
                    ? "w-8 bg-primary shadow-lg shadow-primary/20" 
                    : "w-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-350"
                )} 
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Symmetrical transition slide text */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="space-y-4"
            >
              {/* Animated Floating Category Badge */}
              <div className="flex items-center gap-2">
                <div className={cn("w-12 h-12 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl transition-all duration-500", current.color, current.shadow)}>
                  <current.icon size={22} className="animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm text-slate-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-widest leading-none">
                  <Sparkles size={11} className="text-amber-500" />
                  Sreepur Citizen Support
                </div>
              </div>
              
              <h2 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight tracking-tight pt-2">
                {current.title}
              </h2>
              
              <p className="text-slate-500 dark:text-slate-450 font-bn text-base leading-relaxed tracking-wide pt-1">
                {current.desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Structured Bottom Button Rail */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-900">
          <button 
            onClick={onFinish}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bn font-bold text-sm px-6 py-3 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-2xl transition-all active:scale-95"
          >
            বাতিল
          </button>
          
          <button 
            onClick={next}
            className="w-16 h-16 rounded-[2rem] bg-primary hover:bg-emerald-600 text-white flex items-center justify-center shadow-xl shadow-primary/25 active:scale-90 transition-all group"
            aria-label="Continue to next slide"
          >
            <ChevronRight size={28} className="group-hover:translate-x-0.5 transition-transform stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}
