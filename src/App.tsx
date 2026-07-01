import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home as HomeIcon, 
  Compass, 
  PhoneCall, 
  Bell, 
  User, 
  Search,
  MessageSquare,
  ShieldHalf,
  ChevronLeft,
  Sun,
  Moon,
  Globe,
  Sparkles
} from 'lucide-react';
import { cn } from './lib/utils';
import { Screen } from './types';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { translations, Language } from './translations';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
// Pages - Split chunk-heavy modules to minimize main bundle entrypoint size
import SplashScreen from './pages/SplashScreen';
import HomeScreen from './pages/HomeScreen';
import AuthScreen from './pages/AuthScreen';

const OnboardingScreen = lazy(() => import('./pages/OnboardingScreen'));
const EmergencyScreen = lazy(() => import('./pages/EmergencyScreen'));
const NoticeScreen = lazy(() => import('./pages/NoticeScreen'));
const ProfileScreen = lazy(() => import('./pages/ProfileScreen'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const AdminScreen = lazy(() => import('./pages/AdminScreen'));
const ReportScreen = lazy(() => import('./pages/ReportScreen'));
const AIScreen = lazy(() => import('./pages/AIScreen'));
const HelpScreen = lazy(() => import('./pages/HelpScreen'));
const AIServiceHub = lazy(() => import('./pages/AIServiceHub'));
const NewsScreen = lazy(() => import('./pages/NewsScreen'));
const MarketplaceScreen = lazy(() => import('./pages/MarketplaceScreen'));
const SellerApplyScreen = lazy(() => import('./pages/SellerApplyScreen'));
const RiderApplyScreen = lazy(() => import('./pages/RiderApplyScreen'));
const ProductDetailScreen = lazy(() => import('./pages/ProductDetailScreen'));
const SellerDashboardScreen = lazy(() => import('./pages/SellerDashboardScreen'));
const RiderDashboardScreen = lazy(() => import('./pages/RiderDashboardScreen'));
const OrderTrackingScreen = lazy(() => import('./pages/OrderTrackingScreen'));

import { NotificationProvider } from './components/NotificationProvider';
import SearchPopup from './components/SearchPopup';
import { ServiceItem } from './types';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('SPLASH');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  const [language, setLanguage] = useState<Language>('bn');
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [exploreCategory, setExploreCategory] = useState<string>('ALL');
  const [initialTrackingId, setInitialTrackingId] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [selectedSearchService, setSelectedSearchService] = useState<ServiceItem | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<{
    maintenanceMode: boolean;
    appBanner: string;
    systemAlert: string;
    contactEmail: string;
    supportPhone: string;
  }>({
    maintenanceMode: false,
    appBanner: '',
    systemAlert: '',
    contactEmail: 'admin@sreepur.gov.bd',
    supportPhone: '01733373043'
  });

  const t = translations[language] || translations['bn'];
  const mainRef = useRef<HTMLElement>(null);

  // Stateful navigation history stack 
  const [screenHistory, setScreenHistory] = useState<Screen[]>(['HOME']);

  const goBack = () => {
    setScreenHistory((prev) => {
      if (prev.length <= 1) {
        setCurrentScreen('HOME');
        return ['HOME'];
      }
      const nextHistory = [...prev];
      nextHistory.pop();
      const prevScreen = nextHistory[nextHistory.length - 1];
      setCurrentScreen(prevScreen || 'HOME');
      return nextHistory;
    });
  };

  const handleNavigation = (screen: Screen, params?: { productId?: string, orderId?: string }) => {
    if (params?.productId) setSelectedProductId(params.productId);
    if (params?.orderId) setSelectedOrderId(params.orderId);

    if (screen === 'HOME') {
      setScreenHistory(['HOME']);
      setCurrentScreen('HOME');
      return;
    }
    
    setScreenHistory((prev) => {
      if (prev[prev.length - 1] === screen) return prev;
      return [...prev, screen];
    });
    setCurrentScreen(screen);
  };

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
      const mainElement = mainRef.current;
      if (mainElement) {
        mainElement.scrollTop = 0;
      }
    };

    resetScroll();

    // Multiple delayed resetting steps to guarantee scroll-to-top on lazy loading and async content render
    const timeouts = [10, 50, 100, 200, 400, 800].map(delay => 
      setTimeout(resetScroll, delay)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [currentScreen]);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAppSettings({
          ...data,
          maintenanceMode: false
        } as any);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/global');
    });

    // Reset maintenanceMode state in Firebase settings document to false to restore user access
    setDoc(doc(db, 'settings', 'global'), { maintenanceMode: false }, { merge: true })
      .catch((err) => console.warn("Could not disable database maintenanceMode:", err));

    return () => unsubSettings();
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredAppPrompt = e;
      window.dispatchEvent(new CustomEvent('app-install-prompt-ready'));
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
      
      if (firebaseUser) {
        // Fetch user role or auto initialize standard profile
        const defaultRole = (firebaseUser.email === 'admin@sreepur.gov.bd' || firebaseUser.email === 'rrafidalmahmud66@gmail.com') ? 'admin' : 'user';
        const unsubRole = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserRole(data.role || defaultRole);
            
            // Sync missing / Google details into firestore dynamically
            const updates: any = {};
            if (!data.email && firebaseUser.email) {
              updates.email = firebaseUser.email;
            }
            if (!data.displayName && firebaseUser.displayName) {
              updates.displayName = firebaseUser.displayName;
            }
            if (!data.photoURL && firebaseUser.photoURL) {
              updates.photoURL = firebaseUser.photoURL;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = new Date();
              updateDoc(doc(db, 'users', firebaseUser.uid), updates).catch(err => {
                console.error("Failed to sync profile fields:", err);
              });
            }
          } else {
            // Write standard profile if it does not exist under the strict user schema
            setDoc(doc(db, 'users', firebaseUser.uid), {
              uid: firebaseUser.uid,
              displayName: (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '').slice(0, 100),
              photoURL: firebaseUser.photoURL || '',
              email: firebaseUser.email || '',
              role: defaultRole,
              createdAt: new Date(),
              updatedAt: new Date()
            }).catch(err => {
              console.error("Failed to automatically register user profile doc:", err);
            });
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        });
        
        if (currentScreen === 'AUTH' || currentScreen === 'SPLASH') {
          setCurrentScreen('HOME');
        }
        return () => unsubRole();
      } else if (!['SPLASH', 'ONBOARDING', 'AUTH'].includes(currentScreen)) {
        setCurrentScreen('AUTH');
        setUserRole('user');
      }
    });

    return () => unsubscribe();
  }, [currentScreen]);

  useEffect(() => {
    // Basic splash logic
    if (currentScreen === 'SPLASH') {
      const timer = setTimeout(() => {
        if (!isAuthLoading) {
           setCurrentScreen(user ? 'HOME' : 'AUTH');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentScreen, isAuthLoading, user]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'SPLASH': return <SplashScreen />;
      case 'ONBOARDING': return <OnboardingScreen onFinish={() => handleNavigation('AUTH')} />;
      case 'AUTH': return <AuthScreen />;
      case 'HOME': return (
        <HomeScreen 
          onNavigate={handleNavigation} 
          onOpenSearch={() => setShowGlobalSearch(true)}
          language={language} 
          appSettings={appSettings} 
          setExploreCategory={setExploreCategory}
          initialTrackingId={initialTrackingId}
          onClearInitialTrackingId={() => setInitialTrackingId(null)}
        />
      );
      case 'EMERGENCY': return <EmergencyScreen onNavigate={handleNavigation} language={language} />;
      case 'NOTICES': return <NoticeScreen language={language} />;
      case 'PROFILE': return (
        <ProfileScreen 
          onNavigate={handleNavigation} 
          onLogout={() => auth.signOut()} 
          isDarkMode={isDarkMode} 
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          language={language}
          onLanguageChange={setLanguage}
        />
      );
      case 'EXPLORE': return <ExplorePage onNavigate={handleNavigation} language={language} initialCategory={exploreCategory} />;
      case 'ADMIN': {
        const isAdminUser = user?.email === 'admin@sreepur.gov.bd' || user?.email === 'rrafidalmahmud66@gmail.com' || userRole === 'admin';
        if (!isAdminUser) {
          setTimeout(() => setCurrentScreen('HOME'), 0);
          return null;
        }
        return (
          <AdminScreen 
            onNavigate={handleNavigation} 
            language={language} 
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          />
        );
      }
      case 'REPORT': return (
        <ReportScreen 
          onBack={(trackId) => {
            if (trackId && typeof trackId === 'string') {
              setInitialTrackingId(trackId);
              setCurrentScreen('HOME');
              setScreenHistory(['HOME']);
            } else {
              goBack();
            }
          }} 
          language={language} 
        />
      );
      case 'AI_CHATT': return <AIScreen onBack={goBack} language={language} currentScreen={currentScreen} />;
      case 'HELP': return <HelpScreen onNavigate={handleNavigation} language={language} />;
      case 'MAP': return <ExplorePage onNavigate={handleNavigation} showMap language={language} />;
      case 'HEALTH': return <ExplorePage onNavigate={handleNavigation} language={language} initialCategory="health" />;
      case 'SERVICE_HUB': return <AIServiceHub onBack={goBack} onNavigate={handleNavigation} language={language} />;
      case 'NEWS': return <NewsScreen onNavigate={handleNavigation} language={language} />;
      case 'MARKETPLACE': return <MarketplaceScreen onNavigate={handleNavigation} language={language} setCurrentProductId={setSelectedProductId} />;
      case 'PRODUCT_DETAIL': return <ProductDetailScreen productId={selectedProductId || ''} onNavigate={handleNavigation} language={language} setCurrentOrderId={setSelectedOrderId} />;
      case 'SELLER_APPLY': return <SellerApplyScreen onNavigate={handleNavigation} language={language} />;
      case 'RIDER_APPLY': return <RiderApplyScreen onNavigate={handleNavigation} language={language} />;
      case 'SELLER_DASHBOARD': return <SellerDashboardScreen onNavigate={handleNavigation} language={language} />;
      case 'RIDER_DASHBOARD': return <RiderDashboardScreen onNavigate={handleNavigation} language={language} />;
      case 'ORDER_TRACKING': return <OrderTrackingScreen orderId={selectedOrderId || ''} onNavigate={handleNavigation} language={language} />;
      default: return (
        <HomeScreen 
          onNavigate={handleNavigation} 
          onOpenSearch={() => setShowGlobalSearch(true)}
          language={language} 
          appSettings={appSettings} 
          setExploreCategory={setExploreCategory}
          initialTrackingId={initialTrackingId}
          onClearInitialTrackingId={() => setInitialTrackingId(null)}
        />
      );
    }
  };

  const showNav = !['SPLASH', 'ONBOARDING', 'AUTH', 'AI_CHATT', 'ADMIN', 'PRODUCT_DETAIL', 'SELLER_APPLY', 'RIDER_APPLY', 'SELLER_DASHBOARD', 'RIDER_DASHBOARD', 'ORDER_TRACKING'].includes(currentScreen);

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-soft-white dark:bg-dark-bg">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full"
        />
      </div>
    );
  }

  return (
    <NotificationProvider 
      userId={user?.uid || null}
      onNotificationClick={(type) => {
        if (type === 'emergency' || type === 'notice' || type === 'update') {
          setCurrentScreen('NOTICES');
        }
      }}
    >
      <div className={cn(
        "relative h-screen w-full overflow-hidden font-sans transition-all duration-300",
        currentScreen === 'ADMIN' ? "max-w-none mx-0 rounded-none shadow-none" : "max-w-md mx-auto md:rounded-[2.5rem] shadow-2xl border border-slate-100/10",
        isDarkMode ? "dark bg-dark-bg text-slate-100" : "bg-soft-white text-slate-900"
      )}>
      
      {/* Maintenance Mode Overlay */}
      {appSettings.maintenanceMode && (userRole !== 'admin') && (
        <div className="absolute inset-0 z-[9999] bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
          <div className="w-24 h-24 rounded-[3rem] bg-amber-500/10 flex items-center justify-center text-amber-500 mb-8 border border-amber-500/20 shadow-xl shadow-amber-500/10">
            <ShieldHalf size={48} />
          </div>
          <h2 className="text-3xl font-bn font-bold text-slate-900 dark:text-white mb-4">রক্ষণাবেক্ষণ চলছে</h2>
          <p className="text-slate-600 dark:text-slate-400 font-bn text-lg leading-relaxed mb-10">
            অ্যাপটি বর্তমানে রক্ষণাবেক্ষণের জন্য সাময়িকভাবে বন্ধ আছে। আমরা শীঘ্রই ফিরে আসছি।
          </p>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-bn text-slate-400 uppercase tracking-widest font-bold">জরুরি যোগাযোগ</span>
            <a href={`tel:${appSettings.supportPhone}`} className="text-primary font-bold text-xl">{appSettings.supportPhone}</a>
          </div>
        </div>
      )}

      {/* App Banner */}
      {appSettings.appBanner && !['SPLASH', 'ONBOARDING', 'AUTH'].includes(currentScreen) && (
        <div className="absolute top-0 left-0 right-0 z-[100] pointer-events-none">
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="bg-primary/95 backdrop-blur-md text-white py-2 px-4 shadow-lg flex items-center justify-center pointer-events-auto"
          >
            <Sparkles size={14} className="mr-2 animate-pulse" />
            <span className="text-[10px] font-bn font-bold uppercase tracking-widest">{appSettings.appBanner}</span>
          </motion.div>
        </div>
      )}

      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-5%] left-[-10%] w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      {/* Main Content */}
      <div className="relative h-full flex flex-col">
        {/* Top Header */}
        {showNav && (
          <header className="px-6 pt-6 pb-2 flex justify-between items-center bg-transparent z-10">
            <div className="flex items-center gap-3">
              {currentScreen !== 'HOME' && (
                <button 
                  onClick={goBack}
                  className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft size={20} className="text-slate-800 dark:text-slate-200" />
                </button>
              )}
              <div className="flex flex-col">
                <span className="text-[10px] text-primary font-bn font-bold uppercase tracking-widest">{t.titles.digitalPlatform}</span>
                <h1 className="text-xl font-display font-bold leading-tight tracking-tight text-title">{t.titles.smartUpazila}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2.5 rounded-2xl bg-white dark:bg-slate-800 soft-shadow hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                {isDarkMode ? <Sun size={20} className="text-accent" /> : <Moon size={20} className="text-slate-600" />}
              </button>
              <button 
                onClick={() => setShowGlobalSearch(true)}
                className="p-2.5 rounded-2xl bg-white dark:bg-slate-800 soft-shadow hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <Search size={20} className="text-slate-600 dark:text-slate-300" />
              </button>
              {(user?.email === 'admin@sreepur.gov.bd' || user?.email === 'rrafidalmahmud66@gmail.com' || userRole === 'admin') && (
                 <button 
                  onClick={() => handleNavigation('ADMIN')}
                  className="p-2.5 rounded-2xl bg-secondary/10 dark:bg-secondary/20 text-secondary transition-all active:scale-95"
                 >
                   <ShieldHalf size={20} />
                 </button>
              )}
            </div>
          </header>
        )}

        <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-hide relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="h-full"
            >
              <Suspense fallback={
                <div className="h-full w-full flex items-center justify-center bg-transparent py-14">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full"
                  />
                </div>
              }>
                {currentScreen === 'HOME' ? (
                  <HomeScreen 
                    onNavigate={setCurrentScreen} 
                    onOpenSearch={() => setShowGlobalSearch(true)}
                    language={language} 
                    initialSelectedService={selectedSearchService}
                    onClearSelectedService={() => setSelectedSearchService(null)}
                    appSettings={appSettings}
                    setExploreCategory={setExploreCategory}
                  />
                ) : renderScreen()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {showGlobalSearch && (
            <SearchPopup 
              language={language}
              onClose={() => setShowGlobalSearch(false)}
              onNavigate={handleNavigation}
              onServiceSelect={(service) => {
                setSelectedSearchService(service);
                handleNavigation('HOME');
              }}
            />
          )}
        </AnimatePresence>

        {/* Bottom Nav */}
        {showNav && (
          <nav className="glass mx-6 mb-6 rounded-3xl p-2 flex justify-between items-center px-4 soft-shadow z-20">
            <NavIcon 
              active={currentScreen === 'HOME'} 
              icon={HomeIcon} 
              label={t.home} 
              onClick={() => {
                setScreenHistory(['HOME']);
                setCurrentScreen('HOME');
              }} 
            />
            <NavIcon 
              active={currentScreen === 'EXPLORE' || currentScreen === 'MAP'} 
              icon={Compass} 
              label={t.explore} 
              onClick={() => handleNavigation('EXPLORE')} 
            />
            <div className="relative -top-10">
               <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleNavigation('SERVICE_HUB')}
                className="w-18 h-18 rounded-full bg-gradient-to-tr from-primary to-secondary text-white flex flex-col items-center justify-center shadow-xl shadow-primary/30 border-4 border-white dark:border-dark-bg z-30 group"
               >
                 <Sparkles size={28} className="group-hover:rotate-12 transition-transform" />
                 <span className="text-[8px] font-bn font-bold mt-1 uppercase">AI Hub</span>
               </motion.button>
            </div>
            <NavIcon 
              active={currentScreen === 'NOTICES'} 
              icon={Bell} 
              label={t.notices} 
              onClick={() => handleNavigation('NOTICES')} 
            />
            <NavIcon 
              active={currentScreen === 'PROFILE'} 
              icon={User} 
              label={t.profile} 
              onClick={() => handleNavigation('PROFILE')} 
            />
          </nav>
        )}

        {/* AI FAB */}
        {showNav && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleNavigation('AI_CHATT' as any)}
            className="absolute bottom-28 right-6 w-12 h-12 rounded-2xl bg-[#4285F4] text-white shadow-lg shadow-blue-200 flex items-center justify-center z-30"
          >
            <MessageSquare size={20} />
          </motion.button>
        )}
      </div>
    </div>
    </NotificationProvider>
  );
}

function NavIcon({ active, icon: Icon, label, onClick }: { 
  active: boolean, 
  icon: any, 
  label: string, 
  onClick: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-2xl transition-all relative overflow-hidden",
        active ? "text-primary" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      )}
    >
      {active && (
        <motion.div 
          layoutId="active-bg"
          className="absolute inset-0 bg-primary/5 dark:bg-primary/20 rounded-2xl"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <Icon size={active ? 22 : 20} strokeWidth={active ? 2.5 : 2} className="relative z-10" />
      <span className={cn("text-[10px] font-bn font-medium relative z-10 whitespace-nowrap", active ? "opacity-100" : "opacity-0 h-0 w-0 overflow-hidden")}>{label}</span>
      {active && (
        <motion.div 
          layoutId="active-dot"
          className="w-1 h-1 rounded-full bg-primary mt-0.5"
        />
      )}
    </button>
  );
}
