import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Search, 
  Mic, 
  MicOff, 
  Wallet, 
  Store, 
  Bike, 
  ArrowRight, 
  Plus, 
  Compass, 
  Sparkles, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Clock,
  MapPin,
  Loader2
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, onSnapshot, doc, addDoc, getDoc, setDoc, where } from 'firebase/firestore';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import { ai, extractJson } from '../lib/gemini';
import { cn } from '../lib/utils';
import { Product } from '../types';

interface MarketplaceScreenProps {
  onNavigate: (screen: any, params?: any) => void;
  language: 'bn' | 'en';
  setCurrentProductId: (id: string) => void;
}

export default function MarketplaceScreen({ onNavigate, language, setCurrentProductId }: MarketplaceScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Recharge Modal
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargePhone, setRechargePhone] = useState('');
  const [rechargeTxId, setRechargeTxId] = useState('');
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [rechargeSuccess, setRechargeSuccess] = useState(false);
  const [myRecharges, setMyRecharges] = useState<any[]>([]);

  // AI search state
  const [aiSearching, setAiSearching] = useState(false);
  const [aiRecommendationMsg, setAiRecommendationMsg] = useState('');
  const [buyerOrders, setBuyerOrders] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  // Categories
  const CATEGORIES = [
    { id: 'ALL', bn: 'সব পণ্য', en: 'All Products' },
    { id: 'veggies', bn: 'শাকসবজি ও ফলমূল', en: 'Vegetables & Fruits' },
    { id: 'poultry', bn: 'হাঁস-মুরগি ও ডিম', en: 'Poultry & Eggs' },
    { id: 'dairy', bn: 'দুগ্ধজাত পণ্য', en: 'Dairy Products' },
    { id: 'handicrafts', bn: 'হস্তশিল্প ও বুটিক', en: 'Handicrafts & Boutique' },
    { id: 'used_items', bn: 'পুরাতন জিনিস', en: 'Used Items' },
    { id: 'electronics', bn: 'ইলেকট্রনিক জিনিস', en: 'Electronics' },
    { id: 'plants_flowers', bn: 'গাছের ফুল ও চারা', en: 'Plants & Flowers' },
    { id: 'others', bn: 'অন্যান্য', en: 'Others' }
  ];

  // Load products
  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(items);
      setFilteredProducts(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load user profile & subscribe to recharge requests
  useEffect(() => {
    if (!currentUser) return;
    
    const unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data());
      }
    });

    const qRecharges = query(
      collection(db, 'rechargeRequests'),
      where('userId', '==', currentUser.uid)
    );
    const unsubRecharges = onSnapshot(qRecharges, (snap) => {
      const items: any[] = [];
      snap.forEach((d) => {
        items.push({ id: d.id, ...d.data() });
      });
      // Sort by latest
      items.sort((a, b) => {
        const tA = a.createdAt?.seconds || a.createdAt?.toDate?.()?.getTime() || 0;
        const tB = b.createdAt?.seconds || b.createdAt?.toDate?.()?.getTime() || 0;
        return tB - tA;
      });
      setMyRecharges(items);
    });

    return () => {
      unsubProfile();
      unsubRecharges();
    };
  }, [currentUser]);

  // Load buyer orders in real-time
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'orders'),
      where('buyerId', '==', currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const items: any[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort by latest createdAt robustly
      items.sort((a, b) => {
        const getMs = (dateVal: any) => {
          if (!dateVal) return 0;
          if (typeof dateVal.toMillis === 'function') return dateVal.toMillis();
          if (typeof dateVal.toDate === 'function') return dateVal.toDate().getTime();
          if (dateVal.seconds) return dateVal.seconds * 1000;
          if (dateVal instanceof Date) return dateVal.getTime();
          if (typeof dateVal === 'string') return new Date(dateVal).getTime();
          if (typeof dateVal === 'number') return dateVal;
          return 0;
        };
        return getMs(b.createdAt) - getMs(a.createdAt);
      });
      setBuyerOrders(items);
    }, (error) => {
      console.error("Error fetching buyer orders:", error);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Speech Recognition
  const { isListening, isTranscribing, error: speechError, toggleListening } = useSpeechRecognition({
    language: language === 'bn' ? 'bn' : 'en',
    onResult: (text) => {
      setSearchQuery(text);
      handleSearch(text);
    }
  });

  const triggerVoiceSearch = () => {
    toggleListening();
  };

  // Perform AI or standard search
  const handleSearch = async (queryText: string) => {
    if (!queryText.trim()) {
      setFilteredProducts(products);
      setAiRecommendationMsg('');
      return;
    }

    // Try AI Search if query looks conversational or has more than 1 word
    if (queryText.trim().split(/\s+/).length >= 1) {
      setAiSearching(true);
      try {
        const miniProducts = products.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price
        }));

        const systemInstruction = "You are a smart catalog search assistant for Sreepur Local Marketplace. The user is searching for: " + queryText;
        const prompt = `Here is a JSON array of available products: ${JSON.stringify(miniProducts)}. 
        Match the user query "${queryText}" (could be in Bengali or English, conversational like "আমার ডিম দরকার" or "fresh vegetables"). 
        Return a JSON object with:
        1. "matchedIds": string array of product IDs that match or are relevant recommendations.
        2. "recommendationReason": a short helpful friendly message in Bengali (1 sentence max) explaining the matches.
        
        Respond with ONLY the raw JSON, no markdown code blocks, no other text.`;

        const res = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const parsed = extractJson(res.text);
        if (parsed && Array.isArray(parsed.matchedIds)) {
          const matched = products.filter(p => parsed.matchedIds.includes(p.id));
          setFilteredProducts(matched);
          setAiRecommendationMsg(parsed.recommendationReason || '');
          setAiSearching(false);
          return;
        }
      } catch (err) {
        console.warn("AI search failed, falling back to standard search:", err);
      }
      setAiSearching(false);
    }

    // Standard local fuzzy search fallback
    const lowerQuery = queryText.toLowerCase();
    const matched = products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      p.description.toLowerCase().includes(lowerQuery) || 
      p.category.toLowerCase().includes(lowerQuery)
    );
    setFilteredProducts(matched);
    setAiRecommendationMsg('');
  };

  // Filter products by selected category
  useEffect(() => {
    let result = products;
    if (selectedCategory !== 'ALL') {
      result = products.filter(p => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.description.toLowerCase().includes(lower)
      );
    }
    setFilteredProducts(result);
  }, [selectedCategory, searchQuery, products]);

  // Submit Recharge Request
  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !rechargeAmount || !rechargePhone || !rechargeTxId) return;

    setRechargeLoading(true);
    try {
      await addDoc(collection(db, 'rechargeRequests'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous User',
        amount: parseFloat(rechargeAmount),
        phone: rechargePhone,
        txId: rechargeTxId,
        status: 'pending',
        createdAt: new Date()
      });
      setRechargeSuccess(true);
      setRechargeAmount('');
      setRechargePhone('');
      setRechargeTxId('');
      setTimeout(() => {
        setIsRechargeOpen(false);
        setRechargeSuccess(false);
      }, 2500);
    } catch (err) {
      console.error("Recharge request failed:", err);
    } finally {
      setRechargeLoading(false);
    }
  };

  return (
    <div className="p-6 pb-24 font-bn">
      {/* Hero Header */}
      <div className="relative rounded-[2.5rem] bg-gradient-to-r from-amber-500 to-orange-600 p-8 text-white mb-8 overflow-hidden shadow-xl shadow-orange-500/10">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative z-10">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 px-3 py-1.5 rounded-full inline-block mb-3 backdrop-blur-md">
            Sreepur Citizen Market
          </span>
          <h2 className="text-3xl font-black tracking-tight mb-2">লোকাল মার্কেটপ্লেস</h2>
          <p className="text-xs text-white/90 leading-relaxed max-w-xs">
            সরাসরি শ্রীপুরের স্থানীয় খামারি ও উদ্যোক্তাদের থেকে খাঁটি পণ্য কিনুন এবং দ্রুত রাইডার ডেলিভারি পান।
          </p>
        </div>
      </div>

      {/* Wallet Balance Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 mb-8 soft-shadow flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
            <Wallet size={28} />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block tracking-wider">আমার ওয়ালেট ব্যালেন্স</span>
            <span className="text-2xl font-black text-slate-800 dark:text-white">
              ৳ {userProfile?.walletBalance?.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>
        <button 
          onClick={() => setIsRechargeOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-amber-500/20"
        >
          <Plus size={16} /> রিচার্জ করুন
        </button>
      </div>

      {/* Role Management / Seller / Rider Dashboards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* Seller Block */}
        {userProfile?.isSeller === 'approved' ? (
          <button 
            onClick={() => onNavigate('SELLER_DASHBOARD')}
            className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 text-left flex flex-col justify-between h-32 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <h4 className="font-bold text-emerald-600 dark:text-emerald-400 text-sm leading-tight">উদ্যোক্তা প্যানেল</h4>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">পণ্য ও অর্ডার পরিচালনা</p>
            </div>
          </button>
        ) : (
          <button 
            onClick={() => onNavigate('SELLER_APPLY')}
            className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-left flex flex-col justify-between h-32 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">বিক্রেতা হোন</h4>
                {userProfile?.isSeller === 'pending' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
              </div>
              <p className="text-[9px] text-slate-400 mt-1">
                {userProfile?.isSeller === 'pending' ? 'আবেদন যাচাই চলছে' : 'সহজে দোকান খুলুন'}
              </p>
            </div>
          </button>
        )}

        {/* Rider Block */}
        {userProfile?.isRider === 'approved' ? (
          <button 
            onClick={() => onNavigate('RIDER_DASHBOARD')}
            className="p-5 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 text-left flex flex-col justify-between h-32 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center">
              <Bike size={20} />
            </div>
            <div>
              <h4 className="font-bold text-blue-600 dark:text-blue-400 text-sm leading-tight">রাইডার প্যানেল</h4>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">ডেলিভারি কাজ ও আয়</p>
            </div>
          </button>
        ) : (
          <button 
            onClick={() => onNavigate('RIDER_APPLY')}
            className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-left flex flex-col justify-between h-32 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Bike size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">রাইডার হোন</h4>
                {userProfile?.isRider === 'pending' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
              </div>
              <p className="text-[9px] text-slate-400 mt-1">
                {userProfile?.isRider === 'pending' ? 'আবেদন যাচাই চলছে' : 'ডেলিভারি দিয়ে আয় করুন'}
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Buyer Orders Tracking Section */}
      {buyerOrders.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Clock size={16} className="text-amber-500 animate-pulse" />
              {language === 'bn' ? 'আমার অর্ডার ট্র্যাকিং' : 'My Order Tracking'}
            </h3>
            <span className="text-[10px] text-amber-500 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-full font-bn">
              {language === 'bn' ? `${buyerOrders.length}টি অর্ডার` : `${buyerOrders.length} Orders`}
            </span>
          </div>

          <div className="space-y-3.5">
            {buyerOrders.slice(0, 3).map((order, idx) => {
              const isActive = order.status !== 'delivered';
              return (
                <div 
                  key={order.id ? `order-buyer-${order.id}-${idx}` : `order-buyer-fallback-${idx}`}
                  className={cn(
                    "bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:border-amber-500/30",
                    isActive 
                      ? "border-amber-500/20 dark:border-amber-500/10 bg-amber-500/[0.01] dark:bg-amber-500/[0.005]" 
                      : "border-slate-100 dark:border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 dark:text-white text-xs">
                          {order.productName} ({order.quantity}টি)
                        </span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        ID: #{order.id.slice(-6).toUpperCase()} • {language === 'bn' ? 'মোট:' : 'Total:'} ৳{order.totalAmount}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className={cn(
                        "text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider",
                        order.status === 'pending' && "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
                        order.status === 'accepted' && "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
                        order.status === 'picked' && "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
                        order.status === 'delivered' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      )}>
                        {order.status === 'pending' && (language === 'bn' ? 'অর্ডার পেন্ডিং' : 'Pending')}
                        {order.status === 'accepted' && (language === 'bn' ? (order.riderId ? 'রাইডার আসছে' : 'অর্ডার গৃহিত (রাইডার খোঁজা হচ্ছে)') : 'Accepted')}
                        {order.status === 'picked' && (language === 'bn' ? 'ডেলিভারিতে আছে' : 'On the Way')}
                        {order.status === 'delivered' && (language === 'bn' ? 'ডেলিভার্ড' : 'Delivered')}
                      </span>
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        order.status === 'pending' && "w-1/4 bg-amber-500",
                        order.status === 'accepted' && "w-2/4 bg-blue-500",
                        order.status === 'picked' && "w-3/4 bg-indigo-500",
                        order.status === 'delivered' && "w-full bg-emerald-500"
                      )}
                    />
                  </div>

                  {/* Tracking Button */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold flex items-center gap-1">
                      <MapPin size={10} className="text-slate-400" />
                      {order.sellerName || (language === 'bn' ? 'বিক্রেতার অবস্থান' : 'Seller Store')}
                    </span>
                    <button
                      onClick={() => onNavigate('ORDER_TRACKING', { orderId: order.id })}
                      className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bn font-bold text-[10px] transition-all active:scale-95 flex items-center gap-1 shadow-sm hover:shadow-md hover:shadow-amber-500/10"
                    >
                      <span>{language === 'bn' ? 'লাইভ ট্র্যাক করুন' : 'Live Track'}</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              );
            })}

            {buyerOrders.length > 3 && (
              <button 
                onClick={() => onNavigate('PROFILE')} 
                className="w-full py-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs font-bold text-slate-500 hover:text-amber-500 hover:border-amber-500/40 transition-colors"
              >
                {language === 'bn' ? `সব ${buyerOrders.length}টি অর্ডার প্রোফাইল থেকে দেখুন` : `View all ${buyerOrders.length} orders from Profile`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI & Voice Search Box */}
      <div className="mb-8">
        <div className="relative flex items-center gap-3">
          <div className="relative flex-1">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder={
                isTranscribing 
                  ? (language === 'bn' ? "কণ্ঠস্বর থেকে লেখা তৈরি করা হচ্ছে..." : "Transcribing your voice...")
                  : isListening 
                    ? (language === 'bn' ? "কথা বলুন, আমি শুনছি..." : "Listening... Speak now...")
                    : (language === 'bn' ? "পণ্য খুঁজুন... (যেমন: তাজা শাকসবজি)" : "Search products... (e.g. fresh vegetables)")
              }
              className="w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold shadow-lg shadow-black/5 focus:outline-none focus:border-amber-500 dark:focus:border-amber-500 dark:text-white"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          </div>
          <button 
            onClick={triggerVoiceSearch}
            className={cn(
              "p-4 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-lg",
              isTranscribing
                ? "bg-amber-500/10 border border-amber-500/30 text-amber-500"
                : isListening 
                  ? "bg-rose-500 text-white animate-pulse shadow-rose-500/30" 
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 border border-slate-100 dark:border-slate-800"
            )}
          >
            {isTranscribing ? (
              <Loader2 size={20} className="animate-spin text-amber-500" />
            ) : isListening ? (
              <MicOff size={20} />
            ) : (
              <Mic size={20} />
            )}
          </button>
        </div>

        {/* AI Searching status / recommendation */}
        <AnimatePresence>
          {aiSearching && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-3 flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 p-3 rounded-xl text-xs font-bold border border-amber-500/20"
            >
              <Sparkles className="animate-spin" size={14} />
              <span>আই এআই-এর মাধ্যমে আপনার মনের মতো পণ্য খুঁজে বের করা হচ্ছে...</span>
            </motion.div>
          )}

          {aiRecommendationMsg && !aiSearching && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-3 flex items-start gap-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl text-xs font-bold border border-emerald-500/20"
            >
              <Sparkles className="text-emerald-500 shrink-0 mt-0.5" size={15} />
              <p className="leading-snug">{aiRecommendationMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-6 px-6 mb-8">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "px-5 py-3 rounded-xl font-bold text-xs whitespace-nowrap transition-all duration-300",
              selectedCategory === cat.id
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            {language === 'bn' ? cat.bn : cat.en}
          </button>
        ))}
      </div>

      {/* Product List Header */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
          <TrendingUp size={18} className="text-amber-500" />
          {selectedCategory === 'ALL' ? 'সকল তাজা পণ্য' : CATEGORIES.find(c => c.id === selectedCategory)?.bn}
        </h3>
        <span className="text-xs text-slate-400 font-bold">{filteredProducts.length} টি পণ্য পাওয়া গেছে</span>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full"
          />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-8">
          <p className="text-slate-500 font-bold mb-2">কোনো পণ্য পাওয়া যায়নি।</p>
          <p className="text-xs text-slate-400">নতুন কোনো পণ্য বা অন্য বিভাগে খোঁজার চেষ্টা করুন।</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredProducts.map((p, idx) => (
            <motion.div 
              key={p.id ? `product-${p.id}-${idx}` : `product-fallback-${idx}`}
              whileHover={{ y: -4 }}
              className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] overflow-hidden flex flex-col justify-between soft-shadow h-[280px]"
            >
              {/* Image Header */}
              <div className="relative h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {p.imageUrl || p.imageBase64 ? (
                  <img 
                    src={p.imageUrl || p.imageBase64} 
                    alt={p.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-4xl text-slate-300">🏪</div>
                )}
                {/* Category tag */}
                <span className="absolute left-3 top-3 bg-black/40 backdrop-blur-md text-white text-[8px] font-bold px-2 py-1 rounded-md">
                  {CATEGORIES.find(c => c.id === p.category)?.bn || 'অন্যান্য'}
                </span>
                {/* Stock Warning */}
                {p.stock === 0 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-3 py-1 rounded-full">স্টক শেষ (Sold Out)</span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm line-clamp-1 mb-1">{p.name}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight line-clamp-2 mb-2">{p.description}</p>
                </div>
                
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-bold">বিক্রেতা: {p.sellerName || 'স্থানীয় উদ্যোক্তা'}</span>
                    <span className="text-base font-black text-amber-500">৳{p.price}</span>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setCurrentProductId(p.id);
                      onNavigate('PRODUCT_DETAIL');
                    }}
                    className="bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-500 p-2.5 rounded-xl transition-all text-slate-600 dark:text-slate-300"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Manual Wallet Recharge Modal */}
      {isRechargeOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 font-bn w-full max-w-md mx-auto">
          <div className="bg-white dark:bg-slate-900 w-full rounded-[2.5rem] overflow-hidden p-6 soft-shadow flex flex-col max-h-[95vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Wallet className="text-amber-500" size={20} /> ওয়ালেট রিচার্জ করুন
              </h3>
              <button 
                onClick={() => setIsRechargeOpen(false)}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

             <div className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-hide">
              {rechargeSuccess ? (
                <div className="py-8 text-center flex flex-col items-center">
                  <CheckCircle2 className="text-emerald-500 w-16 h-16 mb-4 animate-bounce" />
                  <h4 className="font-bold text-emerald-600 dark:text-emerald-400 text-lg mb-2">আবেদন জমা হয়েছে!</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                    আপনার রিচার্জ আবেদনটি অ্যাডমিনের কাছে পাঠানো হয়েছে। ট্রানজেকশন আইডি যাচাই করে কিছুক্ষণের মধ্যে ব্যালেন্স যোগ করা হবে।
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRechargeSubmit} className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3 mb-2 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                    <p className="leading-snug">
                      আমাদের বিকাশ/নগদ মার্চেন্ট নম্বরে <strong>০১৭৩৩৩৭৩০৪৩</strong> সেন্ড মানি করুন। তারপর নিচে আপনার প্রেরক নম্বর ও ট্রানজেকশন আইডি দিয়ে আবেদন জমা দিন।
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">রিচার্জ পরিমাণ (৳)</label>
                    <input 
                      type="number" 
                      required
                      min="10"
                      placeholder="যেমন: ৫০০"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">বিকাশ/নগদ প্রেরক নম্বর</label>
                    <input 
                      type="tel" 
                      required
                      placeholder="যেমন: ০১৭XXXXXXXX"
                      value={rechargePhone}
                      onChange={(e) => setRechargePhone(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">ট্রানজেকশন আইডি (TxID)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="যেমন: K8H9D5S8A1"
                      value={rechargeTxId}
                      onChange={(e) => setRechargeTxId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={rechargeLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all mt-4"
                  >
                    {rechargeLoading ? 'আবেদন জমা হচ্ছে...' : 'আবেদন জমা দিন'}
                  </button>
                </form>
              )}

              {/* Recharge history list */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5 mb-2">
                  <Clock size={14} className="text-indigo-500" /> রিচার্জের ইতিহাস (Recharge History)
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {myRecharges.map((req) => (
                    <div key={req.id} className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl flex justify-between items-center text-[10px]">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">৳ {req.amount}</p>
                        <p className="text-slate-400 font-mono mt-0.5">TxID: {req.txId}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold inline-block ${
                          req.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                        }`}>
                          {req.status === 'pending' ? 'অপেক্ষমান' :
                           req.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-1">
                          {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('bn-BD') : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {myRecharges.length === 0 && (
                    <div className="text-center py-4 text-slate-400 italic text-[10px]">
                      কোনো রিচার্জের ইতিহাস পাওয়া যায়নি।
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
