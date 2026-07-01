import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Clock, 
  Share2, 
  Video, 
  X, 
  Search,
  Calendar,
  Loader2,
  Newspaper,
  ShieldAlert
} from 'lucide-react';
import NewsCard from '../components/NewsCard';
import { getCleanImageUrl, getNewsFallbackImage } from '../lib/image-utils';
import { collection, query, orderBy, onSnapshot, Timestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Language, translations } from '../translations';
import { handleShare } from '../lib/utils';
import AbuseReportModal from '../components/AbuseReportModal';

interface NewsItem {
  id: string;
  title: string;
  description: string;
  image: string;
  category: string;
  createdAt: any;
  videoUrl?: string;
}

export default function NewsScreen({ 
  onNavigate, 
  language = 'bn' 
}: { 
  onNavigate: (s: any) => void, 
  language?: Language 
}) {
  const t = translations[language] || translations['bn'];
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [detailImageError, setDetailImageError] = useState(false);

  useEffect(() => {
    setDetailImageError(false);
  }, [selectedNews]);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(55));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NewsItem[];
      setNews(fetchedNews);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'news');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredNews = news.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  const formatDate = (at: any) => {
    if (!at) return language === 'bn' ? 'সাম্প্রতিক' : 'Recent';
    const date = at instanceof Timestamp ? at.toDate() : new Date(at);
    return date.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl z-50 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onNavigate('HOME')}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {language === 'bn' ? 'সকল খবর ও আপডেট' : 'All News & Updates'}
          </h1>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'bn' ? 'খবর খুঁজুন...' : 'Search news...'}
            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-transparent focus:border-primary/20 rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all font-bn text-sm"
          />
        </div>
      </div>

      <div className="px-6 pt-8 space-y-8">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="font-bn text-slate-400">লোডিং হচ্ছে...</p>
          </div>
        ) : filteredNews.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
            {filteredNews.map((item, idx) => (
              <NewsCard 
                key={`${item.id}-${idx}`}
                news={item}
                language={language}
                onClick={() => setSelectedNews(item)}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-4">
              <Newspaper size={40} />
            </div>
            <p className="font-bn font-bold text-slate-500">কোনো খবর পাওয়া যায়নি</p>
          </div>
        )}
      </div>

      {/* News Detail Overlay */}
      <AnimatePresence>
        {selectedNews && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center w-full max-w-md mx-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedNews(null);
                setIsPlaying(false);
              }}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm w-full max-w-md mx-auto"
            />
            
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-[3.5rem] sm:rounded-[3rem] overflow-hidden max-h-[92vh] flex flex-col"
            >
              <div className="relative h-64 sm:h-80 shrink-0">
                {isPlaying && selectedNews.videoUrl && getYouTubeEmbedUrl(selectedNews.videoUrl) ? (
                  <iframe 
                    src={`${getYouTubeEmbedUrl(selectedNews.videoUrl)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <>
                    <img 
                      src={detailImageError ? getNewsFallbackImage(selectedNews.title, selectedNews.category) : getCleanImageUrl(selectedNews.image, { id: selectedNews.id, title: selectedNews.title, category: selectedNews.category })} 
                      onError={() => setDetailImageError(true)}
                      className="w-full h-full object-cover" 
                      alt={selectedNews.title}
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {selectedNews.videoUrl && (
                      <button 
                        onClick={() => setIsPlaying(true)}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform">
                          <Video size={40} fill="currentColor" />
                        </div>
                      </button>
                    )}
                  </>
                )}
                
                <button 
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else {
                      setSelectedNews(null);
                    }
                  }}
                  className="absolute top-6 right-6 w-11 h-11 rounded-2xl bg-black/40 backdrop-blur-md flex items-center justify-center text-white z-20"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 sm:p-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-bold font-bn">
                    {selectedNews.category || (language === 'bn' ? 'সাধারণ' : 'General')}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-bn text-xs font-bold">
                    <Calendar size={14} className="text-secondary" />
                    <span>{formatDate(selectedNews.createdAt)}</span>
                  </div>
                </div>

                <h2 className="text-3xl font-bn font-bold text-slate-900 dark:text-white leading-tight mb-8">
                  {selectedNews.title}
                </h2>

                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-lg font-bn text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                    {selectedNews.description}
                  </p>
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-8 pt-4 bg-slate-50 dark:bg-slate-800/50 flex gap-4">
                <button 
                  onClick={() => handleShare({
                    title: selectedNews.title,
                    text: selectedNews.description,
                    url: window.location.href
                  })}
                  className="flex-1 bg-primary text-white py-4 rounded-3xl font-bn font-bold flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                >
                  <Share2 size={20} />
                  শেয়ার করুন
                </button>
                <button
                  onClick={() => setReportModalOpen(true)}
                  className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white w-14 shrink-0 rounded-3xl flex items-center justify-center active:scale-95 transition-all"
                  title={language === 'bn' ? 'রিপোর্ট করুন' : 'Report content'}
                >
                  <ShieldAlert size={20} />
                </button>
                {selectedNews.videoUrl && (
                  <button 
                    onClick={() => window.open(selectedNews.videoUrl, '_blank')}
                    className="flex-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 py-4 rounded-3xl font-bn font-bold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <Video size={20} className="text-rose-500" />
                    ভিডিও দেখুন
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AbuseReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        reportedId={selectedNews?.id || ''}
        reportedType="news"
        reportedTitle={selectedNews?.title || ''}
        reportedDetails={selectedNews?.description || ''}
        language={language}
      />
    </div>
  );
}
