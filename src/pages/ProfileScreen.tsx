import { 
  User, Settings, Shield, CreditCard, LogOut, ChevronRight, Edit3, Heart, 
  Moon, Sun, BellRing, CheckCircle2, HelpCircle, Globe, ArrowLeft, Save, 
  Trash2, Smartphone, ShieldCheck, Fingerprint, Database, Info, RefreshCw, 
  MapPin, Briefcase, Star, Loader2, Clock, CheckCircle, Plus, X, Camera, Store, Bike, ShoppingBag, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from '../types';
import { cn } from '../lib/utils';
import React, { useState, useEffect } from 'react';
import { useNotifications } from '../components/NotificationProvider';
import { db, auth, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { updateProfile, sendEmailVerification } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressAndConvertToBase64 } from '../lib/image-utils';
import { Language, translations } from '../translations';
import { 
  getDoc,
  updateDoc,
  setDoc,
  collection, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';

type ProfileSection = 'MAIN' | 'PERSONAL' | 'SECURITY' | 'APP_SETTINGS' | 'PRIVACY' | 'CONTRIBUTIONS' | 'REPORTS' | 'REVIEWS' | 'ORDERS';

export default function ProfileScreen({ 
  onNavigate, 
  onLogout, 
  isDarkMode, 
  onToggleDarkMode,
  language,
  onLanguageChange
}: { 
  onNavigate: (s: Screen) => void, 
  onLogout: () => void,
  isDarkMode: boolean,
  onToggleDarkMode: () => void,
  language: Language,
  onLanguageChange: (l: Language) => void
}) {
  const [activeSection, setActiveSection] = useState<ProfileSection>('MAIN');
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showLanguageSettings, setShowLanguageSettings] = useState(false);
  const { settings, updateSettings, permissionStatus, requestPermission } = useNotifications();
  const [isUploading, setIsUploading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>((window as any).deferredAppPrompt || null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const user = auth.currentUser;
  const [userData, setUserData] = useState<any>(null);
  const [verifSending, setVerifSending] = useState(false);
  const [verifSent, setVerifSent] = useState(false);
  const [reportCount, setReportCount] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const isGoogle = user?.providerData?.some(p => p.providerId === 'google.com');
  const isPhone = user?.providerData?.some(p => p.providerId === 'phone');

  const getNum = (num: number | string) => {
    const str = num.toString().padStart(2, '0');
    if (language === 'bn') {
      const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
      return str.split('').map(digit => {
        const parsed = parseInt(digit, 10);
        return isNaN(parsed) ? digit : banglaDigits[parsed];
      }).join('');
    }
    return str;
  };

  const handleSendVerification = async () => {
    if (!user) return;
    setVerifSending(true);
    try {
      await sendEmailVerification(user);
      setVerifSent(true);
    } catch (err: any) {
      console.error("Error sending verification email:", err);
      alert(language === 'bn' 
        ? "ভেরিফিকেশন ইমেইল পাঠানো যায়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।" 
        : "Could not send verification email. Please try again later.");
    } finally {
      setVerifSending(false);
    }
  };

  useEffect(() => {
    const checkPwaStatus = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      setIsPwaInstalled(!!isStandalone);
    };

    checkPwaStatus();

    const handlePromptReady = () => {
      setInstallPrompt((window as any).deferredAppPrompt || null);
    };
    window.addEventListener('app-install-prompt-ready', handlePromptReady);

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('app-install-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsPwaInstalled(true);
        setInstallPrompt(null);
      }
    } catch (err) {
      console.warn("PWA Prompt error:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reports'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setReportCount(snap.size);
    }, (error) => {
      console.warn("Failed to fetch user reports count:", error);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reviews'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setReviewCount(snap.size);
    }, (error) => {
      console.warn("Failed to fetch user reviews count:", error);
    });
    return () => unsubscribe();
  }, [user?.uid]);
  
  const toggleSellerMode = async () => {
    if (!user) return;
    const isCurrentlyApproved = userData?.isSeller === 'approved';
    const newStatus = isCurrentlyApproved ? 'none' : 'approved';
    try {
      await setDoc(doc(db, 'users', user.uid), {
        isSeller: newStatus,
        phone: userData?.phone || '01712345678',
        address: userData?.address || 'শ্রীপুর, গাজীপুর',
        businessName: userData?.businessName || (user.displayName ? `${user.displayName} স্টোর` : 'আমার খামার স্টোর'),
        lat: userData?.lat || 24.2000,
        lng: userData?.lng || 90.4667,
        updatedAt: new Date()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to toggle seller mode:", err);
    }
  };

  const toggleRiderMode = async () => {
    if (!user) return;
    const isCurrentlyApproved = userData?.isRider === 'approved';
    const newStatus = isCurrentlyApproved ? 'none' : 'approved';
    try {
      await setDoc(doc(db, 'users', user.uid), {
        isRider: newStatus,
        phone: userData?.phone || '01712345678',
        address: userData?.address || 'শ্রীপুর চৌরাস্তা, গাজীপুর',
        vehicleType: userData?.vehicleType || 'মোটরসাইকেল',
        lat: userData?.lat || 24.2000,
        lng: userData?.lng || 90.4667,
        updatedAt: new Date()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to toggle rider mode:", err);
    }
  };
  
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      let finalPhotoURL = '';
      try {
        // Try Firebase Storage first with a tight timeout
        const storageRef = ref(storage, `profile_pictures/${user.uid}`);
        
        const uploadPromise = (async () => {
          await uploadBytes(storageRef, file);
          return await getDownloadURL(storageRef);
        })();

        const timeoutPromise = new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 3500)
        );

        finalPhotoURL = await Promise.race([uploadPromise, timeoutPromise]);
        
        // Update Firebase Auth Profile
        try {
          await updateProfile(user, { photoURL: finalPhotoURL });
        } catch (authErr) {
          console.warn("Could not update standard Firebase auth photoURL, proceeding:", authErr);
        }
      } catch (storageErr) {
        console.warn("Storage upload failed or timed out, falling back to base64 compression:", storageErr);
        // Fallback: Convert to small compressed base64
        finalPhotoURL = await compressAndConvertToBase64(file, 300, 0.6);
      }

      // Update Firestore User Document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { 
        photoURL: finalPhotoURL,
        updatedAt: new Date()
      });
      
      // We don't necessarily need window.location.reload() if we use userData in the UI
      // but keep it if we want to ensure everything (including navbar) is in sync immediately
      // window.location.reload(); 
    } catch (err) {
      console.error("Upload error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsUploading(false);
    }
  };

  const t = translations[language] || translations['bn'];

  const renderContent = () => {
    switch (activeSection) {
      case 'PERSONAL':
        return (
          <PersonalInfoSection 
            t={t} 
            user={user} 
            userData={userData}
            language={language}
            onBack={() => setActiveSection('MAIN')} 
          />
        );
      case 'CONTRIBUTIONS':
        return (
          <MyContributionsSection 
            t={t} 
            language={language}
            onBack={() => setActiveSection('MAIN')} 
          />
        );
      case 'REPORTS':
        return (
          <MyReportsSection 
            language={language}
            onBack={() => setActiveSection('MAIN')} 
          />
        );
      case 'REVIEWS':
        return (
          <MyReviewsSection 
            language={language}
            onBack={() => setActiveSection('MAIN')} 
          />
        );
      case 'SECURITY':
        return (
          <SecurityPrivacySection 
            t={t} 
            onBack={() => setActiveSection('MAIN')} 
            onNavigateToPrivacy={() => setActiveSection('PRIVACY')}
          />
        );
      case 'APP_SETTINGS':
        return (
          <AppSettingsDetailSection 
            t={t} 
            onBack={() => setActiveSection('MAIN')} 
          />
        );
      case 'PRIVACY':
        return (
          <PrivacyPolicySection 
            t={t} 
            onBack={() => setActiveSection('SECURITY')} 
          />
        );
      case 'ORDERS':
        return (
          <MyOrdersSection 
            language={language}
            onBack={() => setActiveSection('MAIN')}
            onNavigate={onNavigate}
          />
        );
      default:
        return (
          <div className="px-6 -mt-16 relative z-10">
            {/* Profile Card Header */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/20">
              <div className="flex flex-col items-center text-center">
                <div className="relative -mt-20">
                  <div className="w-32 h-32 rounded-[2.75rem] bg-white dark:bg-slate-800 p-1.5 shadow-2xl">
                    <div className="w-full h-full rounded-[2.4rem] overflow-hidden bg-slate-100 dark:bg-slate-800 relative group">
                        {isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
                            <Loader2 className="animate-spin text-white" size={32} />
                          </div>
                        ) : (
                          <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10">
                            <Camera className="text-white" size={32} />
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*" 
                              onChange={handlePhotoChange} 
                              disabled={isUploading}
                            />
                          </label>
                        )}
                        <img 
                          src={userData?.photoURL || user?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"} 
                          alt="Avatar" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                    </div>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setActiveSection('PERSONAL')}
                    className="absolute bottom-1 right-1 w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 border-4 border-white dark:border-slate-800 hover:bg-indigo-600 transition-colors"
                  >
                    <Edit3 size={16} />
                  </motion.button>
                </div>

                <div className="mt-4">
                  <h3 className="text-2xl font-display font-bold text-title">{userData?.displayName || user?.displayName || (language === 'bn' ? 'ব্যবহারকারীর নাম' : 'User Name')}</h3>
                  <p className="text-muted font-bn font-medium text-sm mt-0.5">{userData?.email || user?.email || (language === 'bn' ? 'ব্যবহারকারীর ইমেইল' : 'User Email')}</p>
                  
                  {user && !user.emailVerified && !isGoogle && !isPhone && (
                    <div className="mt-3 inline-flex flex-col items-center gap-1.5 p-2.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 rounded-2xl max-w-xs mx-auto">
                      <p className="text-xs font-bn font-semibold text-amber-600 dark:text-amber-400">
                        {language === 'bn' ? 'আপনার ইমেইলটি ভেরিফাইড নয়।' : 'Your email is not verified.'}
                      </p>
                      <button
                        onClick={handleSendVerification}
                        disabled={verifSent || verifSending}
                        className={cn(
                          "text-[10px] font-bn font-black px-3 py-1 rounded-xl border transition-all duration-300 flex items-center justify-center gap-1",
                          verifSent 
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                            : "bg-amber-500 hover:bg-amber-600 text-white border-transparent shadow-sm active:scale-95 cursor-pointer"
                        )}
                      >
                        {verifSending && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        {verifSent 
                          ? (language === 'bn' ? 'ভেরিফিকেশন লিংক পাঠানো হয়েছে!' : 'Verification link sent!')
                           : (language === 'bn' ? 'ভেরিফিকেশন ইমেইল পাঠান' : 'Send verification email')
                        }
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  <div className="bg-primary/10 border border-primary/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                      <Shield size={14} className="text-primary" />
                      <span className="text-[11px] font-bn font-bold text-primary uppercase tracking-wider">{t.profileItems.verifiedUser}</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                      <Heart size={14} className="text-rose-500" />
                      <span className="text-[11px] font-bn font-bold text-rose-500 uppercase tracking-wider">{t.profileItems.favorites} ১টি</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <div className="text-center">
                    <p className="text-xl font-display font-bold text-title">{getNum(reportCount)}</p>
                    <p className="text-[9px] font-bn font-bold text-slate-400 uppercase tracking-widest">{t.profileItems.reports}</p>
                </div>
                <div className="text-center border-x border-slate-100 dark:border-slate-800">
                    <p className="text-xl font-display font-bold text-title">{getNum(userData?.points || (reportCount * 20 + reviewCount * 15))}</p>
                    <p className="text-[9px] font-bn font-bold text-slate-400 uppercase tracking-widest">{t.profileItems.points}</p>
                </div>
                <div className="text-center">
                    <p className="text-xl font-display font-bold text-title">{getNum(reviewCount)}</p>
                    <p className="text-[9px] font-bn font-bold text-slate-400 uppercase tracking-widest">{t.profileItems.services}</p>
                </div>
              </div>
            </div>

            {/* PWA App Install Banner */}
            <div className="mt-6 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 dark:border-emerald-500/10 rounded-[2.5rem] p-6 soft-shadow relative overflow-hidden">
              {/* Absolute Background Pattern */}
              <div className="absolute right-0 bottom-0 translate-x-[20%] translate-y-[20%] opacity-10 pointer-events-none">
                <Smartphone size={160} strokeWidth={1} className="text-emerald-500" />
              </div>

              <div className="flex gap-4 items-start relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Smartphone size={24} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bn font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight">
                      {language === 'bn' ? 'স্মার্ট শ্রীপুর মোবাইল অ্যাপ' : 'Smart Sreepur Mobile App'}
                    </h4>
                    {isPwaInstalled && (
                      <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bn font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle size={10} />
                        {language === 'bn' ? 'সক্রিয়' : 'Installed'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bn text-slate-500 dark:text-slate-400 leading-relaxed pr-8">
                    {isPwaInstalled 
                      ? (language === 'bn' ? 'আপনি সফলভাবে স্মার্ট শ্রীপুর অ্যাপ ইন্সটল করেছেন। দ্রুত এবং অফলাইন নাগরিক সুবিধা উপভোগ করুন!' : 'You have successfully installed the Smart Sreepur app. Enjoy fast, reliable, and fluid citizen services offline!')
                      : (language === 'bn' ? 'সরাসরি নোটিফিকেশন পেতে ও দ্রুত অ্যাক্সেসের জন্য স্মার্ট শ্রীপুর অ্যাপটি হোম স্ক্রিনে যোগ করুন।' : 'Add the Smart Sreepur app to your home screen for instant updates and fluid offline navigation.')}
                  </p>

                  {!isPwaInstalled && (
                    <div className="pt-3 flex flex-wrap gap-2">
                      {installPrompt ? (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleInstallApp}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bn font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
                        >
                          {language === 'bn' ? 'হোম স্ক্রিনে যুক্ত করুন' : 'Add to Home Screen'}
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setShowInstallModal(true)}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bn font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
                        >
                          {language === 'bn' ? 'কিভাবে ইন্সটল করবেন?' : 'How to Install?'}
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Settings Groups */}
            <div className="mt-8 space-y-8">
              
              {/* Account Settings */}
              <div className="space-y-4">
                <h4 className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em]">
                  {t.profileItems.accountSettings}
                </h4>
                <div className="space-y-3">
                  <ProfileItem icon={Briefcase} title={language === 'bn' ? 'আমার কন্ট্রিবিউশন' : 'My Contributions'} onClick={() => setActiveSection('CONTRIBUTIONS')} />
                  <ProfileItem icon={Info} title={language === 'bn' ? 'আমার রিপোর্টসমূহ' : 'My Reports'} onClick={() => setActiveSection('REPORTS')} />
                  <ProfileItem icon={Star} title={language === 'bn' ? 'আমার রিভিউ ও রেটিং' : 'My Reviews & Ratings'} onClick={() => setActiveSection('REVIEWS')} />
                  <ProfileItem icon={Clock} title={language === 'bn' ? 'আমার অর্ডারসমূহ ও লাইভ ট্র্যাকিং' : 'My Orders & Live Tracking'} onClick={() => setActiveSection('ORDERS')} />
                  <ProfileItem icon={User} title={t.settings.personalInfo} onClick={() => setActiveSection('PERSONAL')} />
                  <ProfileItem icon={Shield} title={t.settings.security} onClick={() => setActiveSection('SECURITY')} />
                  <ProfileItem icon={CreditCard} title={t.settings.paymentHistory} onClick={() => {}} />
                </div>
              </div>

              {/* Merchant & Rider Panels */}
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800/60 pb-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em]">
                    {language === 'bn' ? 'উদ্যোক্তা ও রাইডার প্যানেল' : 'Merchant & Rider Panels'}
                  </h4>
                  <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded-full font-bn uppercase tracking-wider">
                    {language === 'bn' ? 'কুইক সুইচ মোড' : 'Quick Toggle'}
                  </span>
                </div>

                {/* Active Mode Segmented Switcher */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800/40">
                  <button
                    onClick={() => onNavigate('MARKETPLACE')}
                    className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold transition-all bg-white dark:bg-slate-900 hover:scale-105 active:scale-95 shadow-sm text-[10px]"
                  >
                    <span>🛒</span>
                    <span>{language === 'bn' ? 'গ্রাহক মোড' : 'Buyer Mode'}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (userData?.isSeller === 'approved') {
                        onNavigate('SELLER_DASHBOARD');
                      } else {
                        onNavigate('SELLER_APPLY');
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 text-[10px]",
                      userData?.isSeller === 'approved' 
                        ? "bg-gradient-to-tr from-amber-500 to-orange-400 text-white shadow-md shadow-amber-500/10" 
                        : "text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 border border-transparent hover:border-slate-200/20"
                    )}
                  >
                    <span>🏪</span>
                    <span>{language === 'bn' ? 'সেলার মোড' : 'Seller Mode'}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (userData?.isRider === 'approved') {
                        onNavigate('RIDER_DASHBOARD');
                      } else {
                        onNavigate('RIDER_APPLY');
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 text-[10px]",
                      userData?.isRider === 'approved' 
                        ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/10" 
                        : "text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 border border-transparent hover:border-slate-200/20"
                    )}
                  >
                    <span>🏍️</span>
                    <span>{language === 'bn' ? 'রাইডার মোড' : 'Rider Mode'}</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Seller Quick Switch */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                        <Store size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white font-bn">
                          {language === 'bn' ? 'উদ্যোক্তা (সেলার) মোড' : 'Seller / Merchant Mode'}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bn font-semibold">
                          {userData?.isSeller === 'approved' 
                            ? (language === 'bn' ? 'অনুমোদিত (সক্রিয়)' : 'Approved (Active)') 
                            : (userData?.isSeller === 'pending' ? (language === 'bn' ? 'অনুমোদন পেন্ডিং' : 'Pending Approval') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive'))}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={toggleSellerMode}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        userData?.isSeller === 'approved' ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
                      )}
                    >
                      <span 
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          userData?.isSeller === 'approved' ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  {/* Rider Quick Switch */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                        <Bike size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white font-bn">
                          {language === 'bn' ? 'ডেলিভারি রাইডার মোড' : 'Delivery Rider Mode'}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bn font-semibold">
                          {userData?.isRider === 'approved' 
                            ? (language === 'bn' ? 'অনুমোদিত (সক্রিয়)' : 'Approved (Active)') 
                            : (userData?.isRider === 'pending' ? (language === 'bn' ? 'অনুমোদন পেন্ডিং' : 'Pending Approval') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive'))}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={toggleRiderMode}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        userData?.isRider === 'approved' ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                      )}
                    >
                      <span 
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          userData?.isRider === 'approved' ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Dashboard / Application links */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 space-y-2">
                  {userData?.isSeller === 'approved' ? (
                    <button 
                      onClick={() => onNavigate('SELLER_DASHBOARD')}
                      className="w-full py-3 px-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold rounded-2xl text-xs hover:bg-amber-500/20 transition-colors flex items-center justify-between font-bn"
                    >
                      <span>🏪 {language === 'bn' ? 'উদ্যোক্তা ড্যাশবোর্ড' : 'Seller Dashboard'}</span>
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => onNavigate('SELLER_APPLY')}
                      className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors flex items-center justify-between font-bn"
                    >
                      <span>📝 {language === 'bn' ? 'উদ্যোক্তা হিসেবে আবেদন করুন' : 'Apply as Seller'}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}

                  {userData?.isRider === 'approved' ? (
                    <button 
                      onClick={() => onNavigate('RIDER_DASHBOARD')}
                      className="w-full py-3 px-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold rounded-2xl text-xs hover:bg-emerald-500/20 transition-colors flex items-center justify-between font-bn"
                    >
                      <span>🏍️ {language === 'bn' ? 'রাইডার ড্যাশবোর্ড' : 'Rider Dashboard'}</span>
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => onNavigate('RIDER_APPLY')}
                      className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors flex items-center justify-between font-bn"
                    >
                      <span>📝 {language === 'bn' ? 'রাইডার হিসেবে আবেদন করুন' : 'Apply as Rider'}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Preferences Settings */}
              <div className="space-y-4">
                <h4 className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em]">
                  {t.profileItems.preferences}
                </h4>
                <div className="space-y-3">
                  {/* Language Selection */}
                  <div className="space-y-2">
                      <ProfileItem 
                          icon={Globe} 
                          title={t.settings.language} 
                          onClick={() => setShowLanguageSettings(!showLanguageSettings)}
                          extra={language === 'bn' ? 'বাংলা' : 'English'}
                      />
                      <AnimatePresence>
                          {showLanguageSettings && (
                              <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-4 soft-shadow border border-slate-100 dark:border-slate-800 overflow-hidden"
                              >
                                  <div className="grid grid-cols-2 gap-3">
                                      <button 
                                          onClick={() => {
                                              onLanguageChange('bn');
                                              setShowLanguageSettings(false);
                                          }}
                                          className={cn(
                                              "p-4 rounded-2xl font-bn font-bold transition-all border-2 flex items-center justify-center gap-2",
                                              language === 'bn' 
                                                ? "bg-primary/5 border-primary text-primary" 
                                                : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400"
                                          )}
                                      >
                                          {language === 'bn' && <CheckCircle2 size={16} />}
                                          বাংলা
                                      </button>
                                      <button 
                                          onClick={() => {
                                              onLanguageChange('en');
                                              setShowLanguageSettings(false);
                                          }}
                                          className={cn(
                                              "p-4 rounded-2xl font-display font-bold transition-all border-2 flex items-center justify-center gap-2",
                                              language === 'en' 
                                                ? "bg-primary/5 border-primary text-primary" 
                                                : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400"
                                          )}
                                      >
                                          {language === 'en' && <CheckCircle2 size={16} />}
                                          English
                                      </button>
                                  </div>
                              </motion.div>
                          )}
                      </AnimatePresence>
                  </div>

                  {/* Dark Mode Toggle Item */}
                  <button 
                    onClick={onToggleDarkMode}
                    className="w-full flex items-center justify-between p-5 rounded-[2.5rem] bg-white dark:bg-slate-900 soft-shadow border border-transparent hover:border-primary/20 transition-all active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                      </div>
                      <span className="font-bn font-bold text-lg text-slate-700 dark:text-slate-200">
                        {isDarkMode ? t.settings.lightMode : t.settings.darkModeLabel}
                      </span>
                    </div>
                    <div className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors relative",
                      isDarkMode ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                    )}>
                      <motion.div 
                        animate={{ x: isDarkMode ? 24 : 0 }}
                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                      />
                    </div>
                  </button>

                  {/* Notification Settings Toggle */}
                  <div className="space-y-2">
                      <ProfileItem 
                          icon={BellRing} 
                          title={t.settings.notifications} 
                          onClick={() => setShowNotificationSettings(!showNotificationSettings)} 
                      />
                      
                      <AnimatePresence>
                          {showNotificationSettings && (
                              <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 soft-shadow border border-slate-100 dark:border-slate-800 overflow-hidden"
                              >
                                  <div className="space-y-6">
                                      <div className="flex items-center justify-between">
                                          <div>
                                              <h4 className="font-bn font-bold text-slate-800 dark:text-white">{t.notifications.status}</h4>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">ব্রাউজার নোটিফিকেশন পারমিশন</p>
                                          </div>
                                          {permissionStatus === 'granted' ? (
                                              <div className="flex items-center gap-1 text-green-500 bg-green-500/10 px-3 py-1 rounded-full">
                                                  <CheckCircle2 size={12} />
                                                  <span className="text-[10px] font-bn font-bold uppercase tracking-wider">{t.notifications.active}</span>
                                              </div>
                                          ) : (
                                              <button 
                                                  onClick={requestPermission}
                                                  className="text-[10px] font-bn font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider hover:bg-primary/20 transition-colors"
                                              >
                                                  {t.notifications.request}
                                              </button>
                                          )}
                                      </div>

                                      <div className="h-[2px] bg-slate-50 dark:bg-slate-800 w-full" />

                                      <NotificationToggle 
                                          label={t.notifications.emergencyAlerts} 
                                          description={t.notifications.emergencyDesc}
                                          active={settings.emergency}
                                          onToggle={() => updateSettings({ emergency: !settings.emergency })}
                                      />
                                      
                                      <NotificationToggle 
                                          label={t.notifications.newNotices} 
                                          description={t.notifications.noticesDesc}
                                          active={settings.notices}
                                          onToggle={() => updateSettings({ notices: !settings.notices })}
                                      />
          
                                      <NotificationToggle 
                                          label={t.notifications.appUpdates} 
                                          description={t.notifications.updatesDesc}
                                          active={settings.updates}
                                          onToggle={() => updateSettings({ updates: !settings.updates })}
                                      />
                                  </div>
                              </motion.div>
                          )}
                      </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Support & Legal */}
              <div className="space-y-4">
                <h4 className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em]">
                  {t.profileItems.supportApp}
                </h4>
                <div className="space-y-3">
                  <ProfileItem icon={HelpCircle} title={t.settings.helpSupport} onClick={() => onNavigate('HELP')} />
                  <ProfileItem icon={Settings} title={t.settings.appSettings} onClick={() => setActiveSection('APP_SETTINGS')} />
                </div>
              </div>
              
              <div className="pt-4">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center justify-between p-7 rounded-[2.5rem] bg-rose-500 text-white shadow-xl shadow-rose-500/20 active:bg-rose-600 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                      <LogOut size={24} />
                    </div>
                    <div className="text-left">
                      <span className="font-bn font-bold text-xl block leading-tight">{t.settings.logout}</span>
                      <span className="text-[10px] font-bn opacity-80 uppercase tracking-widest">Sign out from your account</span>
                    </div>
                  </div>
                  <ChevronRight size={24} className="opacity-60" />
                </motion.button>
              </div>
            </div>

            {/* Logout Confirmation Dialog */}
            <AnimatePresence>
              {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 w-full max-w-md mx-auto">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowLogoutConfirm(false)}
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm w-full max-w-md mx-auto"
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[3rem] p-8 shadow-2xl border border-slate-100 dark:border-slate-800 text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mx-auto mb-6">
                        <LogOut size={40} />
                    </div>
                    <h3 className="text-2xl font-bn font-bold text-slate-900 dark:text-white mb-2">আপনি কি সাবধানে আছেন?</h3>
                    <p className="text-slate-500 dark:text-slate-400 font-bn mb-8">আপনি যদি লগআউট করেন তবে পুনরায় অ্যাপ ব্যবহারের জন্য লগইন করতে হবে।</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setShowLogoutConfirm(false)}
                        className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bn font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        বাতিল করুন
                      </button>
                      <button 
                        onClick={onLogout}
                        className="py-4 rounded-2xl bg-rose-500 text-white font-bn font-bold shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-colors"
                      >
                        লগআউট
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* PWA Pinned Installation Steps Modal */}
            <AnimatePresence>
              {showInstallModal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 w-full max-w-md mx-auto">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowInstallModal(false)}
                    className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm w-full max-w-md mx-auto"
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-left max-h-[80vh] overflow-y-auto scrollbar-hide"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Smartphone size={20} />
                        </div>
                        <div>
                          <h3 className="font-bn font-bold text-lg text-slate-800 dark:text-white">
                            {language === 'bn' ? 'কীভাবে ইন্সটল করবেন?' : 'Installation Steps'}
                          </h3>
                          <p className="text-[10px] font-bn text-slate-400">
                            {language === 'bn' ? 'হোম স্ক্রিন অ্যাপ গাইড' : 'PWA Quick Setup Guide'}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowInstallModal(false)}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Step Cards */}
                    <div className="space-y-6">
                      {/* iOS Safari */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          Apple iOS (Safari)
                        </span>
                        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-300 font-bn">
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">১</span>
                            <span>{language === 'bn' ? 'আইফোনের Safari ব্রাউজার ব্যবহার করুন।' : 'Open Safari browser on your iOS device.'}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">২</span>
                            <span>{language === 'bn' ? 'নিচের নেভিগেশন বারের "Share" বোতামটিতে 📤 আলতো চাপুন।' : 'Tap the "Share" button 📤 on the bottom Safari tool bar.'}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">৩</span>
                            <span>{language === 'bn' ? 'স্ক্রল করে নিচে নেমে "Add to Home Screen" ➕ বিকল্পটি সিলেক্ট করুন।' : 'Scroll down and select "Add to Home Screen" ➕.'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Android / Chrome */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Android PWA / Chrome
                        </span>
                        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-300 font-bn">
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">১</span>
                            <span>{language === 'bn' ? 'ব্রাউজার উইন্ডোর ওপরের ডানের তিন-ডট (menu) ⋮ বোতামটিতে চাপুন।' : 'Tap the three-dot menu ⋮ at the top right of your Chrome browser.'}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">২</span>
                            <span>{language === 'bn' ? 'সেখান থেকে "Install App" বা "Add to Home screen" নির্বাচন করুন।' : 'Select "Install app" or "Add to Home screen" from the menu.'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Desktop */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          Desktop (Chrome / Edge)
                        </span>
                        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-300 font-bn">
                          <p className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 border border-slate-100 dark:border-slate-700">১</span>
                            <span>{language === 'bn' ? 'ইউআরএল অ্যাড্রেস বারের ডান পাশে থাকা "Install" আইকনটিতে ⤓ ক্লিক করুন।' : 'Click the "Install" icon ⤓ on the right side of the URL bar.'}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => setShowInstallModal(false)}
                      className="mt-6 w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bn font-bold text-sm text-center shadow-lg shadow-emerald-500/10 transition-colors"
                    >
                      {language === 'bn' ? 'বুঝতে পেরেছি' : 'Got it'}
                    </button>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        );
    }
  };

  return (
    <div className="pb-32 bg-slate-50/50 dark:bg-slate-950/50 min-h-screen">
      {/* Immersive Cover Header */}
      <div className="relative h-48 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-indigo-600 to-secondary opacity-90" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
        
        {/* Abstract Shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-80 h-80 bg-black/10 rounded-full blur-3xl" />
        
        {activeSection !== 'MAIN' ? (
          <motion.button 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => {
              if (activeSection === 'PRIVACY') {
                setActiveSection('SECURITY');
              } else {
                setActiveSection('MAIN');
              }
            }}
            className="absolute top-6 left-6 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white z-50 hover:bg-white/30 active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </motion.button>
        ) : (
          <motion.button 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setShowLogoutConfirm(true)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white z-50 hover:bg-white/30 active:scale-95 transition-all"
          >
            <LogOut size={20} />
          </motion.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
           key={activeSection}
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -10 }}
           transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>

      {activeSection === 'MAIN' && (
        <div className="mt-16 pb-12 text-center px-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white">
                <Shield size={12} />
            </div>
            <span className="font-display font-black text-slate-600 dark:text-slate-400 tracking-tighter">SMART UPAZILA</span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 font-bold tracking-[0.3em] uppercase transition-all hover:text-primary">
            Ver 2.5.0 ({t.profileItems.appEdition})
          </p>
        </div>
      )}
    </div>
  );
}

// --- Sub-Section Components ---

function PersonalInfoSection({ t, user, userData, language, onBack }: { t: any, user: any, userData: any, language: string, onBack: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: userData?.displayName || user?.displayName || '',
    phone: userData?.phone || user?.phoneNumber || '',
    occupation: userData?.occupation || (language === 'bn' ? 'সফটওয়্যার ইঞ্জিনিয়ার' : 'Software Engineer'),
    address: userData?.address || (language === 'bn' ? 'শ্রীপুর, গাজীপুর' : 'Sreepur, Gazipur'),
    bio: userData?.bio || (language === 'bn' ? 'আমি শ্রীপুর উপজেলার একজন গর্বিত নাগরিক।' : 'I am a proud citizen of Sreepur Upazila.')
  });

  // Update form data if userData changes (e.g. initial load)
  useEffect(() => {
    if (userData) {
      setFormData(prev => ({
        ...prev,
        name: userData.displayName || prev.name,
        phone: userData.phone || prev.phone,
        occupation: userData.occupation || prev.occupation,
        address: userData.address || prev.address,
        bio: userData.bio || prev.bio
      }));
    }
  }, [userData]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // 1. Update Auth Profile (Display Name)
      if (formData.name !== user.displayName) {
        await updateProfile(user, { displayName: formData.name });
      }

      // 2. Update Firestore Document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: formData.name,
        phone: formData.phone,
        occupation: formData.occupation,
        address: formData.address,
        bio: formData.bio,
        updatedAt: new Date()
      });
      
    } catch (error) {
      console.error("Save error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="px-6 -mt-16 relative z-10">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <User size={24} />
           </div>
           <div>
              <h3 className="text-xl font-bn font-bold text-title">{t.settings.personalInfo}</h3>
              <p className="text-xs text-muted font-bn">আপনার ব্যক্তিগত প্রোফাইল আপডেট করুন</p>
           </div>
        </div>

        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{t.settings.personalDetails.fullName}</label>
              <div className="relative">
                 <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 font-bn font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                 />
                 <User size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{t.settings.personalDetails.phone}</label>
              <div className="relative">
                 <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 font-bn font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                 />
                 <Smartphone size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{t.settings.personalDetails.occupation}</label>
              <div className="relative">
                 <input 
                  type="text" 
                  value={formData.occupation}
                  onChange={(e) => setFormData({...formData, occupation: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 font-bn font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                 />
                 <Briefcase size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{t.settings.personalDetails.address}</label>
              <div className="relative">
                 <input 
                  type="text" 
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 font-bn font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                 />
                 <MapPin size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{t.settings.personalDetails.bio}</label>
              <textarea 
                value={formData.bio}
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
                rows={3}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 font-bn font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              />
           </div>

           <motion.button 
             whileHover={{ scale: 1.02 }}
             whileTap={{ scale: 0.98 }}
             onClick={handleSave}
             disabled={isSaving}
             className={cn(
                "w-full py-4 rounded-2xl font-bn font-bold flex items-center justify-center gap-2 shadow-xl transition-all",
                isSaving ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-primary text-white shadow-primary/30 active:scale-95"
             )}
           >
              {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
              <span>{isSaving ? (language === 'bn' ? 'সেভ হচ্ছে...' : 'Saving...') : t.settings.personalDetails.save}</span>
           </motion.button>
        </div>
      </div>
    </div>
  );
}

function SecurityPrivacySection({ t, onBack, onNavigateToPrivacy }: { t: any, onBack: () => void, onNavigateToPrivacy?: () => void }) {
  const [privacySettings, setPrivacySettings] = useState({
    biometric: true,
    location: false,
    twoFactor: true,
  });

  return (
    <div className="px-6 -mt-16 relative z-10">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <ShieldCheck size={24} />
           </div>
           <div>
              <h3 className="text-xl font-bn font-bold text-title">{t.settings.security}</h3>
              <p className="text-xs text-muted font-bn">আপনার তথ্য সুরক্ষিত রাখুন</p>
           </div>
        </div>

        <div className="space-y-4">
           <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-primary shadow-sm">
                 <Fingerprint size={20} />
              </div>
              <div className="flex-1">
                 <h4 className="font-bn font-bold text-slate-700 dark:text-slate-200">{t.settings.securityPrivacy.biometric}</h4>
                 <p className="text-[10px] text-muted">দ্রুত ও নিরাপদ লগইন</p>
              </div>
              <button 
                onClick={() => setPrivacySettings({...privacySettings, biometric: !privacySettings.biometric})}
                className={cn("w-12 h-6 rounded-full p-1 transition-colors relative", privacySettings.biometric ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}
              >
                <motion.div animate={{ x: privacySettings.biometric ? 24 : 0 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
           </div>

           <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-rose-500 shadow-sm">
                 <MapPin size={20} />
              </div>
              <div className="flex-1">
                 <h4 className="font-bn font-bold text-slate-700 dark:text-slate-200">{t.settings.securityPrivacy.locationHistory}</h4>
                 <p className="text-[10px] text-muted">আপনার গত ভ্রমণপথ ট্র্যাক করুন</p>
              </div>
              <button 
                onClick={() => setPrivacySettings({...privacySettings, location: !privacySettings.location})}
                className={cn("w-12 h-6 rounded-full p-1 transition-colors relative", privacySettings.location ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}
              >
                <motion.div animate={{ x: privacySettings.location ? 24 : 0 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
           </div>

           <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-indigo-500 shadow-sm">
                 <Shield size={20} />
              </div>
              <div className="flex-1">
                 <h4 className="font-bn font-bold text-slate-700 dark:text-slate-200">{t.settings.securityPrivacy.twoFactor}</h4>
                 <p className="text-[10px] text-muted">দ্বি-স্তর বিশিষ্ট নিরাপত্তা ব্যবস্থা</p>
              </div>
              <button 
                onClick={() => setPrivacySettings({...privacySettings, twoFactor: !privacySettings.twoFactor})}
                className={cn("w-12 h-6 rounded-full p-1 transition-colors relative", privacySettings.twoFactor ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}
              >
                <motion.div animate={{ x: privacySettings.twoFactor ? 24 : 0 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
           </div>
           
           <div className="pt-6">
              <button 
                onClick={() => onBack()} // This actually goes back to MAIN, wait. 
                // SecurityPrivacySection is rendered when activeSection is 'SECURITY'.
                // If I click Privacy Policy, I want activeSection to become 'PRIVACY'.
                // The prop onBack in SecurityPrivacySection is set to () => setActiveSection('MAIN').
                // Let's add a NEW prop or just use a hook if it was inside the component, but it's passed as a prop.
                // Wait, SecurityPrivacySection is a separate component. I need to pass a way to change the section.
                className="hidden"
              />
              <ProfileItem 
                icon={Info} 
                title={t.settings.securityPrivacy.privacyPolicy} 
                onClick={() => onNavigateToPrivacy?.()} 
              />
           </div>

           <div className="pt-4">
              <button className="w-full py-4 rounded-3xl font-bn font-bold text-rose-500 border border-rose-500/20 hover:bg-rose-500/5 transition-all flex items-center justify-center gap-2">
                 <Trash2 size={18} />
                 <span>ডিলিট অ্যাকাউন্ট</span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function AppSettingsDetailSection({ t, onBack }: { t: any, onBack: () => void }) {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = () => {
    setIsClearing(true);
    // Real cache clearing
    try {
      localStorage.removeItem('service-cache');
      // Just some UI feedback for a short time
      const timer = setTimeout(() => {
        setIsClearing(false);
      }, 500);
      return () => clearTimeout(timer);
    } catch (e) {
      setIsClearing(false);
    }
  };

  return (
    <div className="px-6 -mt-16 relative z-10">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Settings size={24} />
           </div>
           <div>
              <h3 className="text-xl font-bn font-bold text-title">{t.settings.appSettings}</h3>
              <p className="text-xs text-muted font-bn">অ্যাপের প্রযুক্তিগত কনফিগারেশন</p>
           </div>
        </div>

        <div className="space-y-4">
           <button 
             onClick={handleClearCache}
             disabled={isClearing}
             className="w-full flex items-center justify-between p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-amber-500/20 transition-all group"
           >
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-amber-500 group-hover:rotate-180 transition-transform">
                    <Database size={18} />
                 </div>
                 <div className="text-left">
                    <h4 className="font-bn font-bold text-slate-700 dark:text-slate-200">{t.settings.appSettingsDetails.cache}</h4>
                    <p className="text-[10px] text-muted">১২.৪ MB ডেটা ব্যবহৃত হচ্ছে</p>
                 </div>
              </div>
              {isClearing ? <RefreshCw className="animate-spin text-amber-500" size={18} /> : <ChevronRight size={18} className="text-slate-400" />}
           </button>

           <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3 text-slate-500">
                    <Info size={16} />
                    <span className="text-xs font-bn font-bold">{t.settings.appSettingsDetails.version}</span>
                 </div>
                 <span className="text-xs font-display font-medium text-slate-400 tracking-wider">v2.5.0-premium</span>
              </div>
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3 text-slate-500">
                    <Smartphone size={16} />
                    <span className="text-xs font-bn font-bold">{t.settings.appSettingsDetails.build}</span>
                 </div>
                 <span className="text-xs font-display font-medium text-slate-400 tracking-wider">SK_BUILD_8923</span>
              </div>
           </div>

           <button className="w-full py-4 rounded-3xl font-bn font-bold bg-primary text-white shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <RefreshCw size={18} />
              <span>{t.settings.appSettingsDetails.update}</span>
           </button>
        </div>

        <div className="mt-8 p-5 rounded-3xl bg-indigo-500/5 border border-indigo-500/10">
           <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 px-1">ডেভেলপার তথ্য</h4>
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                 <Shield size={16} />
              </div>
              <div>
                 <p className="text-xs font-display font-bold text-slate-700 dark:text-slate-200">Smart Digital Labs</p>
                 <p className="text-[9px] text-slate-400 font-medium">Powering Smart Citizen Journey</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicySection({ t, onBack }: { t: any, onBack: () => void }) {
  const policy = t.settings.privacyPolicyContent;

  return (
    <div className="px-6 -mt-16 relative z-10">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Shield size={24} />
           </div>
           <div>
              <h3 className="text-xl font-bn font-bold text-title">{policy.title}</h3>
              <p className="text-xs text-muted font-bn">{policy.lastUpdated}</p>
           </div>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="font-bn text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            {policy.intro}
          </p>

          <div className="space-y-8">
            {policy.sections.map((section: any, idx: number) => (
              <div key={`section-${idx}`} className="space-y-3">
                <h4 className="font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-primary rounded-full" />
                  {section.title}
                </h4>
                <p className="font-bn text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-3.5 border-l border-slate-100 dark:border-slate-800">
                  {section.content}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
             <p className="text-xs font-bn text-slate-500 mb-1">যেকোনো তথ্যের জন্য যোগযোগ করুন</p>
             <p className="text-sm font-bn font-bold text-primary">support@smartupazila.gov.bd</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileItem({ icon: Icon, title, onClick, extra }: { icon: any, title: string, onClick: () => void, extra?: string }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 rounded-[2.5rem] bg-white dark:bg-slate-900 soft-shadow border border-transparent hover:border-primary/20 transition-all active:scale-[0.98] group"
    >
      <div className="flex items-center gap-4 text-left">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:scale-110 transition-transform group-hover:bg-primary/10 group-hover:text-primary">
          <Icon size={22} />
        </div>
        <span className="font-bn font-bold text-lg text-slate-700 dark:text-slate-200">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        {extra && (
          <span className="text-[10px] font-bn font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-xl uppercase tracking-wider">
            {extra}
          </span>
        )}
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <ChevronRight size={16} />
        </div>
      </div>
    </button>
  );
}

function NotificationToggle({ label, description, active, onToggle }: { 
    label: string, 
    description: string, 
    active: boolean, 
    onToggle: () => void 
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h4 className="font-bn font-bold text-slate-700 dark:text-slate-300">{label}</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{description}</p>
            </div>
            <button 
                onClick={onToggle}
                className={cn(
                    "w-10 h-5 rounded-full p-1 transition-colors relative",
                    active ? "bg-primary" : "bg-slate-200 dark:bg-slate-600"
                )}
            >
                <motion.div 
                    animate={{ x: active ? 20 : 0 }}
                    className="w-3 h-3 rounded-full bg-white shadow-sm"
                />
            </button>
        </div>
    );
}

function MyOrdersSection({ 
  language, 
  onBack, 
  onNavigate 
}: { 
  language: string, 
  onBack: () => void, 
  onNavigate: (s: Screen, p?: any) => void 
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'orders'),
      where('buyerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort by latest createdAt
      items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.seconds || b.createdAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });
      setOrders(items);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'orders');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <div className="px-6 py-4 font-bn">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={onBack}
          className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {language === 'bn' ? 'আমার অর্ডারসমূহ' : 'My Orders'}
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {language === 'bn' ? 'অর্ডার ট্র্যাকিং ও ইতিহাস' : 'Order Tracking & History'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="animate-spin text-amber-500 w-8 h-8" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-slate-400">
          <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="font-bold">
            {language === 'bn' ? 'এখন পর্যন্ত কোনো অর্ডার করা হয়নি।' : 'No orders found yet.'}
          </p>
          <button 
            onClick={() => onNavigate('MARKETPLACE')}
            className="mt-4 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-all active:scale-95"
          >
            {language === 'bn' ? 'মার্কেটপ্লেসে যান' : 'Go to Marketplace'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o, idx) => {
            const isActive = o.status !== 'delivered';
            return (
              <div 
                key={o.id ? `order-profile-${o.id}-${idx}` : `order-profile-fallback-${idx}`}
                className={cn(
                  "bg-white dark:bg-slate-900 border rounded-[2rem] p-5.5 soft-shadow space-y-4 transition-all hover:border-amber-500/20",
                  isActive ? "border-amber-500/15" : "border-slate-100 dark:border-slate-800"
                )}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white text-sm leading-snug">
                      {o.productName} ({o.quantity}টি)
                    </h4>
                    <span className="text-[10px] text-slate-400 font-bold block mt-1">
                      ID: #{o.id.slice(-6).toUpperCase()} • {language === 'bn' ? 'তারিখ:' : 'Date:'} {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US') : ''}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider",
                    o.status === 'pending' && "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                    o.status === 'accepted' && "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
                    o.status === 'picked' && "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
                    o.status === 'delivered' && "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  )}>
                    {o.status === 'pending' && (language === 'bn' ? 'নতুন অর্ডার' : 'Pending')}
                    {o.status === 'accepted' && (language === 'bn' ? (o.riderId ? 'রাইডার আসছে' : 'রাইডার খুঁজছে') : 'Rider Searching')}
                    {o.status === 'picked' && (language === 'bn' ? 'ডেলিভারিতে আছে' : 'Picked Up')}
                    {o.status === 'delivered' && (language === 'bn' ? 'ডেলিভার্ড সম্পন্ন' : 'Delivered')}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        o.status === 'pending' && "w-1/4 bg-amber-500",
                        o.status === 'accepted' && "w-2/4 bg-blue-500",
                        o.status === 'picked' && "w-3/4 bg-indigo-500",
                        o.status === 'delivered' && "w-full bg-emerald-500"
                      )}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                    <span>{language === 'bn' ? 'পেন্ডিং' : 'Pending'}</span>
                    <span>{language === 'bn' ? 'গৃহিত' : 'Accepted'}</span>
                    <span>{language === 'bn' ? 'সংগৃহীত' : 'Picked'}</span>
                    <span>{language === 'bn' ? 'ডেলিভার্ড' : 'Delivered'}</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl text-xs space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400">
                    <span>{language === 'bn' ? 'পণ্যমূল্য:' : 'Product Price:'}</span>
                    <span className="text-slate-800 dark:text-white">৳{o.productPrice * o.quantity}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400">
                    <span>{language === 'bn' ? 'ডেলিভারি চার্জ:' : 'Delivery Charge:'}</span>
                    <span className="text-slate-800 dark:text-white">৳{o.deliveryCharge}</span>
                  </div>
                  <div className="flex justify-between font-black text-slate-800 dark:text-white pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                    <span>{language === 'bn' ? 'মোট পরিশোধিত:' : 'Total Paid:'}</span>
                    <span className="text-amber-500 text-sm">৳{o.totalAmount}</span>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-1">
                  <button
                    onClick={() => onNavigate('ORDER_TRACKING', { orderId: o.id })}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bn font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-amber-500/10"
                  >
                    <span>{language === 'bn' ? 'লাইভ ট্র্যাক করুন' : 'Live Track Order'}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyContributionsSection({ t, language, onBack }: { t: any, language: string, onBack: () => void }) {
  const [contributions, setContributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'providers'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContributions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'providers');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই কন্ট্রিবিউশনটি মুছে ফেলতে চান?')) return;
    try {
      await deleteDoc(doc(db, 'providers', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `providers/${id}`);
    }
  };

  return (
    <div className="px-6 -mt-16 relative z-10">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl min-h-[50vh]">
        <div className="flex items-center gap-4 mb-8">
           <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Plus size={24} />
           </div>
           <div>
              <h3 className="text-xl font-bn font-bold text-title">{language === 'bn' ? 'আমার কন্ট্রিবিউশন' : 'My Contributions'}</h3>
              <p className="text-xs text-muted font-bn">আপনার যুক্ত করা সেবাসমূহ এবং তাদের অবস্থা</p>
           </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : contributions.length > 0 ? (
          <div className="space-y-4">
            {contributions.map((item, idx) => (
              <div 
                key={`contribution-item-${item.id}-${idx}`}
                className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center text-primary shadow-sm">
                      <Briefcase size={20} />
                    </div>
                    <div>
                      <h4 className="font-bn font-bold text-slate-800 dark:text-slate-200">{item.name}</h4>
                      <p className="text-[10px] text-muted uppercase tracking-widest">{item.category}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1.5 rounded-full text-[10px] font-bn font-bold uppercase tracking-wider flex items-center gap-1.5",
                    item.status === 'approved' ? "bg-green-500/10 text-green-500" : 
                    item.status === 'rejected' ? "bg-red-500/10 text-red-500" : 
                    "bg-amber-500/10 text-amber-500"
                  )}>
                    {item.status === 'approved' ? <CheckCircle size={10} /> : 
                     item.status === 'rejected' ? <X size={10} /> : <Clock size={10} />}
                    {item.status === 'approved' ? (language === 'bn' ? 'অনুমোদিত' : 'Approved') : 
                     item.status === 'rejected' ? (language === 'bn' ? 'বাতিল' : 'Rejected') : 
                     (language === 'bn' ? 'অপেক্ষমান' : 'Pending')}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-bold">{item.rating || '0.0'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
               <Briefcase size={40} />
            </div>
            <div>
              <p className="font-bn font-bold text-slate-500">আপনি এখনও কোনো সেবা যুক্ত করেননি</p>
              <p className="text-xs text-slate-400 font-bn mt-1">AI সার্ভিস হাব থেকে নতুন সেবা যুক্ত করুন</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MyReportsSection({ language, onBack }: { language: string, onBack: () => void }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'reports'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      default: return 'bg-green-500/10 text-green-500 border border-green-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'solved': return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
      case 'investigating': return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
      case 'rejected': return 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
      default: return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    }
  };

  return (
    <div className="px-6 -mt-16 relative z-10 font-bn">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl min-h-[50vh]">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all animate-none"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="text-xl font-bold text-title">{language === 'bn' ? 'আমার রিপোর্টসমূহ' : 'My Reports'}</h3>
            <p className="text-xs text-muted">আপনার দাখিলকৃত অভিযোগ ও সমস্যার বিবরণ এবং বর্তমান অবস্থা</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : reports.length > 0 ? (
          <div className="space-y-4">
            {reports.map((item, idx) => (
              <div 
                key={`report-item-${item.id}-${idx}`}
                className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col gap-3 group hover:border-primary/20 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold block uppercase">#{item.id}</span>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">{item.title}</h4>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] uppercase font-bold", getPriorityColor(item.priority))}>
                      {item.priority === 'high' ? (language === 'bn' ? 'উচ্চ' : 'High') :
                       item.priority === 'medium' ? (language === 'bn' ? 'মাঝারি' : 'Medium') :
                       (language === 'bn' ? 'নিম্ন' : 'Low')}
                    </span>
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] uppercase font-bold", getStatusColor(item.status))}>
                      {item.status === 'solved' ? (language === 'bn' ? 'সমাধানকৃত' : 'Solved') :
                       item.status === 'investigating' ? (language === 'bn' ? 'তদন্তাধীন' : 'Investigating') :
                       item.status === 'rejected' ? (language === 'bn' ? 'বাতিল' : 'Rejected') :
                       (language === 'bn' ? 'অপেক্ষমান' : 'Pending')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {item.description}
                </p>

                {item.address && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium bg-white dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850">
                    📍 {item.address}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
               <Info size={40} />
            </div>
            <div>
              <p className="font-bold text-slate-500">{language === 'bn' ? 'কোনো অভিযোগ খুঁজে পাওয়া যায়নি' : 'No reports found'}</p>
              <p className="text-xs text-slate-400 mt-1">{language === 'bn' ? 'নাগরিক समस्या দাখিল করতে "অভিযোগ ও সমস্যা" ফিচারে যান।' : 'Submit citizen complaints to participate in upazila improvements.'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MyReviewsSection({ language, onBack }: { language: string, onBack: () => void }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'reviews'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  return (
    <div className="px-6 -mt-16 relative z-10 font-bn">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 soft-shadow border border-slate-100 dark:border-slate-800 shadow-xl min-h-[50vh]">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all animate-none"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="text-xl font-bold text-title">{language === 'bn' ? 'আমার রিভিউসমূহ' : 'My Reviews'}</h3>
            <p className="text-xs text-muted">আপনার রিভিউ রেটিং ও সেবাদাতাদের প্রতি মন্তব্য</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.map((item, idx) => (
              <ProfileReviewItem 
                key={`review-item-${item.id}-${idx}`}
                item={item}
                language={language}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
               <Star size={40} />
            </div>
            <div>
              <p className="font-bold text-slate-500">{language === 'bn' ? 'কোনো রিভিউ পাওয়া যায়নি' : 'No reviews or ratings found'}</p>
              <p className="text-xs text-slate-400 mt-1">{language === 'bn' ? 'ইউজার সার্ভিস হাব এবং অন্যান্য ফিচারের সেবাদাতাদের রেটিং দিন।' : 'Rate and review service providers in AI Service Hub.'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileReviewItem({ item, language }: { item: any, language: string }) {
  const [providerName, setProviderName] = useState<string>('');

  useEffect(() => {
    if (!item.providerId) return;
    const providerRef = doc(db, 'providers', item.providerId);
    getDoc(providerRef).then((snap) => {
      if (snap.exists()) {
        setProviderName(snap.data().name || '');
      } else {
        setProviderName(language === 'bn' ? 'অজানা সেবাদাতা' : 'Unknown Provider');
      }
    }).catch(err => {
      console.warn("Failed to retrieve provider details:", err);
    });
  }, [item.providerId, language]);

  return (
    <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">{providerName || (language === 'bn' ? 'লোডিং হচ্ছে...' : 'Loading provider...')}</h4>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 select-none block mt-0.5 font-mono">PROVIDER ID: {item.providerId?.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1.5 rounded-full shadow-sm text-sm font-bold text-amber-500">
          <Star size={13} fill="currentColor" />
          <span>{item.rating || '5.0'}</span>
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium italic select-all leading-relaxed">
        "{item.comment || (language === 'bn' ? 'কোনো মন্তব্য নেই' : 'No comments submitted')}"
      </p>
    </div>
  );
}
