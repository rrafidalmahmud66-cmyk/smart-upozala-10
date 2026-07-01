import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  X, 
  Clock, 
  TrendingUp, 
  Loader2, 
  AlertCircle,
  ArrowRight,
  Mic,
  AlertTriangle
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ServiceItem, Screen } from '../types';
import { Language, translations } from '../translations';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import { cn } from '../lib/utils';
import { EXPLORE_DATA, ExploreItem } from '../data/exploreData';

function mapExploreItemToServiceItem(item: ExploreItem): ServiceItem {
  let emoji = '📍';
  let color = '#3b82f6';

  const cat = item.category?.toLowerCase() || '';
  if (cat === 'health') {
    emoji = '🏥';
    color = '#ef4444';
  } else if (cat === 'emergency') {
    emoji = '🚨';
    color = '#f43f5e';
  } else if (cat === 'gov' || cat === 'union') {
    emoji = '🏛️';
    color = '#0ea5e9';
  } else if (cat === 'tourism' || cat === 'travel') {
    emoji = '🌴';
    color = '#10b981';
  } else if (cat === 'edu') {
    emoji = '🏫';
    color = '#f59e0b';
  } else if (cat === 'transport') {
    emoji = '🚌';
    color = '#8b5cf6';
  } else if (cat === 'finance') {
    emoji = '🏦';
    color = '#3b82f6';
  } else if (cat === 'news') {
    emoji = '📰';
    color = '#6b7280';
  } else if (cat === 'food') {
    emoji = '🍲';
    color = '#84cc16';
  } else if (cat === 'citizen') {
    emoji = '📑';
    color = '#06b6d4';
  } else if (cat === 'utility') {
    emoji = '🔌';
    color = '#ec4899';
  }

  return {
    id: item.id,
    name: item.title,
    bnName: item.bengaliTitle || item.title,
    icon: emoji,
    color: color,
    category: item.category === 'tourism' ? 'travel' : (item.category === 'union' ? 'gov' : item.category),
    description: item.fullDescription || item.shortDescription || '',
    locationDetails: item.address,
    locationMapUrl: item.mapLink,
    requiredDocuments: item.requiredDocuments || [],
    phone: item.contactNumber !== 'N/A' ? item.contactNumber : undefined,
    portalUrl: item.website,
    isVisible: true,
    lat: item.latitude,
    lng: item.longitude
  } as ServiceItem;
}

interface SearchPopupProps {
  onClose: () => void;
  language?: Language;
  onServiceSelect: (service: ServiceItem) => void;
  onNavigate?: (s: Screen) => void;
}

const renderServiceIcon = (icon: any, size = 20) => {
  if (!icon) return <AlertCircle size={size} />;
  
  if (typeof icon === 'string') {
    if (icon.match(/[\p{Emoji}]/u)) {
      return <span style={{ fontSize: `${size * 0.8}px` }}>{icon}</span>;
    }
    return <AlertCircle size={size} />;
  }
  
  const IconCmp = icon;
  try {
    return <IconCmp size={size} />;
  } catch (e) {
    return <AlertCircle size={size} />;
  }
};

export default function SearchPopup({ onClose, language = 'bn', onServiceSelect, onNavigate }: SearchPopupProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ServiceItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [allServices, setAllServices] = useState<ServiceItem[]>([]);
  const t = translations[language] || translations['bn'];

  // Initialize Speech recognition
  const {
    isListening,
    isTranscribing,
    toggleListening,
    isSupported,
    error: speechError
  } = useSpeechRecognition({
    language: language === 'bn' ? 'bn' : 'en',
    onResult: (text) => {
      setSearchQuery(text);
      setTimeout(() => {
        handleSearch(text);
      }, 150);
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

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'explore_services'), orderBy('createdAt', 'desc')), (snap) => {
      const docs = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.title,
          bnName: data.title,
          icon: data.icon,
          color: data.color,
          category: data.category,
          description: data.description,
          locationDetails: data.location,
          locationMapUrl: data.locationMapUrl,
          requiredDocuments: data.documents,
          phone: data.phone,
          portalUrl: data.portalUrl,
          isVisible: data.isVisible !== false,
          lat: data.lat,
          lng: data.lng
        } as ServiceItem;
      });
      
      const firestoreFiltered = docs.filter(s => s.isVisible);
      const staticMapped = EXPLORE_DATA.map(mapExploreItemToServiceItem);
      
      // Combine both lists and ensure items with same ID are deduplicated (preferring firestore)
      const uniqueMap = new Map<string, ServiceItem>();
      // staticMapped put first, so firestoreFiltered overwrites if keys match
      staticMapped.forEach(item => uniqueMap.set(item.id, item));
      firestoreFiltered.forEach(item => uniqueMap.set(item.id, item));
      
      setAllServices(Array.from(uniqueMap.values()));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'explore_services');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const savedSearches = localStorage.getItem('recent_searches');
    if (savedSearches) {
      try {
        setRecentSearches(JSON.parse(savedSearches));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const filtered = allServices.filter(s => {
        const name = (s.name || '').toLowerCase();
        const bnName = (s.bnName || '').toLowerCase();
        const category = (s.category || '').toLowerCase();
        const description = (s.description || '').toLowerCase();
        const locationStr = (s.locationDetails || '').toLowerCase();

        return name.includes(q) || 
               bnName.includes(q) || 
               category.includes(q) || 
               description.includes(q) ||
               locationStr.includes(q);
      }).slice(0, 5);
      setSuggestions(filtered);
      setIsSearching(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, allServices]);

  const handleSearch = (queryStr?: string) => {
    const q = (queryStr || searchQuery).trim();
    if (!q) return;

    const newHistory = [q, ...recentSearches.filter(i => i !== q)].slice(0, 5);
    setRecentSearches(newHistory);
    localStorage.setItem('recent_searches', JSON.stringify(newHistory));
    
    // 1. First try absolute exact match (case insensitive)
    let bestMatch = allServices.find(s => 
      s.bnName.toLowerCase() === q.toLowerCase() || 
      s.name.toLowerCase() === q.toLowerCase()
    );

    // 2. If no exact match, try substring match in titles
    if (!bestMatch) {
      bestMatch = allServices.find(s => 
        s.bnName.toLowerCase().includes(q.toLowerCase()) || 
        s.name.toLowerCase().includes(q.toLowerCase())
      );
    }

    // 3. Fallback to matching in details
    if (!bestMatch) {
      bestMatch = allServices.find(s => 
        (s.description || '').toLowerCase().includes(q.toLowerCase()) ||
        (s.locationDetails || '').toLowerCase().includes(q.toLowerCase())
      );
    }

    if (bestMatch) {
      onServiceSelect(bestMatch);
      onClose();
    }
  };

  const POPULAR_KEYWORDS = language === 'bn' ? [
    'সাফারি পার্ক', 'হাসপাতাল', 'থানা', 'ট্রেন', 'সার্ভিস', 'ডাক্তার'
  ] : [
    'Safari Park', 'Hospital', 'Police', 'Train', 'Service', 'Doctor'
  ];

  const catNames: Record<string, string> = language === 'bn' ? {
    health: 'স্বাস্থ্য', gov: 'সরকারি', edu: 'শিক্ষা', transport: 'পরিবহন', travel: 'ভ্রমণ',
    news: 'খবর', land: 'ভূমি সেবা', services: 'অন্যান্য', emergency: 'জরুরি',
    culture: 'সংস্কৃতি', food: 'খাদ্য ও পণ্য', finance: 'ব্যাংক ও অর্থ',
    citizen: 'নাগরিক সেবা', utility: 'ইউটিলিটি', professional: 'পেশাদার',
    logistics: 'লজিস্টিকস', market: 'বাজার ও জ্বালানি', consumer: 'ভোক্তা অধিকার'
  } : {
    health: 'Health', gov: 'Gov', edu: 'Education', transport: 'Transport', travel: 'Travel',
    news: 'News', land: 'Land', services: 'Services', emergency: 'Emergency',
    culture: 'Culture', food: 'Food', finance: 'Finance', citizen: 'Citizen',
    utility: 'Utility', professional: 'Professional', logistics: 'Logistics',
    market: 'Market', consumer: 'Consumer'
  };

  if (typeof window === 'undefined' || !window.document || !window.document.body) {
    return null;
  }

  return createPortal(
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md p-4 flex items-start justify-center pt-24 font-bn w-full max-w-md mx-auto"
    >
      <motion.div 
        initial={{ y: -20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -20, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-2xl text-primary">
            <Search size={20} />
          </div>
          <input 
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            disabled={isTranscribing}
            placeholder={isTranscribing ? (language === 'bn' ? "ভয়েস প্রসেস হচ্ছে..." : "Processing audio...") : isListening ? (language === 'bn' ? "বলুন, শুনছি..." : "Listening... Speak now...") : t.titles.searchPlaceholder}
            className={cn(
              "flex-1 bg-transparent border-none outline-none text-title font-bn text-lg transition-all",
              isTranscribing
                ? "text-slate-400 cursor-not-allowed"
                : isListening ? "text-rose-500 placeholder:text-rose-400 font-bold" : "placeholder:text-slate-400 text-slate-800 dark:text-white"
            )}
          />
          {isSupported && (
            <button
              onClick={toggleListening}
              disabled={isTranscribing}
              className={cn(
                "p-2 rounded-full transition-all relative shrink-0",
                isListening 
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/25" 
                  : isTranscribing
                    ? "text-primary bg-transparent"
                    : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
              title={language === 'bn' ? "কণ্ঠস্বর অনুসন্ধান" : "Voice Search"}
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
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <AnimatePresence>
          {showSpeechError && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="px-6 pt-4 flex-shrink-0"
            >
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-2xl flex items-start gap-2.5 text-xs font-bn text-rose-600 dark:text-rose-400 overflow-hidden font-bn">
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isSearching && (
            <div className="flex items-center gap-3 text-primary text-sm font-bn px-2">
              <Loader2 size={16} className="animate-spin" />
              <span>{language === 'bn' ? 'অনুসন্ধান করা হচ্ছে...' : 'Searching...'}</span>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 px-2">
                {t.titles.searchSuggestions}
              </p>
              <div className="space-y-1">
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.id}-${idx}`}
                    onClick={() => {
                      onServiceSelect(s);
                      onClose();
                    }}
                    className="w-full flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm transition-transform group-hover:rotate-6" style={{ backgroundColor: s.color }}>
                      {renderServiceIcon(s.icon, 20)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bn font-bold text-slate-800 dark:text-white leading-none mb-1">
                        {language === 'bn' ? s.bnName : s.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-display uppercase tracking-wider">{catNames[s.category]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!searchQuery && recentSearches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4 px-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                  {t.titles.recentSearches}
                </p>
                <button 
                  onClick={() => {
                    setRecentSearches([]);
                    localStorage.removeItem('recent_searches');
                  }}
                  className="text-[10px] font-bn font-bold text-primary hover:text-red-500 transition-colors"
                >
                  {t.titles.clearHistory}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(recentSearches)).map((search, idx) => (
                   <button 
                    key={`search-${search}-${idx}`}
                    onClick={() => {
                      setSearchQuery(search);
                      handleSearch(search);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-primary hover:text-white rounded-xl text-xs font-bn text-slate-600 dark:text-slate-300 transition-all border border-slate-100 dark:border-slate-700/50 group"
                   >
                     <Clock size={12} className="opacity-50 group-hover:text-white" />
                     {search}
                   </button>
                ))}
              </div>
            </div>
          )}

          {!searchQuery && (
            <div>
              <div className="flex items-center justify-between mb-4 px-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                  {t.titles.popularKeywords}
                </p>
                <TrendingUp size={12} className="text-primary" />
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_KEYWORDS.map((kw) => (
                   <button 
                    key={`kw-${kw}`}
                    onClick={() => {
                      setSearchQuery(kw);
                      handleSearch(kw);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/5 hover:bg-primary hover:text-white rounded-xl text-xs font-bn text-primary transition-all border border-primary/10 group"
                   >
                     <TrendingUp size={12} className="opacity-50 group-hover:text-white" />
                     {kw}
                   </button>
                ))}
              </div>
            </div>
          )}

          {searchQuery && suggestions.length === 0 && !isSearching && (
            <div className="py-10 text-center flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-slate-600 dark:text-slate-300 font-bn font-bold">{t.serviceHub.noResults}</p>
                <p className="text-xs text-slate-400 font-bn italic">{language === 'bn' ? 'এক্সপ্লোর পেজ থেকে খুঁজে দেখতে পারেন' : 'You can try finding it in the Explore page'}</p>
              </div>
              <button 
                onClick={() => {
                  onClose();
                  if (onNavigate) {
                    onNavigate('EXPLORE');
                  } else {
                    (window as any)._navigateEXPLORE?.(); 
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bn font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all text-sm group"
              >
                {t.explore} 
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
