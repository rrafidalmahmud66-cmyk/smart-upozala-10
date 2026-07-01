import { 
  Bell, Calendar, ChevronRight, Bookmark, X, Info, Share2, 
  Printer, Loader2, Megaphone, AlertCircle, Sparkles, 
  ArrowRight, Heart, MapPin, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo } from 'react';
import { cn, handleShare } from '../lib/utils';
import { Language, translations } from '../translations';
import { collection, query, orderBy, onSnapshot, Timestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

interface NoticeItem {
  id: string;
  title: string;
  date: string;
  rawDate: Date;
  type: 'notice' | 'emergency' | 'update';
  important: boolean;
  description: string;
}

export default function NoticeScreen({ language = 'bn' }: { language?: Language }) {
  const t = translations[language] || translations['bn'];
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'notice' | 'emergency' | 'update'>('all');

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [filter]);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const publicTypes = ['notice', 'emergency', 'update'];
      const fetchedNotices = snapshot.docs
        .filter(doc => publicTypes.includes(doc.data().type))
        .map(doc => {
          const data = doc.data();
          const rawDate = data.createdAt instanceof Timestamp 
            ? data.createdAt.toDate() 
            : new Date();
          
          const dateString = rawDate.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          });
          
          return {
            id: doc.id,
            title: data.title,
            date: dateString,
            rawDate,
            type: data.type as any,
            important: data.important || data.type === 'emergency',
            description: data.message
          };
        });
      setNotices(fetchedNotices);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'notifications');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [language]);

  const filteredNotices = useMemo(() => {
    if (filter === 'all') return notices;
    return notices.filter(n => n.type === filter);
  }, [notices, filter]);

  const noticeTypes = [
    { id: 'all', label: (t.titles as any).noticeTypes.all, icon: Bell },
    { id: 'emergency', label: (t.titles as any).noticeTypes.emergency, icon: AlertCircle },
    { id: 'notice', label: (t.titles as any).noticeTypes.notice, icon: Megaphone },
    { id: 'update', label: (t.titles as any).noticeTypes.update, icon: Sparkles },
  ];

  return (
    <div className="min-h-screen pb-32">
      {/* Premium Header */}
      <div className="px-6 py-10 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50 rounded-b-[4rem] border-b border-slate-100 dark:border-slate-800 soft-shadow mb-10 pt-16 relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] w-48 h-48 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[-20px] left-[-20px] w-40 h-40 bg-secondary/5 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 mb-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Megaphone size={18} className="animate-bounce" />
            </div>
            <span className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 dark:text-slate-500">{t.titles.smartUpazila} • OFFICIAL</span>
          </div>
          <h2 className="text-4xl font-display font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-3">
            {t.titles.notices}
          </h2>
          <p className="text-muted font-bn text-lg italic max-w-xs leading-snug underline decoration-primary/20 decoration-2 underline-offset-4">
            {t.titles.noticesSubtitle}
          </p>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="px-6 mb-8 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 min-w-max pb-1">
          {noticeTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setFilter(type.id as any)}
              className={cn(
                "px-5 py-3 rounded-2xl font-bn font-bold text-sm transition-all flex items-center gap-2 border-2",
                filter === type.id 
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xl shadow-slate-900/10" 
                  : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-200"
              )}
            >
              <type.icon size={16} className={cn(filter === type.id ? "scale-110" : "opacity-60")} />
              {type.label}
              {filter === type.id && (
                <span className="ml-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
                  {notices.filter(n => type.id === 'all' ? true : n.type === type.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notices Feed */}
      <div className="px-6 space-y-6">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Bell size={24} className="text-primary animate-pulse" />
              </div>
            </div>
            <p className="mt-6 font-bn font-bold text-slate-400 animate-pulse">{language === 'bn' ? 'নোটিশ লোড হচ্ছে...' : 'Loading announcements...'}</p>
          </div>
        ) : filteredNotices.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {filteredNotices.map((notice, idx) => (
              <motion.div
                key={`notice-item-${notice.id}-${idx}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, type: "spring", stiffness: 100 }}
                onClick={() => setSelectedNotice(notice)}
                className={cn(
                  "group relative p-6 rounded-[2.5rem] bg-white dark:bg-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none border-2 transition-all hover:-translate-y-1 cursor-pointer",
                  notice.type === 'emergency' 
                    ? "border-red-50 dark:border-red-900/20 hover:border-red-100" 
                    : "border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                )}
              >
                {/* Date Side-Strip */}
                <div className="absolute left-0 top-12 bottom-12 w-1.5 rounded-full bg-slate-100 dark:bg-slate-700 pointer-events-none group-hover:bg-primary transition-colors" />

                <div className="flex justify-between items-start mb-4 pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "text-[9px] uppercase font-bold tracking-[0.1em] px-3 py-1.5 rounded-xl border",
                      notice.type === 'emergency' 
                        ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" 
                        : notice.type === 'update'
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600"
                    )}>
                      {notice.type === 'emergency' ? (language === 'bn' ? 'জরুরি ' : 'Emergency') : 
                       notice.type === 'update' ? (language === 'bn' ? 'আপডেট' : 'Update') :
                       (language === 'bn' ? 'নোটিশ' : 'Notice')}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold font-bn">
                      <Calendar size={12} className="text-secondary" />
                      {notice.date}
                    </div>
                  </div>
                  
                  {notice.important && (
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="bg-primary/10 p-2 rounded-xl text-primary"
                    >
                      <Bookmark size={14} className="fill-primary" />
                    </motion.div>
                  )}
                </div>

                <div className="pl-4">
                  <h3 className="text-xl font-bn font-extrabold text-slate-800 dark:text-white leading-tight group-hover:text-primary transition-colors mb-4">
                    {notice.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-bn line-clamp-1 italic">
                        {notice.description}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all transform group-hover:scale-110 shrink-0 shadow-sm">
                      <ArrowRight size={18} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center bg-white dark:bg-slate-800 rounded-[3rem] soft-shadow p-12 border-2 border-dashed border-slate-100 dark:border-slate-800 overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Sparkles size={120} />
             </div>
             <div className="w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto text-slate-300 dark:text-slate-700 mb-6 rotate-12 shadow-inner">
                <Bell size={48} />
             </div>
             <h4 className="font-bn font-black text-2xl text-slate-800 dark:text-white mb-2">কোনো নোটিশ পাওয়া যায়নি</h4>
             <p className="text-sm text-slate-400 dark:text-slate-500 font-bn max-w-[220px] mx-auto italic">বর্তমানে আপনার উপজেলা থেকে কোনো নতুন ঘোষণা আসেনি।</p>
          </div>
        )}
      </div>

      {/* Info Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-16 mx-6 p-10 rounded-[3rem] bg-slate-900 text-white relative overflow-hidden shadow-2xl"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="text-secondary fill-secondary" size={16} />
            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Citizen Support</span>
          </div>
          <h5 className="text-2xl font-bn font-bold mb-4 tracking-tight">নোটিফিকেশন অন রাখুন</h5>
          <p className="text-base font-bn text-slate-300 leading-relaxed mb-8 opacity-80">
            সরকারি ঘোষণা, জরুরি এলার্ট এবং উপজেলার সকল গুরুত্বপূর্ণ তথ্য সবার আগে পেতে আপনার ফোনে নোটিফিকেশন সচল রাখুন।
          </p>
          <div className="flex items-center gap-3 text-xs font-bold font-bn text-secondary bg-white/5 py-3 px-5 rounded-3xl w-fit">
             <div className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping" />
             অ্যাডমিন থেকে সরাসরি প্রচারকৃত
          </div>
        </div>
        <div className="absolute right-[-30px] bottom-[-30px] opacity-[0.03] rotate-12">
          <Bell size={240} />
        </div>
      </motion.div>

      {/* Notice Detail Modal */}
      <AnimatePresence>
        {selectedNotice && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-hidden w-full max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNotice(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md w-full max-w-md mx-auto"
            />
            
            <motion.div
              initial={{ y: "100%", scale: 1 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
              className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-t-[3.5rem] sm:rounded-[4rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
            >
              {/* Drag Handle for Mobile */}
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mt-4 sm:hidden" />
              
              <div className="p-8 pt-6 sm:pt-10 overflow-y-auto scrollbar-hide flex-1">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-16 h-16 rounded-[2rem] flex items-center justify-center text-white shadow-xl transition-all",
                      selectedNotice.type === 'emergency' ? "bg-red-500 shadow-red-500/20" : 
                      selectedNotice.type === 'update' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-primary shadow-primary/20"
                    )}>
                      {selectedNotice.type === 'emergency' ? <AlertCircle size={32} /> : 
                       selectedNotice.type === 'update' ? <Sparkles size={32} /> : <Megaphone size={32} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">
                          {selectedNotice.type}
                        </span>
                        {selectedNotice.important && (
                          <span className="bg-amber-100 text-amber-600 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">Urgent</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bn font-bold text-slate-500">
                        <Calendar size={14} className="text-primary" />
                        {selectedNotice.date}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedNotice(null)}
                    className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-90 shadow-sm"
                  >
                    <X size={20} />
                  </button>
                </div>

                <h2 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight mb-8 tracking-tight">
                  {selectedNotice.title}
                </h2>

                <div className="space-y-6">
                   <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-[3rem] border border-slate-100 dark:border-slate-700/50 relative shadow-inner">
                     <div className="absolute top-6 left-6 opacity-5 -scale-x-100">
                        <Info size={40} />
                     </div>
                     <p className="text-lg font-bn text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap relative z-10">
                        {selectedNotice.description}
                     </p>
                   </div>

                   <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-bn font-bold text-slate-400 ml-4 mb-2">
                        <MapPin size={12} className="text-primary" /> শ্রীপুর উপজেলা পরিষদ থেকে প্রেরিত
                      </div>
                   </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-8 pb-10 bg-white dark:bg-slate-900 border-t border-slate-50 dark:border-slate-800 grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleShare({
                    title: selectedNotice.title,
                    text: selectedNotice.description,
                    url: window.location.href
                  })}
                  className="flex items-center justify-center gap-3 py-5 bg-primary text-white rounded-[2rem] font-bn font-black text-lg shadow-xl shadow-primary/20 active:scale-95 transition-all w-full"
                >
                  <Share2 size={20} />
                  {language === 'bn' ? 'শেয়ার করুন' : 'Share'}
                </button>
                <div className="grid grid-cols-2 gap-3">
                   <button className="flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-[1.5rem] active:scale-95 transition-all text-sm font-bold shadow-sm">
                      <Printer size={20} />
                   </button>
                   <button className="flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-[1.5rem] active:scale-95 transition-all text-sm font-bold shadow-sm">
                      <ExternalLink size={20} />
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
