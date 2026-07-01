import { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  Search, 
  MapPin, 
  Phone, 
  MessageCircle, 
  Facebook, 
  ArrowRight, 
  Plus, 
  Filter, 
  Star, 
  CheckCircle2, 
  Navigation, 
  X,
  Sparkles,
  Camera,
  ChevronRight,
  TrendingUp,
  Award,
  ShieldCheck,
  BellRing,
  Loader2,
  Bot,
  Stethoscope,
  GraduationCap,
  Leaf,
  Flame,
  Hammer,
  Car,
  Home,
  Briefcase,
  Gavel,
  ShieldAlert,
  LayoutGrid,
  Compass,
  ExternalLink,
  User,
  Map as MapIcon,
  Crosshair,
  Info,
  Mic,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ServiceDetail from '../components/ServiceDetail';
import MapView from '../components/MapView';
import { cn, getCoordinates } from '../lib/utils';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import { Language, translations } from '../translations';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc,
  serverTimestamp,
  getDocs,
  limit,
  Timestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { ai, extractJson } from '../lib/gemini';
import { Type } from "@google/genai";
import ContributionForm from '../components/ContributionForm';
import { getDirectImageUrl, getCleanImageUrl, getSmartFallbackImage } from '../lib/image-utils';
import { calculateDistance, calculateRelevanceScore } from '../lib/search-utils';

import { 
  PROVIDER_CATEGORIES
} from '../constants';

interface Provider {
  id: string;
  userId: string;
  name: string;
  contactPerson?: string;
  category: string;
  subCategory?: string;
  phone: string;
  whatsapp?: string;
  facebook?: string;
  website?: string;
  address: string;
  description: string;
  experience?: string;
  serviceCharge?: string;
  availableTime?: string;
  requiredDocuments?: string[];
  serviceArea?: string;
  image?: string;
  businessImage?: string;
  location?: { lat: number; lng: number };
  status: 'pending' | 'approved' | 'rejected';
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  createdAt: any;
}


export default function AIServiceHub({ language = 'bn', onBack, onNavigate }: { language?: Language, onBack: () => void, onNavigate: (screen: any) => void }) {
  const CATEGORIES = PROVIDER_CATEGORIES;
  
  const t = translations[language] || translations['bn'];
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'new_service' | 'alert'} | null>(null);
  const [reviewingProvider, setReviewingProvider] = useState<Provider | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'distance'>('newest');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [minRating, setMinRating] = useState<number>(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{
    text_bn: string,
    text_en: string,
    screen: string,
    icon: string
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeCategory, activeSubCategory]);

  // Clear AI results when search query is manually cleared
  useEffect(() => {
    if (!searchQuery) {
      setAiResultIds(null);
      setAiSuggestion(null);
    }
  }, [searchQuery]);

  const handleRefreshLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.log('Location error:', err);
          alert(language === 'bn' ? 'লোকেশন পাওয়া যায়নি। অনুগ্রহ করে পারমিশন চেক করুন।' : 'Location not found. Please check permissions.');
        },
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    // Get user location
    handleRefreshLocation();

    const q = query(
      collection(db, 'providers'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Provider));
      
      // Live Notification for newly approved services using docChanges
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newProvider = { id: change.doc.id, ...change.doc.data() } as Provider;
          // Only notify if it's not the initial load and it's a new approved provider
          // We can use a ref or check if we are still loading
          // Actually, onSnapshot returns initial data first.
          // A better way: check change.doc.metadata.hasPendingWrites is false and it's not the first sync.
        }
      });

      // Simple length check is often enough if we track previous length in a Ref
      // But let's just update the list and use the length of state if needed.
      
      setProviders(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'providers');
    });

    return () => unsubscribe();
  }, []);

  const handleAiSearch = async (queryOverride?: string) => {
    const queryToUse = queryOverride !== undefined ? queryOverride : searchQuery;
    if (!queryToUse.trim()) return;
    
    setIsAiSearching(true);
    try {
      const prompt = `User search query: "${queryToUse}". 
      Analyze this query and return a JSON object with:
      {
        "category": "one of: service, transport, property, business, prof, or 'all'",
        "intent": "brief description of what user wants",
        "keywords": ["list", "of", "keywords"]
      }
      Respond ONLY with JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              intent: { type: Type.STRING },
              keywords: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestion: {
                type: Type.OBJECT,
                properties: {
                  text_bn: { type: Type.STRING },
                  text_en: { type: Type.STRING },
                  screen: { type: Type.STRING },
                  icon: { type: Type.STRING }
                }
              }
            },
            required: ["category", "intent", "keywords"]
          }
        }
      });
      
      const aiResult = extractJson(response.text || '{}');
      
      if (aiResult.category && aiResult.category !== 'all') {
        setActiveCategory(aiResult.category);
      }

      if (aiResult.suggestion) {
        setAiSuggestion(aiResult.suggestion);
      } else {
        // Smart fallback logic for common keywords
        const lowerQ = queryToUse.toLowerCase();
        if (lowerQ.includes('hospital') || lowerQ.includes('হাসপাতাল') || lowerQ.includes('doctor') || lowerQ.includes('ডাক্তার')) {
          setAiSuggestion({
            text_bn: 'আপনি কি জরুরি স্বাস্থ্যসেবা খুঁজছেন? আমাদের হেলথ ক্যাটাগরি দেখুন।',
            text_en: 'Looking for emergency healthcare? Check our Health section.',
            screen: 'HEALTH',
            icon: 'Stethoscope'
          });
        } else if (lowerQ.includes('map') || lowerQ.includes('ম্যাপ') || lowerQ.includes('location') || lowerQ.includes('লোকেশন')) {
          setAiSuggestion({
            text_bn: 'ম্যাপে সব সার্ভিস দেখতে এক্সপ্লোর ম্যাপ ব্যবহার করুন।',
            text_en: 'Use Explore Map to view all services near you.',
            screen: 'MAP',
            icon: 'Navigation'
          });
        }
      }
      
      // Perform local search based on keywords
      const matchedIds = providers
        .filter(p => {
          const text = `${p.name} ${p.description} ${p.category} ${p.subCategory}`.toLowerCase();
          return aiResult.keywords.some((k: string) => text.includes(k.toLowerCase()));
        })
        .map(p => p.id);
      
      setAiResultIds(matchedIds.length > 0 ? matchedIds : null);
      
    } catch (error) {
      console.error('AI search error:', error);
    } finally {
      setIsAiSearching(false);
    }
  };

  // Speech Recognition setup for AI Service Hub search bar
  const [showSpeechError, setShowSpeechError] = useState(false);
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
      if (text.trim()) {
        setTimeout(() => {
          handleAiSearch(text);
        }, 150);
      }
    }
  });

  useEffect(() => {
    if (speechError && speechError !== 'aborted') {
      setShowSpeechError(true);
      const timer = setTimeout(() => {
        setShowSpeechError(false);
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert(language === 'bn' ? 'দয়া করে আগে লগইন করুন' : 'Please login first');
      return;
    }
    if (!reviewingProvider) return;

    if (reviewRating === 0) {
      alert(language === 'bn' ? 'দয়া করে একটি রেটিং নির্বাচন করুন' : 'Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Add the review
      await addDoc(collection(db, 'reviews'), {
        providerId: reviewingProvider.id,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'User',
        rating: reviewRating,
        comment: reviewComment,
        createdAt: serverTimestamp()
      });
      
      // 2. Update provider stats (rating & reviewCount)
      const providerRef = doc(db, 'providers', reviewingProvider.id);
      const currentRating = reviewingProvider.rating || 0;
      const currentCount = reviewingProvider.reviewCount || 0;
      
      const newCount = currentCount + 1;
      const newRating = Number(((currentRating * currentCount + reviewRating) / newCount).toFixed(1));
      
      await updateDoc(providerRef, {
        rating: newRating,
        reviewCount: newCount
      });
      
      // Update local state is handled by onSnapshot automatically
      
      setReviewingProvider(null);
      setReviewComment('');
      setReviewRating(5);
      alert(language === 'bn' ? 'আপনার রিভিউ সফলভাবে গ্রহণ করা হয়েছে!' : 'Thank you! Your review has been submitted.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reviews');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProviders = (() => {
    let list = activeCategory === 'ALL' 
      ? [...providers] 
      : providers.filter(p => p.category === activeCategory);

    // Calculate score for each if there is a search query
    const scoredList = list.map(p => ({
      ...p,
      searchScore: searchQuery ? calculateRelevanceScore({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        subCategory: p.subCategory,
        location: p.location
      }, searchQuery, userLocation) : 0,
      // Also ensure distance is calculated for sorting
      calculatedDistance: (userLocation && p.location) 
        ? calculateDistance(userLocation.lat, userLocation.lng, p.location.lat, p.location.lng)
        : Infinity
    }));

      // Filter by Search Query
      if (searchQuery) {
        if (aiResultIds) {
          list = scoredList.filter(p => aiResultIds.includes(p.id) || p.searchScore > 10);
        } else {
          list = scoredList.filter(p => p.searchScore > 0);
        }
      } else {
        list = scoredList;
      }

      // Filter by Sub-category
      if (activeSubCategory) {
        list = list.filter(p => p.subCategory === activeSubCategory);
      }

      // Apply Rating Filter
    if (minRating > 0) {
      list = list.filter(p => (p.rating || 0) >= minRating);
    }

    // Apply Sorting
    list.sort((a: any, b: any) => {
      // If searching, prioritize search score
      if (searchQuery && a.searchScore !== b.searchScore) {
        return b.searchScore - a.searchScore;
      }

      // Secondary sorts
      if (sortBy === 'rating') {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
      }
      
      if (sortBy === 'distance' && userLocation) {
        const distDiff = a.calculatedDistance - b.calculatedDistance;
        if (distDiff !== 0) return distDiff;
      }

      // Default newest
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    return list as Provider[];
  })();

  const recentApproved = providers
    .filter(p => p.status === 'approved')
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 5);

  const selectedService = providers.find(p => p.id === selectedServiceId);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto scroll-smooth bg-slate-50 dark:bg-dark-bg pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 px-6 pt-16 pb-8 rounded-b-[4rem] shadow-sm flex-shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/5 rounded-full blur-3xl -ml-20 -mb-20" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Star size={16} fill="currentColor" />
                </div>
                <span className="text-[10px] uppercase font-black tracking-[0.3em] text-primary/70">PRO CONNECT • VERIFIED</span>
              </div>
              <h1 className="text-3xl font-display font-black text-slate-900 dark:text-white leading-tight">
                {t.serviceHub.title}
              </h1>
              <p className="text-sm text-muted font-bn mt-1 max-w-[240px] leading-snug italic">
                {t.serviceHub.subtitle}
              </p>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddForm(true)}
              className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-xl shadow-black/10 active:scale-95 transition-all"
            >
              <Plus size={28} />
            </motion.button>
          </div>

          {/* Prominent AI Search Bar */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 rounded-[2.5rem] blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
            <div className="relative flex items-center">
              <div className="absolute left-6 flex items-center gap-3 pointer-events-none">
                <Search size={22} className="text-slate-400 group-focus-within:text-primary transition-colors" strokeWidth={2.5} />
                <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
              </div>
              <input 
                type="text"
                value={searchQuery}
                disabled={isTranscribing}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                placeholder={
                  isTranscribing 
                    ? (language === 'bn' ? "ভয়েস প্রসেস হচ্ছে..." : "Processing audio...") 
                    : isListening 
                      ? (language === 'bn' ? "বলুন, শুনছি..." : "Listening... Speak now...") 
                      : t.serviceHub.searchPlaceholder
                }
                className={cn(
                  "w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2.2rem] py-5 pl-16 outline-none transition-all font-bn text-lg shadow-inner placeholder:text-slate-400",
                  isSupported ? "pr-28" : "pr-14",
                  isTranscribing 
                    ? "text-slate-400 dark:text-slate-500 cursor-not-allowed" 
                    : isListening 
                      ? "text-rose-500 dark:text-rose-400 placeholder:text-rose-400 font-bold border-rose-300 dark:border-rose-900/50 bg-rose-50/20" 
                      : "text-slate-800 dark:text-white"
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {isSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={isTranscribing}
                    className={cn(
                      "w-11 h-11 rounded-2xl transition-all relative shrink-0 flex items-center justify-center",
                      isListening 
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/25 animate-pulse" 
                        : isTranscribing
                          ? "text-primary bg-primary/10 animate-pulse"
                          : "text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white"
                    )}
                    title={language === 'bn' ? "কণ্ঠস্বর অনুসন্ধান" : "Voice Search"}
                  >
                    {isListening && (
                      <span className="absolute inset-0 rounded-2xl bg-rose-500/30 animate-ping pointer-events-none" />
                    )}
                    {isTranscribing ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <Mic size={18} className={cn(isListening && "animate-pulse")} />
                    )}
                  </button>
                )}

                {isAiSearching ? (
                  <div className="w-11 h-11 rounded-2xl bg-primary/5 flex items-center justify-center">
                    <Loader2 size={20} className="text-primary animate-spin" />
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={() => handleAiSearch()}
                    disabled={isListening || isTranscribing}
                    className={cn(
                      "w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-secondary text-white flex items-center justify-center shadow-lg shadow-primary/20 relative group/ai",
                      (isListening || isTranscribing) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Bot size={22} className="group-hover/ai:rotate-12 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Speech Error Display */}
          <AnimatePresence>
            {showSpeechError && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-3 overflow-hidden"
              >
                <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-3xl flex items-start gap-3 text-sm font-bn text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-500" />
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
                        : "Voice input system error. Please check your connection or try again."
                    )}
                  </div>
                  <button onClick={() => setShowSpeechError(false)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 shrink-0">
                    <X size={16} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Smart Suggestion Banner */}
          <AnimatePresence>
            {aiSuggestion && (
              <motion.div 
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-6 overflow-hidden"
              >
                <div 
                  onClick={() => onNavigate(aiSuggestion.screen as any)}
                  className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/20 rounded-3xl p-4 flex items-center justify-between group cursor-pointer hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-primary shadow-sm group-hover:rotate-12 transition-transform">
                      {aiSuggestion.icon === 'Stethoscope' ? <Stethoscope size={20} /> : <Compass size={20} />}
                    </div>
                    <div>
                      <p className="text-xs font-bn font-bold text-slate-800 dark:text-white leading-tight">
                        {language === 'bn' ? aiSuggestion.text_bn : aiSuggestion.text_en}
                      </p>
                      <span className="text-[9px] text-primary font-black uppercase tracking-widest mt-1 inline-block">AI recommendation</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover:translate-x-1 transition-transform">
                    <ArrowRight size={16} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Categories Selection */}
      <div className="px-6 mt-10 overflow-x-auto scrollbar-hide pb-2 flex-shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bn font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-tight">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Filter size={14} className="text-primary" />
              </div>
              {language === 'bn' ? 'সরাসরি খুঁজুন' : 'Quick Search'}
            </h2>
            <button 
              onClick={() => setActiveCategory('ALL')}
              className={cn(
                "text-[10px] font-bn font-black px-3 py-1.5 rounded-full border-2 transition-all uppercase tracking-widest",
                activeCategory === 'ALL' 
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                  : "text-slate-400 border-slate-100 dark:border-slate-800"
              )}
            >
              {language === 'bn' ? 'সবগুলো' : 'Clear'}
            </button>
          </div>
          
          <div className="flex gap-4 overflow-x-auto scrollbar-hide py-2 px-1">
            <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => {
                  setSortBy('distance');
                  setActiveCategory('ALL');
                  const nextMode = viewMode === 'map' ? 'list' : 'map';
                  setViewMode(nextMode);
                  
                  // Trigger location request when switching to nearby/map
                  if (!userLocation) {
                    setIsLocating(true);
                    if ("geolocation" in navigator) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                          setIsLocating(false);
                        },
                        (err) => {
                          console.error("Location error:", err);
                          setIsLocating(false);
                        },
                        { enableHighAccuracy: true }
                      );
                    } else {
                      setIsLocating(false);
                    }
                  }
                }}
                className={cn(
                  "relative min-w-[90px] h-[110px] rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all p-3 border-2 group shadow-xl",
                  sortBy === 'distance' 
                    ? "bg-primary border-primary text-white shadow-primary/20" 
                    : "bg-white dark:bg-slate-800 border-slate-50 dark:border-slate-800 shadow-black/5 hover:border-slate-200"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all",
                  sortBy === 'distance' ? "bg-white/20" : "bg-slate-100 dark:bg-slate-900 text-slate-400 group-hover:bg-primary group-hover:text-white"
                )}>
                  {viewMode === 'map' ? <LayoutGrid size={22} /> : <MapIcon size={22} />}
                </div>
                <span className="text-[10px] font-bn font-black text-center leading-none uppercase tracking-tighter">
                  {viewMode === 'map' ? (language === 'bn' ? 'তালিকায়' : 'List View') : t.serviceHub.distance}
                </span>
              </motion.button>

            {CATEGORIES.map((cat, idx) => (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => {
                  setActiveCategory(cat.id === activeCategory ? 'ALL' : cat.id);
                  setActiveSubCategory(null);
                }}
                className={cn(
                  "relative min-w-[95px] h-[115px] rounded-[2.8rem] flex flex-col items-center justify-center gap-3 transition-all p-3 border-2 group shadow-xl",
                  activeCategory === cat.id 
                    ? `bg-gradient-to-br ${cat.color} border-transparent text-white` 
                    : "bg-white dark:bg-slate-800 border-slate-50 dark:border-slate-800 shadow-black/5 hover:border-slate-200"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-all shadow-inner",
                  activeCategory === cat.id ? "bg-white/20" : `bg-slate-50 dark:bg-slate-900 ${cat.accent} group-hover:scale-110`
                )}>
                  {typeof cat.icon === 'string' ? (
                    <span className="text-2xl">{cat.icon}</span>
                  ) : (
                    <cat.icon size={26} strokeWidth={2.5} />
                  )}
                </div>
                <span className="text-[11px] font-bn font-black text-center leading-tight uppercase tracking-widest px-1">
                  {language === 'bn' ? cat.bn : cat.label}
                </span>
                
                {activeCategory === cat.id && (
                  <motion.div 
                    layoutId="active-dot"
                    className="absolute -bottom-1.5 w-6 h-1.5 bg-white rounded-full z-10"
                  />
                )}
              </motion.button>
            ))}
          </div>

          {/* Sub-categories Chip Filter */}
          <AnimatePresence>
            {activeCategory !== 'ALL' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-2 overflow-x-auto scrollbar-hide py-3 px-1 mt-2"
              >
                <button
                  onClick={() => setActiveSubCategory(null)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest transition-all",
                    !activeSubCategory 
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md" 
                      : "bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700"
                  )}
                >
                  সব {CATEGORIES.find(c => c.id === activeCategory)?.bn}
                </button>
                {CATEGORIES.find(c => c.id === activeCategory)?.sub.map((sub, i) => (
                  <button
                    key={`${activeCategory}-${sub}-${i}`}
                    onClick={() => setActiveSubCategory(sub === activeSubCategory ? null : sub)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      activeSubCategory === sub 
                        ? "bg-primary text-white shadow-md shadow-primary/20" 
                        : "bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700 hover:border-primary/30"
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-6 pt-10 pb-20 space-y-12">
        
        {/* Live Buzz / Recent Providers Horizontal */}
        {recentApproved.length > 0 && (
          <section className="space-y-5">
             <div className="flex items-center justify-between px-1">
               <div className="flex flex-col">
                 <h2 className="text-lg font-bn font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-tight">
                   <div className="p-1.5 bg-secondary/10 rounded-lg">
                    <BellRing size={16} className="text-secondary animate-bounce" />
                   </div>
                   {language === 'bn' ? 'সদ্য যুক্ত হয়েছেন' : 'Recently Joined'}
                 </h2>
               </div>
             </div>
             <div className="flex gap-5 overflow-x-auto scrollbar-hide pb-4 -mx-6 px-6">
                {recentApproved.map((p, idx) => (
                   <RecentProviderCard key={p.id ? `recent-${p.id}-${idx}` : `recent-fallback-${idx}`} p={p} onSelect={() => setSelectedServiceId(p.id)} />
                 ))}
                 {false && [].map((p: any, idx) => (
                    <motion.div
                      key={`${p.id}-${idx}`}
                      whileHover={{ y: -8, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedServiceId(p.id)}
                      className="min-w-[180px] bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-black/5 cursor-pointer group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-12 -mt-12" />
                      
                      <div className="aspect-square rounded-[1.8rem] overflow-hidden mb-4 bg-slate-50 dark:bg-slate-800 relative shadow-inner">
                        <img 
                          src={getCleanImageUrl(p.businessImage || p.image, { id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[7px] font-black tracking-widest px-2 py-1 rounded-full uppercase">
                           New Entry
                        </div>
                        {p.isVerified && (
                          <div className="absolute bottom-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg">
                            <ShieldCheck size={12} />
                          </div>
                        )}
                      </div>
                      <h4 className="text-sm font-bn font-black text-slate-800 dark:text-white truncate mb-1">{p.name}</h4>
                      <p className="text-[10px] font-bn text-primary font-bold uppercase tracking-widest">{p.subCategory || p.category}</p>
                      
                      <div className="mt-3 flex items-center justify-between">
                         <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded-lg">
                           <Star size={10} fill="currentColor" />
                           {p.rating || 'New'}
                         </div>
                         <div className="w-7 h-7 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                            <ArrowRight size={14} />
                         </div>
                      </div>
                    </motion.div>
                  ))
                }
             </div>
          </section>
        )}
        
        {/* Public Feed Section */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <TrendingUp size={22} />
                </div>
                {t.serviceHub.publicFeed}
              </h2>
              <div className="flex items-center gap-2 mt-2 ml-1">
                <div className="flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] text-green-600 dark:text-green-400 font-black uppercase tracking-widest">Live Updates</span>
                </div>
                <span className="text-[10px] text-slate-400 font-bn">• {providers.length} জন ভেরিফাইড প্রোভাইডার</span>
              </div>
            </div>
            <button 
              onClick={() => setIsFeedExpanded(true)}
              className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-primary transition-all shadow-sm"
            >
              <LayoutGrid size={20} />
            </button>
          </div>

          <div className="space-y-8">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 py-4 border-y border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-hide">
                <button 
                  onClick={() => setMinRating(prev => prev === 4 ? 0 : 4)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-bn font-black transition-all border-2 whitespace-nowrap uppercase tracking-tighter",
                    minRating === 4 
                      ? "bg-amber-500 text-white border-amber-500 shadow-xl shadow-amber-500/20"
                      : "bg-white dark:bg-slate-800 text-slate-500 border-slate-50 dark:border-slate-800 soft-shadow"
                  )}
                >
                  <Star size={14} fill={minRating === 4 ? "white" : "none"} />
                  {t.serviceHub.fourPlus}
                </button>
                
                <div className="h-8 w-[2px] bg-slate-100 dark:bg-slate-800" />
                
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
                   {[
                     { id: 'newest', label: t.serviceHub.newest },
                     { id: 'rating', label: t.serviceHub.rating },
                     { id: 'distance', label: t.serviceHub.distance }
                   ].map(opt => (
                     <button
                      key={opt.id}
                      onClick={() => setSortBy(opt.id as any)}
                      className={cn(
                        "px-5 py-3 rounded-2xl text-[11px] font-bn font-black transition-all whitespace-nowrap uppercase tracking-tighter",
                        sortBy === opt.id 
                          ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg"
                          : "text-slate-400 dark:text-slate-500"
                      )}
                     >
                       {opt.label}
                     </button>
                   ))}
                </div>
            </div>

            {/* Live Notification Popup Inline in Feed */}
            <AnimatePresence>
              {notification && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/20 p-6 rounded-[3rem] shadow-xl flex items-center gap-5 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <Sparkles size={24} className="animate-pulse" />
                  </div>
                  <div className="flex-1 relative z-10">
                    <p className="text-base font-bn font-black text-slate-800 dark:text-white leading-tight">{notification.message}</p>
                    <span className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 inline-block">Flash Notification</span>
                  </div>
                  <button onClick={() => setNotification(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={24} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-6 bg-white dark:bg-slate-900 rounded-[4rem] border-2 border-slate-50 dark:border-slate-800">
                 <div className="relative">
                    <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <Bot size={24} className="absolute inset-0 m-auto text-primary animate-pulse" />
                 </div>
                 <p className="text-sm font-bn font-bold text-slate-500 animate-pulse uppercase tracking-[0.2em]">{language === 'bn' ? 'সার্ভিস ফিড লোড হচ্ছে...' : 'Syncing Service Hub...'}</p>
              </div>
            ) : viewMode === 'map' ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="relative rounded-[3.5rem] overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl min-h-[500px]">
                  <MapView 
                    services={filteredProviders.map(p => {
                      const cat = CATEGORIES.find(c => c.id === p.category);
                      return {
                        id: p.id,
                        name: p.name,
                        bnName: p.name,
                        icon: cat?.icon || Hammer,
                        color: cat?.hex || '#4F46E5',
                        category: p.category,
                        description: p.description,
                        lat: getCoordinates(p.location)?.lat,
                        lng: getCoordinates(p.location)?.lng,
                        phone: p.phone,
                        link: p.website
                      } as any;
                    })} 
                    onSelectService={(s) => setSelectedServiceId(s.id)} 
                    language={language as any}
                    userLocation={userLocation ? [userLocation.lat, userLocation.lng] : null}
                  />

                  {/* Manual Location Control Overlay */}
                  <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={handleRefreshLocation}
                      className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 text-indigo-600 flex items-center gap-3 group"
                    >
                      <Crosshair size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                      <span className="text-sm font-bn font-bold whitespace-nowrap">
                        {language === 'bn' ? 'সঠিক লোকেশন নিন' : 'Accurate Location'}
                      </span>
                    </motion.button>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-6 rounded-[2.5rem] flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                    <Info size={20} />
                  </div>
                  <p className="text-[13px] font-bn text-indigo-800 dark:text-indigo-300 leading-relaxed italic">
                    {language === 'bn' 
                      ? 'ম্যাপে আপনার চারপাশের নিকটবর্তী সেবাগুলো সহজেই খুঁজে নিন। নির্দিষ্ট লোকেশন দেখতে মার্কারগুলোতে ক্লিক করুন।' 
                      : 'Find services nearby on the map. Click on markers to see specific location details.'}
                  </p>
                </div>
              </motion.div>
            ) : filteredProviders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-8 text-center bg-white dark:bg-slate-900 rounded-[4rem] p-12 border-4 border-dashed border-slate-50 dark:border-slate-800 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 dark:bg-slate-800/50 rounded-full blur-3xl -mr-24 -mt-24" />
                 <div className="w-28 h-28 rounded-[2.5rem] bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-200">
                    <div className="relative">
                      <Search size={56} strokeWidth={1} />
                      <X size={24} className="absolute -top-1 -right-1 text-rose-400" />
                    </div>
                 </div>
                 <div>
                    <h3 className="text-2xl font-bn font-black text-slate-800 dark:text-white mb-3">{t.serviceHub.noResults}</h3>
                    <p className="text-base text-muted font-bn max-w-[240px] mx-auto leading-relaxed">
                      {language === 'bn' ? 'দুঃখিত! এই মুহূর্তে কোনো তথ্য খুঁজে পাওয়া যায়নি। আপনি এক্সপ্লোর পেজ চেক করতে পারেন।' : 'We couldn\'t find any services matching your criteria. Try visiting the Explore page for more options!'}
                    </p>
                 </div>
                 <div className="flex flex-col gap-3 w-full">
                   <button 
                    onClick={() => { setActiveCategory('ALL'); setSearchQuery(''); }}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-10 py-5 rounded-[2rem] font-bn font-black text-lg active:scale-95 transition-all shadow-xl shadow-black/10"
                   >
                     ক্লিয়ার সার্চ
                   </button>
                   <button 
                    onClick={() => onNavigate('EXPLORE')}
                    className="w-full bg-primary/10 text-primary border-2 border-primary/20 px-10 py-5 rounded-[2rem] font-bn font-black text-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                   >
                     <Compass size={20} />
                     এক্সপ্লোর করুন
                   </button>
                 </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-10">
                {filteredProviders.map((provider, idx) => (
                  <ProviderCard 
                    key={provider.id ? `prov-${provider.id}-${idx}` : `prov-fallback-${idx}`} 
                    provider={provider} 
                    language={language} 
                    t={t} 
                    userLocation={userLocation}
                    onOpen={() => setSelectedServiceId(provider.id)}
                    onReview={() => setReviewingProvider(provider)}
                    isRecommended={aiResultIds?.includes(provider.id)}
                  />
                ))}

                {/* Explore More Connectivity Card */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  onClick={() => onNavigate('EXPLORE')}
                  className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-white dark:to-slate-200 rounded-[3.5rem] p-8 text-white dark:text-slate-900 shadow-2xl shadow-black/20 relative overflow-hidden group cursor-pointer"
                >
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20 group-hover:scale-150 transition-transform duration-700" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-md flex items-center justify-center border border-white/20 dark:border-black/10">
                        <Compass size={28} className="text-primary" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bn font-black leading-tight">
                          {language === 'bn' ? 'আরও সেবা খুঁজছেন?' : 'Looking for more?'}
                        </h4>
                        <p className="text-xs text-slate-400 dark:text-slate-600 font-bn uppercase tracking-widest font-black mt-1">Discover via Categories</p>
                      </div>
                    </div>
                    <p className="text-base font-bn text-slate-300 dark:text-slate-700 leading-relaxed max-w-[280px] mb-8">
                      {language === 'bn' 
                        ? 'আমাদের এক্সপ্লোর পেজে গিয়ে বিভিন্ন ক্যাটাগরি ও ম্যাপের মাধ্যমে আরও তথ্য ও সার্ভিস খুঁজে নিন।' 
                        : 'Visit our Explore page to discover services through detailed categories and interactive maps.'}
                    </p>
                    <div className="flex items-center gap-3 font-bn font-black text-sm uppercase tracking-widest text-primary">
                      {language === 'bn' ? 'এক্সপ্লোর পেজ ভিজিট করুন' : 'Visit Explore Page'}
                      <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Full Screen Feed Modal */}
      <AnimatePresence>
        {isFeedExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-50 dark:bg-slate-950 flex flex-col font-bn w-full max-w-md mx-auto"
          >
            {/* Header */}
            <div className="px-6 pt-12 pb-6 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => setIsFeedExpanded(false)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <X size={20} />
              </button>
              <div className="flex flex-col items-center">
                <h2 className="font-bold text-slate-900 dark:text-white">
                  {language === 'bn' ? 'পাবলিক ফিড' : 'Public Feed'}
                </h2>
                <div className="flex items-center gap-1">
                   <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[10px] text-muted font-bold tracking-widest uppercase">Live Updates</span>
                </div>
              </div>
              <button className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <TrendingUp size={18} className="text-primary" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 bg-slate-50/50 dark:bg-slate-950/50">
               {filteredProviders.map((provider, idx) => (
                 <ProviderCard 
                   key={provider.id ? `prov-feed-${provider.id}-${idx}` : `prov-feed-fallback-${idx}`} 
                   provider={provider} 
                   language={language} 
                   t={t} 
                   userLocation={userLocation}
                   onOpen={() => setSelectedServiceId(provider.id)}
                   onReview={() => setReviewingProvider(provider)}
                   isRecommended={aiResultIds?.includes(provider.id)}
                 />
               ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedService && (
          <ServiceDetail 
            service={selectedService}
            language={language}
            t={t}
            onBack={() => setSelectedServiceId(null)}
            onReview={() => setReviewingProvider(selectedService)}
            userLocation={userLocation}
            allProviders={providers}
            onSelectProvider={(p) => setSelectedServiceId(p.id)}
          />
        )}

      <AnimatePresence>
        {reviewingProvider && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center font-bn w-full max-w-md mx-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 soft-shadow"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
                  <Star size={32} fill={reviewRating > 0 ? "currentColor" : "none"} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">রিভিউ প্রদান করুন</h3>
                <p className="text-xs text-muted mt-1">{reviewingProvider.name}</p>
              </div>

              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className={cn(
                      "transition-all active:scale-90",
                      reviewRating >= star ? "text-amber-500" : "text-slate-300"
                    )}
                  >
                    <Star size={32} fill={reviewRating >= star ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>

              <textarea 
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="আপনার মন্তব্য লিখুন..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-primary min-h-[100px] mb-6 dark:text-white"
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => setReviewingProvider(null)}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm"
                >
                  বাতিল
                </button>
                <button 
                  onClick={handleReviewSubmit}
                  disabled={isSubmitting}
                  className="flex-2 py-4 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : "রিভিউ দিন"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <ContributionForm 
            language={language}
            onClose={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProviderCard({ provider, language, t, userLocation, onOpen, onReview, isRecommended }: any) {
  const [imageError, setImageError] = useState(false);
  const distance = userLocation && provider.location 
    ? calculateDistance(userLocation.lat, userLocation.lng, provider.location.lat, provider.location.lng)
    : null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className={cn(
        "bg-white dark:bg-slate-900 rounded-[3.5rem] p-4 sm:p-5 shadow-xl shadow-black/5 border-2 border-transparent relative group transition-all hover:shadow-2xl hover:border-primary/10 overflow-hidden cursor-pointer",
        isRecommended && "border-primary/40 ring-8 ring-primary/5 shadow-primary/10"
      )}
    >
      {isRecommended && (
        <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-black px-6 py-2.5 rounded-bl-[2rem] flex items-center gap-2 z-10 shadow-xl shadow-primary/20 uppercase tracking-[0.2em]">
          <Sparkles size={14} className="animate-pulse" />
          {language === 'bn' ? 'স্মার্ট চয়েস' : 'Top Choice'}
        </div>
      )}

      <div className="flex flex-col gap-5 relative">
        <div className="w-full h-64 sm:h-72 rounded-[2.8rem] overflow-hidden bg-slate-50 dark:bg-slate-800 shrink-0 border-2 border-slate-100 dark:border-slate-800 shadow-inner group-hover:scale-[1.02] transition-transform duration-500 relative">
          {!imageError ? (
            <img 
              src={getCleanImageUrl(provider.businessImage || provider.image, { id: provider.id, title: provider.name, category: provider.category, subCategory: provider.subCategory })} 
              onError={() => setImageError(true)}
              className="w-full h-full object-cover" 
              alt={provider.name}
              referrerPolicy="no-referrer"
            />
          ) : (
            <img 
              src={getSmartFallbackImage({ id: provider.id, title: provider.name, category: provider.category, subCategory: provider.subCategory })} 
              className="w-full h-full object-cover animate-fade-in" 
              alt={provider.name}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          {/* User Profile Overlay */}
          <div className="absolute top-6 left-6 flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 p-2 pr-6 rounded-full shadow-2xl">
             <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white ring-2 ring-white/30 border border-primary overflow-hidden">
                <User size={20} />
             </div>
             <div className="flex flex-col">
                <span className="text-[9px] text-white/60 font-bn leading-tight">Post by</span>
                <span className="text-xs font-bn font-black text-white">{provider.userName || 'Anonymous'}</span>
             </div>
          </div>

          <div className="absolute bottom-6 left-6 flex flex-col gap-3">
             <div className="flex gap-2">
              {provider.isVerified && (
                 <div className="flex items-center gap-1.5 text-[9px] text-white font-black uppercase tracking-widest bg-emerald-500 shadow-lg px-3 py-1.5 rounded-xl border border-white/20">
                  <CheckCircle2 size={12} />
                  <span>Verified</span>
                </div>
               )}
              <div className="flex items-center gap-1.5 text-[9px] text-white font-black uppercase tracking-widest bg-black/60 shadow-lg px-3 py-1.5 rounded-xl border border-white/10">
                <Star size={12} className="text-amber-400" fill="currentColor" />
                <span>{provider.rating > 0 ? provider.rating.toFixed(1) : 'New'}</span>
              </div>
            </div>
            <h4 className="font-bn font-black text-white text-3xl drop-shadow-lg group-hover:text-primary transition-colors">{provider.name}</h4>
          </div>
        </div>
        
        <div className="flex-1 min-w-0 px-4">
          <div className="flex items-center gap-2 mb-4">
             <span className="text-[10px] text-primary font-black uppercase tracking-widest bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10">{provider.subCategory || provider.category}</span>
             {distance !== null && (
               <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-bn font-black uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                 <MapPin size={12} className="text-secondary" />
                 <span>{distance.toFixed(1)} {language === 'bn' ? 'কি:মি: দূরত্বে' : 'km away'}</span>
               </div>
             )}
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
               <MessageCircle size={14} className="text-slate-400" />
               <p className="text-[10px] font-bn font-black text-slate-400 uppercase tracking-widest">Provider Statement</p>
            </div>
            <p className="text-base text-slate-600 dark:text-slate-300 font-bn italic line-clamp-2 leading-relaxed">"{provider.description || 'প্রতিষ্ঠানের ব্যাপারে আরও জানতে প্রোফাইল ভিজিট করুন'}"</p>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t-2 border-slate-50 dark:border-slate-800/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-3 w-full">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onReview();
            }}
            className="flex-1 px-6 py-4 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-[1.8rem] text-xs font-bn font-black border border-slate-100 dark:border-slate-700 hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-2 uppercase"
          >
            <Star size={14} />
            রিভিউ
          </button>
          <button 
            className="flex-[2] px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2rem] text-xs font-bn font-black shadow-xl shadow-black/10 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase group/btn"
          >
            বিস্তারিত দেখুন
            <ChevronRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function RecentProviderCard({ p, onSelect }: { p: any, onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="min-w-[180px] bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-black/5 cursor-pointer group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-12 -mt-12" />
      
      <div className="aspect-square rounded-[1.8rem] overflow-hidden mb-4 bg-slate-50 dark:bg-slate-800 relative shadow-inner">
        {!imgError ? (
          <img 
            src={getCleanImageUrl(p.businessImage || p.image, { id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <img 
            src={getSmartFallbackImage({ id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[7px] font-black tracking-widest px-2 py-1 rounded-full uppercase">
           New Entry
        </div>
        {p.isVerified && (
          <div className="absolute bottom-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg">
            <ShieldCheck size={12} />
          </div>
        )}
      </div>
      <h4 className="text-sm font-bn font-black text-slate-800 dark:text-white truncate mb-1">{p.name}</h4>
      <p className="text-[10px] font-bn text-primary font-bold uppercase tracking-widest">{p.subCategory || p.category}</p>
      
      <div className="mt-3 flex items-center justify-between">
         <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded-lg">
           <Star size={10} fill="currentColor" />
           {p.rating || 'New'}
         </div>
         <div className="w-7 h-7 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
            <ArrowRight size={14} />
         </div>
      </div>
    </motion.div>
  );
}
