import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CloudSun, 
  Search, 
  ArrowRight, 
  TrendingUp, 
  Bell, 
  MapPin, 
  PhoneCall, 
  Zap, 
  Activity, 
  ShieldCheck,
  ChevronRight,
  Plus,
  X,
  Phone,
  ExternalLink,
  HelpCircle,
  Files,
  Trash2,
  Clock,
  User,
  FileText,
  Globe,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Video,
  Navigation,
  Bot,
  Sparkles,
  MessageSquare,
  Building2,
  Landmark,
  Sprout,
  Leaf,
  GraduationCap,
  Globe2,
  ArrowLeft,
  Share2
} from 'lucide-react';
import { collection, getDocs, query, limit, orderBy, doc, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { Screen, ServiceItem } from '../types';
import { cn, handleShare } from '../lib/utils';
import { getNewsFallbackImage, getCleanImageUrl, getDynamicServiceGradient, getServiceCoverPlaceholder } from '../lib/image-utils';
import { Language, translations } from '../translations';
import ContributionForm from '../components/ContributionForm';
import { EXPLORE_CATEGORIES } from '../data/exploreCategories';
import { EXPLORE_DATA } from '../data/exploreData';

function ServiceIconWrapper({ icon, size = 24, className = '', color }: { icon: any, size?: number, className?: string, color?: string }) {
  if (!icon) {
    return <Activity size={size} className={className} style={color ? { color } : undefined} />;
  }
  
  if (typeof icon === 'string') {
    if (icon.match(/[\p{Emoji}]/u)) {
      return (
        <span 
          className={cn("select-none leading-none", className)} 
          style={{ fontSize: `${size * 0.8}px` }}
        >
          {icon}
        </span>
      );
    }
    return <Activity size={size} className={className} style={color ? { color } : undefined} />;
  }

  const IconComponent = icon;
  try {
    return <IconComponent size={size} className={className} style={color ? { color } : undefined} />;
  } catch (err) {
    return <Activity size={size} className={className} style={color ? { color } : undefined} />;
  }
}


export default function HomeScreen({ 
  onNavigate, 
  onOpenSearch,
  language = 'bn',
  initialSelectedService = null,
  onClearSelectedService = () => {},
  setExploreCategory,
  initialTrackingId = null,
  onClearInitialTrackingId = () => {},
  appSettings = {
    maintenanceMode: false,
    appBanner: '',
    systemAlert: '',
    contactEmail: 'admin@sreepur.gov.bd',
    supportPhone: '01733373043'
  }
}: { 
  onNavigate: (s: Screen) => void, 
  onOpenSearch: () => void,
  language?: Language,
  initialSelectedService?: ServiceItem | null,
  onClearSelectedService?: () => void,
  setExploreCategory?: (c: string) => void,
  initialTrackingId?: string | null,
  onClearInitialTrackingId?: () => void,
  appSettings?: {
    maintenanceMode: boolean;
    appBanner: string;
    systemAlert: string;
    contactEmail: string;
    supportPhone: string;
  }
}) {
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [showContributionForm, setShowContributionForm] = useState(false);
  const [temperature, setTemperature] = useState<number | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=24.1985&longitude=90.4795&current=temperature_2m');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (data && data.current && typeof data.current.temperature_2m === 'number') {
          setTemperature(Math.round(data.current.temperature_2m));
        }
      } catch (err) {
        console.warn('Failed to fetch real Sreepur weather:', err);
      }
    };
    fetchWeather();
    // Refresh weather every 10 minutes
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  const t = translations[language] || translations['bn'];
  const [isServiceLoading, setIsServiceLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dbServices, setDbServices] = useState<ServiceItem[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'explore_services'), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
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
      setDbServices(docs.filter(s => s.isVisible));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'explore_services');
    });
    return () => unsub();
  }, []);

  const allServices = dbServices;

  useEffect(() => {
    if (initialSelectedService) {
      handleServiceClick(initialSelectedService);
      onClearSelectedService();
    }
  }, [initialSelectedService]);
  
  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [recentTracking, setRecentTracking] = useState<any[]>([]);
  
  // News State
  const [realNews, setRealNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    // Load local history of tracking IDs
    const savedTracking = localStorage.getItem('recent_tracking_ids');
    if (savedTracking) {
      try {
        setRecentTracking(JSON.parse(savedTracking));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const fetchRealNews = async () => {
      try {
        // Resilient news fetch
        const resilientNewsFetch = async () => {
          try {
            return await getDocs(query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(5)));
          } catch (err: any) {
            if (err.message?.includes('offline') || err.message?.includes('unavailable')) {
              await new Promise(r => setTimeout(r, 1500));
              return await getDocs(query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(5)));
            }
            throw err;
          }
        };
        const newsSnap = await resilientNewsFetch();
        setRealNews(newsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("News fetch error:", error);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchRealNews();
  }, []);

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে এই অভিযোগটি স্থায়ীভাবে মুছে ফেলতে চান?' : 'Are you sure you want to delete this report permanently?')) return;
    setIsTracking(true);
    try {
      await deleteDoc(doc(db, 'reports', id));
      setTrackingResult(null);
      setTrackingId('');
      alert(language === 'bn' ? 'রিপোর্টটি সফলভাবে মুছে ফেলা হয়েছে!' : 'Report deleted successfully!');
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
    } finally {
      setIsTracking(false);
    }
  };

  const handleTrackReport = async (idToTrack?: string) => {
    const id = (idToTrack || trackingId).trim();
    if (!id) return;
    
    setIsTracking(true);
    setTrackingError('');
    
    try {
      const reportRef = doc(db, 'reports', id);
      
      // Resilient getDoc
      const resilientGetDoc = async () => {
        try {
          return await getDoc(reportRef);
        } catch (err: any) {
          if (err.message?.includes('offline') || err.message?.includes('unavailable')) {
             await new Promise(r => setTimeout(r, 1500));
             return await getDoc(reportRef);
          }
          throw err;
        }
      };

      const reportSnap = await resilientGetDoc();

      if (reportSnap.exists()) {
        const data = { id: reportSnap.id, ...reportSnap.data() };
        setTrackingResult(data);
        
        // Clear error if success
        setTrackingError('');
        
        // Update local history
        const newHistory = [id, ...recentTracking.filter(i => i !== id)].slice(0, 5);
        setRecentTracking(newHistory);
        localStorage.setItem('recent_tracking_ids', JSON.stringify(newHistory));
      } else {
        setTrackingResult(null);
        setTrackingError(language === 'bn' ? 'দুঃখিত, এই ট্র্যাকিং আইডি দিয়ে কোনো রিপোর্ট পাওয়া যায়নি।' : 'Sorry, no report found with this tracking ID.');
      }
    } catch (error: any) {
      console.warn("Tracking error (network state):", error);
      setTrackingResult(null);
      const isOfflineError = 
        error?.message?.toLowerCase().includes('offline') || 
        error?.message?.toLowerCase().includes('failed to get document') ||
        error?.toString().toLowerCase().includes('offline') ||
        error?.message?.toLowerCase().includes('network-request-failed') ||
        error?.message?.toLowerCase().includes('unavailable');

      if (isOfflineError) {
        setTrackingError(language === 'bn' 
          ? 'আপনার ইন্টারনেট সংযোগটি অফলাইন বা দুর্বল। অনুগ্রহ করে সংযোগ নিশ্চিত করে আবার ট্র্যাকিং কোড দিন।' 
          : 'Your connection is offline or weak. Please verify your internet connection and verify the tracking code again.');
      } else {
        setTrackingError(language === 'bn' ? 'সার্ভারে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।' : 'Server error. Please try again.');
      }
    } finally {
      setIsTracking(false);
    }
  };

  useEffect(() => {
    if (initialTrackingId) {
      setTrackingId(initialTrackingId);
      handleTrackReport(initialTrackingId);
      onClearInitialTrackingId();
      
      setTimeout(() => {
        const el = document.getElementById('status-tracker-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, [initialTrackingId]);

  const handleServiceClick = (service: ServiceItem) => {
    setSelectedService(service);
  };

  const catNames: Record<string, string> = language === 'bn' ? {
    health: 'স্বাস্থ্য',
    gov: 'সরকারি',
    edu: 'শিক্ষা',
    transport: 'পরিবহন',
    travel: 'ভ্রমণ',
    news: 'খবর',
    land: 'ভূমি সেবা',
    services: 'অন্যান্য',
    emergency: 'জরুরি',
    culture: 'সংস্কৃতি',
    food: 'খাদ্য ও পণ্য',
    finance: 'ব্যাংক ও অর্থ',
    citizen: 'নাগরিক সেবা',
    utility: 'ইউটিলিটি',
    professional: 'পেশাদার',
    logistics: 'লজিস্টিকস',
    market: 'বাজার ও জ্বালানি',
    consumer: 'ভোক্তা অধিকার'
  } : {
    health: 'Health',
    gov: 'Gov',
    edu: 'Education',
    transport: 'Transport',
    travel: 'Travel',
    news: 'News',
    land: 'Land',
    services: 'Services',
    emergency: 'Emergency',
    culture: 'Culture',
    food: 'Food',
    finance: 'Finance',
    citizen: 'Citizen',
    utility: 'Utility',
    professional: 'Professional',
    logistics: 'Logistics',
    market: 'Market',
    consumer: 'Consumer'
  };

  const bnToEn = (str: string) => {
    if (!str) return '';
    const digits: any = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return str.replace(/[০-৯]/g, (w) => digits[w]);
  };

  const enToBn = (str: string) => {
    if (!str) return '';
    const digits: any = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
    return str.replace(/[0-9]/g, (w) => digits[w]);
  };

  const POPULAR_KEYWORDS = language === 'bn' ? [
    'সাফারি পার্ক', 'হাসপাতাল', 'থানা', 'ট্রেন', 'সার্ভিস', 'ডাক্তার'
  ] : [
    'Safari Park', 'Hospital', 'Police', 'Train', 'Service', 'Doctor'
  ];

  const getNum = (num: string) => language === 'bn' ? num : bnToEn(num);

  return (
    <div className="pb-32">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.15
            }
          }
        }}
      >
        {/* System Alert */}
        {appSettings.systemAlert && (
          <motion.section 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="px-6 pt-4"
          >
            <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-red-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                <AlertCircle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bn font-bold text-red-500 uppercase tracking-widest block mb-1">জরুরি ঘোষণা</span>
                <p className="text-red-600 dark:text-red-400 font-bn font-bold text-xs truncate">
                  {appSettings.systemAlert}
                </p>
              </div>
              <button 
                onClick={() => {
                  const val = window.confirm(appSettings.systemAlert);
                }}
                className="text-[10px] font-bn font-bold text-red-500 hover:underline"
              >
                বিস্তারিত
              </button>
            </div>
          </motion.section>
        )}

        {/* Dynamic Header & Search */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 pt-4 pb-8"
        >
        <div className="relative rounded-[3.5rem] overflow-hidden bg-slate-900 shadow-2xl shadow-primary/20 h-[420px]">
           <motion.img 
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.7 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            src="https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&q=80&w=1200" 
            className="w-full h-full object-cover"
            alt="Smart City Connectivity"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent p-10 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-4 bg-white/10 backdrop-blur-md w-fit px-4 py-1.5 rounded-full border border-white/20">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-[10px] text-white/90 font-display font-bold uppercase tracking-widest">Sreepur Citizen Portal</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bn font-bold text-white mb-3 leading-tight tracking-tight">
                {t.titles.heroTitle} <br />
                <span className="text-accent underline decoration-primary/50 decoration-4 underline-offset-8">{t.titles.heroSubtitle}</span>
              </h2>
              <p className="text-white/70 font-bn text-base mb-12 max-w-[280px] leading-relaxed">{t.titles.heroDescription}</p>
            </motion.div>
            
            {/* Search Input Section */}
            <div className="relative z-[60] mt-auto">
              <div className="absolute -top-9 left-6 flex items-center gap-2">
                <motion.div 
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-8 h-8 rounded-xl bg-accent/20 backdrop-blur-md flex items-center justify-center text-accent border border-accent/30"
                >
                  <Bot size={16} />
                </motion.div>
                <span className="text-[10px] font-bn font-bold text-white/60 tracking-wider">Ask anything...</span>
              </div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="relative group"
              >
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-accent transition-colors">
                  <Search size={24} />
                </div>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => onOpenSearch()}
                  placeholder={language === 'bn' ? 'সেবা বা তথ্য খুঁজুন...' : 'Search services or info...'}
                  className="w-full bg-white/10 backdrop-blur-xl border-2 border-white/20 rounded-[2.5rem] py-6 pl-16 pr-16 text-white placeholder:text-white/40 focus:border-accent focus:bg-white/20 outline-none transition-all font-bn text-lg shadow-2xl"
                />
                
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2 z-10">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onNavigate('AI_CHATT' as any);
                    }}
                    className="p-3 bg-accent text-slate-900 rounded-full shadow-lg cursor-pointer"
                  >
                    <Sparkles size={20} />
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </div>

           {/* Floating Weather Tag */}
           <motion.a 
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            href="https://www.google.com/search?q=sreepur+gazipur+weather"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-6 right-6 glass dark:bg-slate-900/40 rounded-[1.5rem] p-2 pr-4 flex items-center gap-2 border border-white/10 shadow-2xl cursor-pointer active:scale-95 transition-transform z-10"
           >
              <div className="w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                <CloudSun size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-display font-bold text-white leading-none">
                  {language === 'bn' ? `${enToBn((temperature ?? 31).toString())}°` : `${temperature ?? 31}°`}
                </span>
                <span className="text-[8px] font-display font-bold text-white/50 uppercase tracking-tighter">
                  {language === 'bn' ? 'শ্রীপুর' : 'Sreepur'}
                </span>
              </div>
           </motion.a>
        </div>
      </motion.section>

      <AnimatePresence>
        {showContributionForm && (
          <ContributionForm 
            language={language}
            onClose={() => setShowContributionForm(false)}
          />
        )}
      </AnimatePresence>

        {/* Contribution Trigger */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-10"
        >
          <button 
            onClick={() => setShowContributionForm(true)}
            className="w-full bg-primary/5 dark:bg-primary/10 border-2 border-dashed border-primary/20 rounded-[2.5rem] p-6 flex items-center justify-between group hover:bg-primary/10 transition-all font-bn"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg group-hover:rotate-90 transition-transform duration-500">
                <Plus size={24} />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-slate-800 dark:text-white leading-tight">নতুন তথ্য যোগ করুন</h4>
                <p className="text-xs text-muted">আপনার এলাকার কোনো তথ্য বাদ গেলে আমাদের জানান</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-primary/40 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.section>

        {/* Priority Actions */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-12 grid grid-cols-2 gap-5"
        >
          <PriorityCard 
            icon={PhoneCall} 
            label={t.titles.emergencyHelp} 
            sub={language === 'bn' ? "৯৯৯ ও অভিযোগ" : "999 & Reports"} 
            color="from-rose-500 to-red-600" 
            onClick={() => onNavigate('EMERGENCY')} 
          />
          <PriorityCard 
            icon={Activity} 
            label={t.titles.nationalHealth} 
            sub={language === 'bn' ? "হাসপাতাল ও ডাক্তার" : "Hospital & Doctors"} 
            color="from-teal-500 to-emerald-600" 
            onClick={() => onNavigate('HEALTH')} 
          />
        </motion.section>

      {/* AI Hub Promotion Card */}
      <motion.section 
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          show: { opacity: 1, scale: 1 }
        }}
        className="px-6 mb-12"
      >
        <div 
          onClick={() => onNavigate('SERVICE_HUB' as any)}
          className="relative rounded-[3rem] p-8 overflow-hidden group cursor-pointer"
        >
          {/* Background with intelligent look */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-blue-600 to-primary" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -translate-y-20 translate-x-20" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/20 rounded-full blur-[80px] translate-y-20 -translate-x-20" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />

          <div className="relative z-10 flex items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 bg-white/20 backdrop-blur-md w-fit px-3 py-1 rounded-full border border-white/20">
                <Sparkles size={14} className="text-white animate-pulse" />
                <span className="text-[10px] text-white font-bold uppercase tracking-widest">New Feature</span>
              </div>
              <h3 className="text-2xl font-bn font-bold text-white mb-2 leading-tight">
                {t.serviceHub.title}
              </h3>
              <p className="text-white/70 font-bn text-sm leading-relaxed max-w-[200px]">
                {t.serviceHub.subtitle}
              </p>
              <div className="mt-6 flex items-center gap-3 text-white font-bn font-bold text-sm">
                <span>সার্ভিস খুঁজুন</span>
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-2 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform duration-500">
                <div className="relative">
                  <Bot size={40} className="text-white" />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Sparkles size={16} className="text-accent" />
                  </motion.div>
                </div>
              </div>
              
              {/* Decorative rings */}
              <div className="absolute inset-0 -m-4 border border-white/5 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="absolute inset-0 -m-8 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
            </div>
          </div>
        </div>
      </motion.section>


        {/* Services Grid Section */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-10"
        >
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
               <Activity size={22} />
            </div>
            <div>
              <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight leading-none">{t.titles.mainServices}</h3>
              <p className="text-[10px] font-bn font-bold text-slate-400 uppercase tracking-[0.2em] mt-1.5">Citizen Resource Network</p>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('EXPLORE')}
            className="group flex items-center gap-2 text-primary font-bn font-black text-sm bg-primary/10 pl-5 pr-3 py-2.5 rounded-2xl active:scale-95 transition-all hover:bg-primary hover:text-white shadow-xl shadow-primary/5"
          >
            {t.titles.viewAll} 
            <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-transform">
              <ChevronRight size={14} />
            </div>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-y-12 gap-x-4 px-2 pb-12">
          {EXPLORE_CATEGORIES.slice(0, 16).map((cat, idx) => {
            const count = EXPLORE_DATA.filter(item => item.category === cat.id).length;
            return (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (setExploreCategory) setExploreCategory(cat.id);
                  onNavigate('EXPLORE');
                }}
                className="flex flex-col items-center gap-3 group"
              >
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg transition-all duration-300 group-hover:shadow-primary/20 relative overflow-hidden",
                  cat.color
                )}>
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-25 transition-opacity" />
                  <ServiceIconWrapper icon={cat.icon} size={28} className="text-white relative z-10" />
                </div>
                <div className="text-center">
                  <span className="text-[11px] font-bn font-bold text-slate-800 dark:text-slate-200 block truncate w-20">
                    {language === 'bn' ? cat.bn : cat.en}
                  </span>
                  <span className="text-[9px] font-bn text-primary font-bold">
                    {language === 'bn' ? `${count}টি সেবা` : `${count} Services`}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

        {/* News Section */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-12"
        >
        <div className="flex justify-between items-end mb-8">
          <div>
            <span className="text-[10px] font-display font-bold text-primary uppercase tracking-[0.2em] mb-2 block">Updates</span>
            <h3 className="text-3xl font-display font-bold text-title tracking-tight leading-none">{t.titles.latestNews}</h3>
          </div>
          <button onClick={() => onNavigate('NEWS')} className="text-primary text-sm font-bn font-bold border-b-2 border-primary/20 pb-1 hover:border-primary transition-all">{t.titles.allNews}</button>
        </div>
        <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide -mx-6 px-6">
          {newsLoading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="min-w-[280px] h-72 bg-slate-100 dark:bg-slate-800 rounded-[3rem] animate-pulse" />
            ))
          ) : realNews.length > 0 ? (
            realNews.map((news, idx) => (
              <NewsCard 
                key={`${news.id}-${idx}`}
                image={news.image || getNewsFallbackImage(news.title, news.category)}
                title={news.title}
                date={news.createdAt?.seconds ? new Date(news.createdAt.seconds * 1000).toLocaleDateString('bn-BD') : "সাম্প্রতিক"}
                category={news.category}
                videoUrl={news.videoUrl}
              />
            ))
          ) : (
            <NewsCard 
              image={getNewsFallbackImage("শ্রীপুর নাগরিক সেবায় আপনাকে স্বাগতম", "সাধারণ")}
              title="শ্রীপুর নাগরিক সেবায় আপনাকে স্বাগতম"
              date="সাম্প্রতিক"
              category="সাধারণ"
            />
          )}
        </div>
      </motion.section>

      {/* Local Marketplace Promotion Card */}
      <motion.section 
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          show: { opacity: 1, scale: 1 }
        }}
        className="px-6 mb-12"
      >
        <div 
          onClick={() => onNavigate('MARKETPLACE')}
          className="relative rounded-[3rem] p-8 overflow-hidden group cursor-pointer font-bn"
        >
          {/* Background orange-amber gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -translate-y-20 translate-x-20" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/20 rounded-full blur-[80px] translate-y-20 -translate-x-20" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />

          <div className="relative z-10 flex items-center justify-between gap-6 font-bn">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 bg-white/20 backdrop-blur-md w-fit px-3 py-1 rounded-full border border-white/20">
                <span className="text-[10px] text-white font-bold uppercase tracking-widest">{language === 'bn' ? 'আঞ্চলিক সেবা' : 'Local Services'}</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 leading-tight">
                {language === 'bn' ? "লোকাল মার্কেটপ্লেস" : "Local Marketplace"}
              </h3>
              <p className="text-white/85 text-xs leading-relaxed max-w-[240px]">
                {language === 'bn' ? "পণ্য কেনাবেচা, হোম ডেলিভারি ও রাইডার সার্ভিস" : "Buy, Sell, Delivery & Rider Services"}
              </p>
              <div className="mt-6 flex items-center gap-3 text-white font-bold text-sm">
                <span>{language === 'bn' ? 'মার্কেটপ্লেস দেখুন' : 'Explore Marketplace'}</span>
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-2 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform duration-500">
                <span className="text-5xl">🏪</span>
              </div>
              
              {/* Decorative rings */}
              <div className="absolute inset-0 -m-4 border border-white/5 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="absolute inset-0 -m-8 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
            </div>
          </div>
        </div>
      </motion.section>

      {/* Community Buzz Banner */}
      <motion.section 
        variants={{
          hidden: { opacity: 0, scale: 0.9 },
          show: { opacity: 1, scale: 1 }
        }}
        className="px-6 mb-12"
      >
        <div 
          onClick={() => onNavigate('SERVICE_HUB' as any)}
          className="bg-accent/10 dark:bg-accent/5 border-2 border-accent/20 rounded-[3rem] p-6 flex items-center justify-between group cursor-pointer overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-accent shadow-xl group-hover:rotate-12 transition-transform">
              <TrendingUp size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bn font-black text-accent uppercase tracking-widest">{language === 'bn' ? 'লাইভ আপডেট' : 'Live Updates'}</span>
              </div>
              <h4 className="font-bn font-black text-slate-800 dark:text-white text-xl leading-tight">সার্ভিস হাবে নতুন কী আছে?</h4>
              <p className="text-xs text-slate-500 font-bn mt-1">{language === 'bn' ? 'সম্প্রতি যুক্ত হওয়া সার্ভিসগুলো দেখুন' : 'Check out newly added services'}</p>
            </div>
          </div>
          <div className="w-12 h-12 rounded-full bg-accent text-slate-900 flex items-center justify-center shadow-lg group-hover:translate-x-2 transition-transform">
            <ArrowRight size={20} />
          </div>
        </div>
      </motion.section>

        {/* Service Tracker */}
        <motion.section 
          id="status-tracker-section"
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-12"
        >
        <div className="bg-slate-900 rounded-[3rem] sm:rounded-[3.5rem] p-6 sm:p-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:scale-125 transition-transform duration-1000" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full blur-[60px]" />
          
          <div className="flex items-center gap-5 mb-10">
            <div className="w-16 h-16 rounded-[2rem] bg-white/10 flex items-center justify-center text-primary backdrop-blur-xl border border-white/10 shadow-inner">
              <Activity size={32} />
            </div>
            <div>
              <span className="text-[10px] font-display font-bold text-primary uppercase tracking-[0.2em] mb-1 block">Live Status</span>
              <h3 className="text-3xl font-bn font-bold text-white leading-tight">{t.titles.trackStatus}</h3>
            </div>
          </div>

          <div className="relative mb-10">
            <div className="flex flex-row gap-2 border-2 border-white/20 dark:border-slate-700/50 bg-white/10 dark:bg-slate-900/50 rounded-[2.5rem] p-1.5 sm:p-2 items-center shadow-lg">
              <input 
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrackReport()}
                placeholder={t.titles.trackPlaceholder} 
                className="flex-1 bg-transparent py-3 px-4 sm:py-4 sm:px-6 text-white placeholder:text-white/40 outline-none font-bn text-sm sm:text-lg min-w-0"
              />
              <button 
                onClick={() => handleTrackReport()}
                disabled={isTracking || !trackingId.trim()}
                className="px-4 py-2.5 sm:px-6 sm:py-3.5 bg-primary hover:bg-accent text-white rounded-full font-bn font-bold shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5"
              >
                {isTracking ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Search size={16} />
                    <span className="text-xs sm:text-sm">{t.titles.trackButton}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!trackingResult && !isTracking && recentTracking.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-10"
              >
                <p className="text-xs font-bn text-slate-400 uppercase tracking-widest mb-4 ml-4 font-bold">{language === 'bn' ? "সাম্প্রতিক ট্র্যাকিং" : "Recent Tracking"}</p>
                <div className="flex flex-wrap gap-3">
                  {Array.from(new Set(recentTracking)).filter(Boolean).map((id, idx) => (
                    <button 
                      key={`tracking-${id}-${idx}`} 
                      onClick={() => { setTrackingId(id); handleTrackReport(id); }}
                      className="px-5 py-2.5 bg-white/10 hover:bg-primary/20 border border-white/10 rounded-full text-xs font-mono text-white/80 transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Clock size={12} className="text-primary" />
                      {id.slice(0, 14)}...
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {trackingError && (
               <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-[2.5rem] text-red-400 text-sm font-bn"
               >
                 <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <AlertCircle size={20} />
                 </div>
                 {trackingError}
               </motion.div>
            )}

            {trackingResult && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-6"
              >
                <div className="p-5 sm:p-7 bg-white/10 dark:bg-slate-900 border border-white/20 dark:border-slate-700/50 rounded-[2.5rem] backdrop-blur-xl shadow-2xl">
                    <div className="flex flex-col gap-6 mb-8">
                       <div className="flex items-start gap-4">
                         <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30 shadow-inner shrink-0 mt-1">
                            <FileText size={26} />
                         </div>
                         <div className="min-w-0 flex-1">
                           <h4 className="text-white font-bn font-bold text-2xl sm:text-3xl mb-1.5 break-words leading-tight">{trackingResult.title}</h4>
                           <p className="text-white/50 text-xs sm:text-sm font-bn tracking-wide bg-white/5 px-3 py-1 rounded-full border border-white/5 inline-flex items-center break-all">
                             {trackingResult.category} • <span className="break-all">{trackingResult.id}</span>
                           </p>
                         </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-2.5 items-center pt-4 border-t border-white/5">
                         <div className={cn(
                           "px-4 py-2 rounded-full text-[11px] font-bn font-bold uppercase tracking-widest shadow-lg",
                           trackingResult.status === 'pending' ? "bg-amber-500 text-white shadow-amber-500/20" :
                           trackingResult.status === 'resolved' ? "bg-green-500 text-white shadow-green-500/20" :
                           "bg-red-500 text-white shadow-red-500/20"
                         )}>
                           {trackingResult.status === 'pending' ? t.titles.trackPending : 
                            trackingResult.status === 'resolved' ? t.titles.trackResolved : t.titles.trackCancelled}
                         </div>
                         
                         <div className={cn(
                           "px-3 py-1.5 rounded-full text-[10px] font-bn font-bold uppercase border flex items-center gap-1.5 shadow-md",
                           (trackingResult.priority || 'medium') === 'high' ? "bg-red-500 text-white border-red-600 shadow-lg shadow-red-500/20" :
                           (trackingResult.priority || 'medium') === 'medium' ? "bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-500/20" :
                           "bg-blue-500 text-white border-blue-600 shadow-lg shadow-blue-500/20"
                         )}>
                           {(trackingResult.priority || 'medium') === 'high' ? <AlertTriangle size={11} /> : 
                            (trackingResult.priority || 'medium') === 'medium' ? <AlertCircle size={11} /> : <Clock size={11} />}
                           {t.admin.priority}: {(trackingResult.priority || 'medium').toUpperCase()}
                         </div>

                         {auth.currentUser && trackingResult.userId === auth.currentUser.uid && (
                           <button 
                             onClick={() => handleDeleteReport(trackingResult.id)}
                             className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1.5 rounded-full text-[10px] font-bn font-bold transition-all border border-red-500/20 active:scale-95 flex items-center gap-1.5 ml-auto sm:ml-0"
                           >
                              <Trash2 size={11} />
                              {language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                           </button>
                         )}
                       </div>
                    </div>
                   
                    <div className="relative pt-6 pb-4">
                      {/* Progress Track */}
                      <div className="absolute top-[23px] left-0 right-0 h-2.5 bg-white/5 dark:bg-slate-800 rounded-full" />
                      <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: trackingResult.status === 'pending' ? '25%' : trackingResult.status === 'resolved' ? '100%' : '50%' }}
                       className={cn(
                         "absolute top-[23px] left-0 h-2.5 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]",
                         trackingResult.status === 'cancelled' ? "bg-red-500 shadow-red-500/50" : "bg-primary"
                       )}
                      />

                      <div className="flex items-center justify-between relative mt-2">
                        <div className="flex flex-col items-center gap-2 sm:gap-4 flex-1">
                          <div className={cn(
                            "w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[4px] sm:border-[5px] shadow-xl transition-all duration-500 z-10", 
                            trackingResult.status === 'pending' ? "bg-primary border-slate-900" : "bg-green-500 border-slate-900"
                          )} />
                          <span className={cn("text-[9px] sm:text-xs font-bn font-bold tracking-tight text-center", trackingResult.status === 'pending' ? "text-primary" : "text-green-500")}>
                            {t.titles.trackSubmitted}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-2 sm:gap-4 flex-1">
                          <div className={cn(
                            "w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[4px] sm:border-[5px] shadow-xl transition-all duration-500 z-10", 
                            trackingResult.status === 'resolved' ? "bg-green-500 border-slate-900" : (trackingResult.status === 'cancelled' ? "bg-red-500 border-slate-900" : "bg-slate-800 border-white/20")
                          )} />
                          <span className={cn("text-[9px] sm:text-xs font-bn font-bold tracking-tight text-center", trackingResult.status === 'resolved' ? "text-green-500" : (trackingResult.status === 'cancelled' ? "text-red-500" : "text-white/40"))}>
                            {trackingResult.status === 'cancelled' ? t.titles.trackCancelled : t.titles.trackVerifying}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-2 sm:gap-4 flex-1">
                          <div className={cn(
                            "w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[4px] sm:border-[5px] shadow-xl transition-all duration-500 z-10", 
                            trackingResult.status === 'resolved' ? "bg-green-500 border-slate-900" : "bg-slate-800 border-white/20"
                          )} />
                          <span className={cn("text-[9px] sm:text-xs font-bn font-bold tracking-tight text-center", trackingResult.status === 'resolved' ? "text-green-500" : "text-white/40")}>
                            {t.titles.trackCompleted}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-6">
                       <div className="flex items-center gap-3 text-xs font-bn text-white/50 bg-white/5 px-5 py-2.5 rounded-2xl border border-white/5">
                          <Clock size={14} className="text-primary" />
                          <span>
                            {language === 'bn' ? "সর্বশেষ আপডেট" : "Last Update"}: {
                              trackingResult.updatedAt?.seconds 
                                ? new Date(trackingResult.updatedAt.seconds * 1000).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')
                                : (language === 'bn' ? "এইমাত্র" : "Just now")
                            }
                          </span>
                       </div>
                       <button 
                        onClick={() => { setTrackingResult(null); setTrackingId(''); }}
                        className="text-xs font-bn font-bold text-white bg-primary hover:bg-accent transition-all flex items-center gap-2 px-6 py-3 rounded-2xl shadow-xl shadow-primary/20 active:scale-95"
                       >
                         <Search size={14} />
                         {language === 'bn' ? "আরেকটি ট্র্যাক করুন" : "Track Another"}
                       </button>
                    </div>
                </div>
              </motion.div>
            )}

            {!trackingResult && !trackingError && !isTracking && (
               <div className="relative pt-4 pb-2 opacity-10">
                 <div className="absolute top-[21px] left-0 right-0 h-1.5 bg-white/10 rounded-full" />
                 <div className="flex items-center justify-between relative mt-1">
                  <div className="flex flex-col items-center gap-4 flex-1">
                    <div className="w-5 h-5 rounded-full bg-primary border-4 border-slate-900" />
                    <span className="text-[10px] font-bn text-primary font-bold">জমা হয়েছে</span>
                  </div>
                  <div className="flex flex-col items-center gap-4 flex-1">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border-4 border-slate-900" />
                    <span className="text-[10px] font-bn text-white/60">যাচাই বাছাই</span>
                  </div>
                  <div className="flex flex-col items-center gap-4 flex-1">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border-4 border-slate-900" />
                    <span className="text-[10px] font-bn text-white/60">সম্পন্ন</span>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

        {/* Report Banner */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-16"
        >
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('REPORT')}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[4rem] p-10 relative overflow-hidden shadow-2xl group cursor-pointer border border-white/5"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-[100px] group-hover:scale-150 transition-transform duration-1000" />
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-10 relative z-10">
            <div className="max-w-[80%] text-center md:text-left">
               <div className="w-16 h-16 bg-primary/20 rounded-[2rem] flex items-center justify-center mb-6 backdrop-blur-xl border border-white/10 mx-auto md:mx-0 shadow-inner group-hover:rotate-12 transition-transform">
                 <Zap className="text-primary" size={32} />
               </div>
               <h4 className="text-white text-3xl font-bn font-bold mb-4 tracking-tight leading-tight">আপনার এলাকার উন্নয়নে <br /> সরাসরি অংশ নিন</h4>
               <p className="text-white/60 text-lg font-bn leading-relaxed max-w-sm">যেকোনো সমস্যা বা অভিযোগ সরাসরি ম্যাপে চিহ্নিত করে রিপোর্ট করুন।</p>
            </div>
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-primary shadow-2xl group-hover:scale-110 transition-all duration-500 ring-8 ring-white/10">
              <ArrowRight size={48} className="group-hover:translate-x-2 transition-transform" />
            </div>
          </div>
        </motion.div>
      </motion.section>

        {/* Local Info Section */}
        <motion.section 
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0 }
          }}
          className="px-6 mb-12"
        >
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="text-secondary" size={22} />
          <h3 className="text-xl font-display font-bold text-title">{t.titles.infoVault}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <InfoItem 
            title={t.infoItems.portalTitle} 
            value={t.infoItems.portalDesc} 
            icon={Landmark}
            color="#6366f1"
            href="https://sreepur.gazipur.gov.bd/"
           />
           <InfoItem 
            title={t.infoItems.muniTitle} 
            value={t.infoItems.muniDesc} 
            icon={Building2}
            color="#3b82f6"
            href="https://pourashava.sreepur.gazipur.gov.bd/"
           />
           <InfoItem 
            title={t.infoItems.aisTitle} 
            value={t.infoItems.aisDesc} 
            icon={Leaf}
            color="#22c55e"
            href="https://ais.gov.bd/"
           />
           <InfoItem 
            title={t.infoItems.landTitle} 
            value={t.infoItems.landDesc} 
            icon={Globe2}
            color="#f59e0b"
            href="https://land.gov.bd"
           />
           <InfoItem 
            title={t.infoItems.prottoyonTitle} 
            value={t.infoItems.prottoyonDesc} 
            icon={FileText}
            color="#14b8a6"
            href="https://prottoyon.gov.bd/"
           />
           <InfoItem 
            title={t.infoItems.dncrpTitle} 
            value={t.infoItems.dncrpDesc} 
            icon={ShieldCheck}
            color="#f43f5e"
            href="https://dncrp.gov.bd/"
           />
           <InfoItem 
            title={t.infoItems.helpTitle} 
            value={t.infoItems.helpDesc} 
            icon={HelpCircle} 
            color="#a855f7"
            onClick={() => onNavigate('HELP')} 
           />
        </div>
        </motion.section>
      </motion.div>

      {/* Service Detail Modal */}
      <AnimatePresence>
        {selectedService && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col font-bn w-full max-w-md mx-auto shadow-2xl overflow-hidden"
          >
            {/* Immersive Cover Header */}
            <div className="relative h-72 sm:h-80 shrink-0 overflow-hidden bg-slate-950">
              <img 
                src={getServiceCoverPlaceholder(selectedService)} 
                alt={selectedService.name || selectedService.bnName}
                className="w-full h-full object-cover opacity-35 mix-blend-overlay scale-100 hover:scale-105 transition-transform duration-[4000ms]"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div 
                className="absolute inset-0 flex items-center justify-center text-white/30 transition-colors duration-700 pointer-events-none"
                style={{ background: getDynamicServiceGradient(selectedService.color, selectedService.id) }}
              >
                <ServiceIconWrapper icon={selectedService.icon} size={110} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
              
              {/* Floating Header Actions */}
              <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex items-center justify-between z-10">
                <button 
                  onClick={() => {
                    setSelectedService(null);
                    setIsServiceLoading(false);
                  }}
                  className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/20"
                >
                  <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => handleShare({
                      title: selectedService.bnName,
                      text: selectedService.description,
                      url: selectedService.link || window.location.href
                    })}
                    className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/20"
                   >
                     <Share2 size={20} />
                   </button>
                </div>
              </div>

              {/* Title Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8 pt-20">
                 <div className="flex items-center gap-2 mb-3">
                    <div className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 uppercase tracking-widest">
                       {catNames[selectedService.category] || selectedService.category}
                    </div>
                 </div>
                 <h1 className="text-4xl font-display font-bold text-white leading-tight drop-shadow-md">
                   {selectedService.bnName}
                 </h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-32 pt-8 scrollbar-hide">
              {isServiceLoading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="w-20 h-20 rounded-[2.5rem] border-4 border-primary/20 border-t-primary"
                  />
                  <div className="text-center space-y-2">
                    <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse mx-auto" />
                    <div className="h-4 w-48 bg-slate-50 dark:bg-slate-800/50 rounded-full animate-pulse mx-auto" />
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Description Section */}
                  <div className="space-y-4">
                    <p className="text-lg font-bn text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line px-2">
                      {selectedService.description || "এই সেবাটির বিস্তারিত তথ্যশীঘ্রই যুক্ত করা হবে। আমাদের সাথেই থাকুন।"}
                    </p>
                    
                    {selectedService.locationDetails && (
                      <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 rounded-3xl border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400">
                        <MapPin size={20} className="shrink-0 mt-0.5" />
                        <span className="text-sm font-bn font-bold">{selectedService.locationDetails}</span>
                      </div>
                    )}
                  </div>

                  {/* Info Cards Grid */}
                  <div className="grid grid-cols-1 gap-4">
                    {selectedService.officeHours && (
                      <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex items-center gap-5">
                        <div className="w-14 h-14 rounded-[1.8rem] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h4 className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">অফিস সময় / সেবার সময়</h4>
                            <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight">{selectedService.officeHours}</p>
                        </div>
                      </div>
                    )}

                    {selectedService.contactPerson && (
                      <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex items-center gap-5">
                        <div className="w-14 h-14 rounded-[1.8rem] bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                            <User size={24} />
                        </div>
                        <div>
                            <h4 className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">যোগাযোগের ব্যক্তি/কার্যালয়</h4>
                            <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight">{selectedService.contactPerson}</p>
                        </div>
                      </div>
                    )}

                    {selectedService.requiredDocuments && selectedService.requiredDocuments.length > 0 && (
                      <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                                <FileText size={24} />
                            </div>
                            <h4 className="font-bn font-bold text-slate-800 dark:text-white text-xl">প্রয়োজনীয় কাগজপত্র</h4>
                        </div>
                        <ul className="space-y-4">
                            {selectedService.requiredDocuments.map((doc, i) => (
                                <li key={i} className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
                                    <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 shadow-lg shadow-amber-500/30" />
                                    <span className="font-bn font-bold">{doc}</span>
                                </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {selectedService.phoneList && (
                      <div className="p-8 rounded-[3rem] bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                        <h4 className="font-bn font-bold text-slate-800 dark:text-white text-xl mb-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                               <Phone size={24} />
                            </div>
                            গুরুত্বপূর্ণ নম্বরসমূহ
                        </h4>
                        <div className="space-y-4">
                          {selectedService.phoneList.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-5 rounded-[2rem] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm group">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bn font-bold text-muted uppercase tracking-widest mb-1">{item.name}</span>
                                <span className="text-lg font-sans font-bold text-slate-800 dark:text-white">{item.number}</span>
                              </div>
                              <button 
                                onClick={() => {
                                  if (item.number.startsWith('http')) {
                                    window.open(item.number, '_blank');
                                  } else {
                                    window.open(`tel:${item.number}`, '_self');
                                  }
                                }}
                                className="p-4 bg-secondary text-white rounded-2xl active:scale-90 transition-transform shadow-lg shadow-secondary/20"
                              >
                                {item.number.startsWith('http') ? <Globe size={20} /> : <PhoneCall size={20} />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* External Links */}
                  <div className="space-y-4">
                    {selectedService.link && (
                      <a 
                        href={selectedService.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-primary/5 dark:bg-primary/10 p-6 rounded-[2.5rem] border border-primary/20 flex items-center justify-between group"
                      >
                          <div className="flex items-center gap-5">
                              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-primary shadow-lg group-hover:scale-110 transition-transform">
                                  <Globe size={24} />
                              </div>
                              <h5 className="font-bn font-bold text-slate-800 dark:text-white text-lg">অফিসিয়াল পোর্টাল</h5>
                          </div>
                          <ExternalLink size={20} className="text-primary group-hover:translate-x-1 transition-transform" />
                      </a>
                    )}

                    {selectedService.appLink && (
                      <a 
                        href={selectedService.appLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-rose-50 dark:bg-rose-950/10 p-6 rounded-[2.5rem] border border-rose-100 dark:border-rose-900/30 flex items-center justify-between group"
                      >
                          <div className="flex items-center gap-5">
                              <div className="w-14 h-14 rounded-2xl bg-[#E2136E] flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                                  <Activity size={24} />
                              </div>
                              <h5 className="font-bn font-bold text-slate-800 dark:text-white text-lg">বিকাশ পেমেন্ট</h5>
                          </div>
                          <ExternalLink size={20} className="text-[#E2136E] group-hover:translate-x-1 transition-transform" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
             {!isServiceLoading && (
               <div className="absolute bottom-0 left-0 right-0 p-8 pt-4 pb-10 bg-gradient-to-t from-white dark:from-slate-950 via-white/95 dark:via-slate-950/95 to-transparent z-[110] flex gap-4">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${selectedService.bnName}+Sreepur+Gazipur`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-[2.5rem] font-bold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                  >
                    <MapPin size={22} className="text-rose-500" />
                    <span className="text-lg font-bn">লোকেশন</span>
                  </motion.button>

                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const number = selectedService.phone || '01733373043';
                      window.open(`tel:${number}`, '_self');
                    }}
                    className="flex-[1.5] py-5 bg-primary text-white rounded-[2.5rem] font-bold shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                  >
                    <Phone size={22} />
                    <span className="text-lg font-bn">কল করুন</span>
                  </motion.button>
               </div>
             )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceIconCard({ service, idx, onClick }: { service: ServiceItem, idx: number, onClick: () => void, key?: React.Key }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.04, duration: 0.4 }}
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center gap-3 group cursor-pointer"
    >
      <div className="relative">
        {/* Soft Shadow Glow based on service color */}
        <div 
          className="absolute inset-0 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500 rounded-full"
          style={{ backgroundColor: service.color }}
        />
        
        <div 
          className={cn(
            "w-16 h-16 sm:w-20 sm:h-20 rounded-[1.8rem] sm:rounded-[2.2rem] flex items-center justify-center transition-all duration-500 relative",
            "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-none"
          )}
        >
          {/* Subtle Internal Gradient Background */}
          <div 
            className="absolute inset-0 opacity-[0.02] group-hover:opacity-[0.08] transition-opacity duration-500"
            style={{ backgroundColor: service.color }}
          />
          
          {/* The Shiny Icon Container */}
          <div 
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center relative overflow-hidden transition-all duration-500 shadow-inner group-hover:shadow-lg"
            style={{ backgroundColor: `${service.color}15` }}
          >
            {/* Glossy Overlay Pulse */}
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/40 via-transparent to-transparent rotate-45 group-hover:translate-x-full group-hover:translate-y-full transition-transform duration-1000 ease-in-out pointer-events-none" />
            
            {typeof service.icon === 'string' ? (
              <span className="text-2xl relative z-10 group-hover:scale-110 transition-transform">{service.icon}</span>
            ) : (
              <>
                <service.icon 
                  size={26} 
                  strokeWidth={2.5} 
                  className="relative z-10 transition-all duration-500 group-hover:scale-110 sm:hidden" 
                  style={{ color: service.color, filter: `drop-shadow(0 0 8px ${service.color}40)` }} 
                />
                <service.icon 
                  size={32} 
                  strokeWidth={2.5} 
                  className="relative z-10 transition-all duration-500 group-hover:scale-110 hidden sm:block" 
                  style={{ color: service.color, filter: `drop-shadow(0 0 10px ${service.color}40)` }} 
                />
              </>
            )}
          </div>
          
          {/* Reflection Effect */}
          <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        </div>
        
        {/* Playful Floating Sparkle */}
        <div className="absolute -top-1 -right-1">
          <Sparkles size={14} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
        </div>
      </div>
      
      <span className="text-[11px] sm:text-xs font-bn font-black text-slate-800 dark:text-slate-200 text-center leading-tight tracking-tight px-1 group-hover:text-primary transition-colors max-w-[75px] sm:max-w-[85px] line-clamp-2">
        {service.bnName}
      </span>
    </motion.button>
  );
}

function getYouTubeEmbedUrl(url: string) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

function NewsCard({ image, title, date, category, videoUrl }: { image: string, title: string, date: string, category?: string, videoUrl?: string, key?: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

  return (
    <motion.div 
      whileHover={{ y: -10 }}
      whileTap={{ scale: 0.98 }}
      className="min-w-[280px] bg-white dark:bg-slate-800 rounded-[3rem] overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700/50 group"
    >
      <div className="h-44 overflow-hidden relative bg-slate-100 dark:bg-slate-900">
        {isPlaying && embedUrl ? (
          <iframe
            src={`${embedUrl}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            {imageLoading && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            )}
            {!imageError ? (
              <img 
                src={getCleanImageUrl(image, { id: 'news' })} 
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
                className={cn(
                  "w-full h-full object-cover transition-all duration-700",
                  imageLoading ? "scale-105 blur-sm opacity-0" : "scale-100 blur-0 opacity-100 group-hover:scale-110"
                )}
                alt={title}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full relative">
                <img 
                  src={getNewsFallbackImage(title, category)} 
                  alt="Fallback news placeholder"
                  className="w-full h-full object-cover opacity-40 blur-[1px]"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <Globe size={40} strokeWidth={1.5} className="mb-2 opacity-60" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">কভার ইমেজ নেই / No Image</span>
                </div>
              </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            {videoUrl && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (embedUrl) setIsPlaying(true);
                  else window.open(videoUrl, '_blank');
                }}
                className="absolute inset-0 flex items-center justify-center"
              >
                 <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-110 transition-transform shadow-lg">
                   <Video size={28} fill="currentColor" />
                 </div>
              </button>
            )}
          </>
        )}
        <div className="absolute top-4 left-4 bg-white/20 backdrop-blur-md rounded-full px-4 py-1 border border-white/20">
           <span className="text-[10px] font-bn font-bold text-white uppercase tracking-wider">{category || 'খবর'}</span>
        </div>
        {isPlaying && (
          <div className="absolute top-4 right-4 flex items-center gap-2 z-30">
            {videoUrl && (
              <button 
                onClick={() => window.open(videoUrl, '_blank')}
                className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bn font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md transition-colors backdrop-blur-sm"
              >
                <Video size={10} fill="currentColor" />
                <span>ইউটিউবে দেখুন</span>
              </button>
            )}
            <button 
              onClick={() => setIsPlaying(false)}
              className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="p-6" onClick={() => !isPlaying && videoUrl && window.open(videoUrl, '_blank')}>
        <span className="text-[10px] text-muted font-bn mb-2 block">{date}</span>
        <h4 className="font-bn font-bold text-title text-lg line-clamp-2 leading-tight group-hover:text-primary transition-colors cursor-pointer">
          {title}
        </h4>
      </div>
    </motion.div>
  );
}

function PriorityCard({ icon: Icon, label, sub, color, onClick }: any) {
  return (
    <motion.button 
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "p-6 rounded-[3rem] text-white flex flex-col gap-6 text-left shadow-2xl relative overflow-hidden group",
        "bg-gradient-to-br shadow-black/10 transition-all duration-300",
        color
      )}
    >
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md shadow-inner border border-white/20">
        {typeof Icon === 'string' ? (
          <span className="text-2xl">{Icon}</span>
        ) : (
          <Icon size={28} />
        )}
      </div>
      <div className="relative z-10">
        <h4 className="text-xl font-bn font-bold leading-tight mb-1">{label}</h4>
        <p className="text-[10px] text-white/90 font-display font-bold uppercase tracking-widest">{sub}</p>
      </div>
    </motion.button>
  );
}

function InfoItem({ title, value, icon: Icon, color, onClick, href }: { title: string, value: string, icon: any, color?: string, onClick?: () => void, href?: string }) {
  const content = (
    <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
      <div 
        className={cn(
          "w-12 h-12 sm:w-16 sm:h-16 rounded-[1.2rem] sm:rounded-[1.8rem] flex items-center justify-center shrink-0 border transition-all duration-500",
          "shadow-lg shadow-slate-200/50 dark:shadow-none"
        )}
        style={{ 
          backgroundColor: color ? `${color}15` : undefined,
          borderColor: color ? `${color}30` : undefined,
        }}
      >
        {typeof Icon === 'string' ? (
          <span className="text-xl sm:text-2xl">{Icon}</span>
        ) : (
          <Icon 
            size={22} 
            style={{ color: color || '#94a3b8' }} 
            className="group-hover:scale-110 transition-transform duration-500 sm:size-[28px]" 
          />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm sm:text-base font-bn font-bold text-slate-800 dark:text-slate-100 mb-0.5 group-hover:text-primary transition-colors leading-tight">
          {title}
        </span>
        <span className="text-[10px] sm:text-xs font-bn text-muted tracking-wide leading-snug">
          {value}
        </span>
      </div>
    </div>
  );

  const buttonClass = cn(
    "w-full bg-white dark:bg-slate-800 p-3.5 sm:p-5 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-between shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-50 dark:border-slate-700 group transition-all duration-300 gap-2",
    (onClick || href) && "cursor-pointer hover:border-primary/30 hover:-translate-y-1"
  );

  if (href) {
    return (
      <motion.a 
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ x: 10 }}
        whileTap={{ scale: 0.98 }}
        className={buttonClass}
      >
        {content}
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-500 shrink-0">
          <ChevronRight size={18} className="sm:size-[22px]" />
        </div>
      </motion.a>
    );
  }

  return (
    <motion.div 
      whileHover={onClick ? { x: 10 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={buttonClass}
    >
      {content}
      <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-500 shrink-0">
        <ChevronRight size={18} className="sm:size-[22px]" />
      </div>
    </motion.div>
  );
}

