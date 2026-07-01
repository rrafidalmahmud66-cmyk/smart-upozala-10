import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, ArrowLeft, LayoutGrid, Map as MapIcon, SlidersHorizontal, Sparkles, Bot, Info, X } from 'lucide-react';
import { Screen } from '../types';
import { EXPLORE_DATA, ExploreItem } from '../data/exploreData';
import ExploreCard from '../components/ExploreCard';
import ExploreFilter from '../components/ExploreFilter';
import ExploreCategoryTabs from '../components/ExploreCategoryTabs';
import ExploreDetailsPage from './ExploreDetailsPage';
import MapView from '../components/MapView';
import { EXPLORE_CATEGORIES } from '../data/exploreCategories';
import { cn } from '../lib/utils';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { aiSearchExploreItems, AiExploreResult } from '../services/geminiService';
import { getCleanImageUrl, preloadImage } from '../lib/image-utils';

interface ExplorePageProps {
  onNavigate: (s: any) => void;
  language?: 'bn' | 'en';
  showMap?: boolean;
  initialCategory?: string;
}

export default function ExplorePage({ 
  onNavigate, 
  language = 'bn',
  showMap: initialShowMap = false,
  initialCategory = 'ALL'
}: ExplorePageProps) {
  const [activeTab, setActiveTab] = useState(initialCategory);
  
  useEffect(() => {
    setActiveTab(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ExploreItem | null>(null);
  const [showMap, setShowMap] = useState(initialShowMap);
  const [firestoreItems, setFirestoreItems] = useState<ExploreItem[]>([]);
  
  // AI Search states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiExploreResult | null>(null);

  useEffect(() => {
    // Listen to firestore for new/dynamic items
    const q = query(collection(db, 'explore_services'), orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ExploreItem[];
      setFirestoreItems(items);
    });
    return () => unsubscribe();
  }, []);

  const allItems = useMemo(() => {
    const combined = [...firestoreItems, ...EXPLORE_DATA];
    return Array.from(new Map(combined.map(item => [item.id, item])).values());
  }, [firestoreItems]);

  // Preload first 30 images in the background on load to make interaction completely fluid
  useEffect(() => {
    if (allItems.length > 0) {
      const itemsToPreload = allItems.slice(0, 30);
      // Run preloads in a staggered frame-safe callback to keep UI interactions fast while assets warm up
      const idleCallback = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 100));
      idleCallback(() => {
        itemsToPreload.forEach(item => {
          const cleanUrl = getCleanImageUrl(item.image, item);
          if (cleanUrl) {
            preloadImage(cleanUrl);
          }
        });
      });
    }
  }, [allItems]);

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsAiLoading(true);
    setAiResult(null);
    
    try {
      const result = await aiSearchExploreItems(searchQuery, allItems, language);
      setAiResult(result);
    } catch (error) {
      console.error("AI Search Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    // If we have an AI result and the search matches it, prioritize those IDs
    if (aiResult && aiResult.ids.length > 0) {
      const aiItems = allItems.filter(item => aiResult.ids.includes(item.id));
      // Sort them in the order Gemini returned
      return aiItems.sort((a, b) => aiResult.ids.indexOf(a.id) - aiResult.ids.indexOf(b.id));
    }

    return allItems.filter(item => {
      const matchesCategory = activeTab === 'ALL' || item.category === activeTab;
      const matchesSearch = 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.bengaliTitle?.includes(searchQuery) ||
        item.shortDescription?.includes(searchQuery) ||
        item.tags?.some(tag => tag.includes(searchQuery));
      return matchesCategory && matchesSearch;
    });
  }, [activeTab, searchQuery, allItems, aiResult]);

  const mappedServices = useMemo(() => {
    return filteredItems.map(item => {
      const catInfo = EXPLORE_CATEGORIES.find(c => c.id === item.category);
      const icon = catInfo ? catInfo.icon : MapIcon;
      
      const colorMap: Record<string, string> = {
        health: '#10B981',
        gov: '#475569',
        union: '#2563EB',
        agri: '#10B981',
        emergency: '#EF4444',
        finance: '#F59E0B',
        transport: '#F97316',
        edu: '#6366F1',
        tourism: '#0EA5E9',
        religious: '#8B5CF6',
        post: '#EAB308',
        utility: '#06B6D4',
        internet: '#3B82F6',
        business: '#F43F5E',
        ngo: '#10B981',
        citizen: '#14B8A6',
        legal: '#64748B',
      };
      
      const themeColor = colorMap[item.category] || '#F59E0B';

      return {
        id: item.id,
        name: item.title,
        bnName: item.bengaliTitle || item.title,
        icon: icon,
        color: themeColor,
        category: item.category,
        lat: item.latitude || 24.1985,
        lng: item.longitude || 90.4795,
      };
    });
  }, [filteredItems]);

  if (selectedItem) {
    return (
      <ExploreDetailsPage 
        item={selectedItem} 
        onBack={() => setSelectedItem(null)} 
        language={language}
      />
    );
  }

  return (
    <div className="pb-32 min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="pt-10 px-6 pb-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-start"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button 
                onClick={() => onNavigate('HOME')}
                className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 shadow-md flex items-center justify-center text-slate-500"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[10px] font-bn font-black text-primary uppercase tracking-widest">
                  {language === 'bn' ? 'এক্সপ্লোর' : 'Explore'}
                </span>
              </div>
            </div>
            <h2 className="text-4xl font-bn font-black text-slate-900 dark:text-white leading-tight">
              আমাদের <span className="text-primary italic">এলাকা</span>
            </h2>
          </div>
          
          <div className="w-14 h-14 rounded-3xl bg-white dark:bg-slate-800 shadow-xl flex items-center justify-center text-primary">
            <Compass size={28} className="animate-spin-slow" />
          </div>
        </motion.div>
      </div>

      {/* Filter & Categories */}
      <ExploreFilter 
        searchQuery={searchQuery} 
        onSearchChange={(val) => {
          setSearchQuery(val);
          if (!val) setAiResult(null);
        }}
        showMap={showMap}
        onToggleMap={() => setShowMap(!showMap)}
        language={language}
        onAiSearch={handleAiSearch}
        isAiLoading={isAiLoading}
      />

      <ExploreCategoryTabs 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          setAiResult(null); // Clear AI results when tab changes
        }}
        language={language}
      />

      {/* Results */}
      <div className="px-6 mt-4">
        {/* AI Answer Box */}
        <AnimatePresence>
          {aiResult && (aiResult.reason || aiResult.aiExplanation) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-500/20 relative">
                <div className="absolute top-4 right-4 bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30" onClick={() => setAiResult(null)}>
                  <X size={14} />
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Bot size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bn font-black text-white/90">
                      {language === 'bn' ? 'এআই সহায়ক' : 'AI Assistant'}
                    </h4>
                    <p className="text-[10px] uppercase font-black tracking-widest text-white/60">
                      Gemini 3.0 Powered
                    </p>
                  </div>
                </div>
                
                <p className="font-bn text-base leading-relaxed mb-4 text-white/90">
                  {language === 'bn' ? aiResult.aiExplanation?.bn : aiResult.aiExplanation?.en}
                </p>

                <div className="flex items-center gap-2 bg-black/10 rounded-xl p-3">
                  <Info size={16} className="text-indigo-200" />
                  <p className="text-xs font-bn text-indigo-100 italic">
                    {language === 'bn' ? aiResult.reason.bn : aiResult.reason.en}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bn font-black text-slate-800 dark:text-white">
              {aiResult ? (language === 'bn' ? 'সেরা ফলাফল' : 'Recommended Results') : (language === 'bn' ? 'সবগুলো সেবা' : 'All Services')}
            </h3>
            <span className="text-sm font-bn font-bold text-primary bg-primary/10 px-3 py-0.5 rounded-full">
              {language === 'bn' ? 'মোট ' : 'Total '}
              {language === 'bn' ? filteredItems.length.toLocaleString('bn-BD') : filteredItems.length}
            </span>
          </div>
          <button className="text-slate-400 hover:text-primary transition-colors">
            <SlidersHorizontal size={20} />
          </button>
        </div>

        {showMap ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mb-8"
          >
            <MapView 
              services={mappedServices} 
              onSelectService={(service) => {
                const originalItem = allItems.find(item => item.id === service.id);
                if (originalItem) {
                  setSelectedItem(originalItem);
                }
              }}
              language={language}
            />
          </motion.div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {filteredItems.map((item, idx) => (
              <motion.div
                key={`explore-item-${item.id}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.4) }}
              >
                <ExploreCard item={item} onClick={setSelectedItem} language={language} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
             <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-[3rem] flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Sparkles size={48} />
             </div>
             <h4 className="text-xl font-bn font-bold text-slate-800 dark:text-white mb-2">কোনো তথ্য পাওয়া যায়নি</h4>
             <p className="text-sm font-bn text-slate-400">আপনার সার্চটি পরিবর্তন করে পুনরায় চেষ্টা করুন</p>
          </div>
        )}
      </div>
    </div>
  );
}
