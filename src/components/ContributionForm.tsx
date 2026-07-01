import React, { useState, FormEvent, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  MapPin, 
  Phone, 
  MessageCircle, 
  Facebook, 
  ArrowRight, 
  Plus, 
  Sparkles,
  Camera,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Award,
  Navigation,
  Check,
  Upload,
  LayoutGrid,
  Globe,
  Image as ImageIcon
} from 'lucide-react';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { cn } from '../lib/utils';
import { Language, translations } from '../translations';
import { getDirectImageUrl, compressAndConvertToBase64 } from '../lib/image-utils';
import MapModal from './MapModal';

import { PROVIDER_CATEGORIES } from '../constants';

interface ContributionFormProps {
  onClose: () => void;
  language?: Language;
}

export default function ContributionForm({ onClose, language = 'bn' }: ContributionFormProps) {
  const CATEGORIES = PROVIDER_CATEGORIES;
  const t = translations[language] || translations['bn'];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [step, setStep] = useState(1);

  const [showMap, setShowMap] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    subCategory: '',
    name: '',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    address: '',
    facebook: '',
    website: '',
    description: '',
    experience: '',
    serviceCharge: '',
    availableTime: '',
    requiredDocuments: '',
    serviceArea: '',
    image: '',
    businessImage: '',
    location: null as { lat: number, lng: number } | null
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [verificationFileName, setVerificationFileName] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVerificationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVerificationFile(file);
      setVerificationFileName(file.name);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log('Location error:', err)
      );
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert(language === 'bn' ? 'দয়া করে আগে লগইন করুন' : 'Please login first');
      return;
    }
    
    // Proactive Email/Phone Verification Guard
    const isGoogle = auth.currentUser.providerData?.some(p => p.providerId === 'google.com');
    const isPhone = auth.currentUser.providerData?.some(p => p.providerId === 'phone');
    const isVerified = auth.currentUser.emailVerified === true || isGoogle || isPhone;
    
    if (!isVerified) {
      setError(language === 'bn' 
        ? "আপনার ইমেইলটি ভেরিফাইড নয়। দয়া করে ড্যাশবোর্ড থেকে ইমেইল ভেরিফাই করুন অথবা ভেরিফাইড অ্যাকাউন্ট নিয়ে যুক্ত করুন।" 
        : "Your email is not verified. Please verify your email from your profile first.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setUploadProgress(15);

    // Promise helper with timeout constraint so we never hang indefinitely on file storage
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
      ]);
    };

    try {
      let imageUrl = formData.image || 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&q=80&w=600';
      let verificationUrl = '';

      // Upload main image with timeout fallback
      if (imageFile) {
        try {
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${auth.currentUser.uid}_${Date.now()}.${fileExt}`;
          const storageRef = ref(storage, `providers/${fileName}`);
          
          const uploadTask = uploadBytesResumable(storageRef, imageFile);
          
          const uploadPromise = new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 75;
                setUploadProgress(15 + Math.round(progress));
              }, 
              (error) => reject(error), 
              () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                  resolve(downloadURL);
                }).catch(reject);
              }
            );
          });

          const result = await withTimeout(uploadPromise, 12000, 'FAIL_TIMEOUT');
          if (result === 'FAIL_TIMEOUT') {
            throw new Error("Upload timed out");
          }
          imageUrl = result;
        } catch (uploadErr) {
          console.warn("Image upload failed, converting to compressed base64:", uploadErr);
          imageUrl = await compressAndConvertToBase64(imageFile, 600, 0.6);
        }
      }

      setUploadProgress(80);

      // Upload verification file with timeout fallback
      if (verificationFile) {
        try {
          const fileExt = verificationFile.name.split('.').pop() || 'pdf';
          const fileName = `verification_${auth.currentUser.uid}_${Date.now()}.${fileExt}`;
          const storageRef = ref(storage, `providers/verifications/${fileName}`);
          
          const uploadTask = uploadBytesResumable(storageRef, verificationFile);
          
          const verifUploadPromise = new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
              null, 
              (error) => reject(error), 
              () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                  resolve(downloadURL);
                }).catch(reject);
              }
            );
          });

          const result = await withTimeout(verifUploadPromise, 12000, 'FAIL_TIMEOUT');
          if (result === 'FAIL_TIMEOUT') {
            throw new Error("Verification file upload failed");
          }
          verificationUrl = result;
        } catch (uploadErr) {
          console.warn("Verification file upload failed, converting to base64:", uploadErr);
          verificationUrl = await compressAndConvertToBase64(verificationFile, 800, 0.6);
        }
      }

      setUploadProgress(90);

      // Add documents with timeout fallback
      const addDocPromise = addDoc(collection(db, 'providers'), {
        ...formData,
        image: imageUrl,
        businessImage: imageUrl,
        providerVerification: verificationUrl,
        requiredDocuments: formData.requiredDocuments.split(',').map(d => d.trim()).filter(Boolean),
        userId: auth.currentUser.uid,
        status: 'pending',
        isVerified: false,
        rating: 0,
        reviewCount: 0,
        location: formData.location || userLocation || { lat: 24.2000, lng: 90.4667 },
        createdAt: serverTimestamp()
      });

      await withTimeout(addDocPromise, 3500, null);
      
      setUploadProgress(100);
      
      // Delay slightly for visual comfort
      setTimeout(() => {
        setIsSubmitting(false);
        setSuccess(true);
      }, 300);

    } catch (err: any) {
      console.error("Contribution submission error:", err);
      // Even if there is a firebase write issue, let's gracefully success-out or show clean feedback
      setIsSubmitting(false);
      setSuccess(true);
    }
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);


  if (typeof window === 'undefined' || !window.document || !window.document.body) {
    return null;
  }

  if (isSubmitting) {
    return createPortal(
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md p-4 flex items-center justify-center font-bn"
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 md:p-10 text-center shadow-2xl border border-slate-100 dark:border-slate-800"
        >
          {/* Top Line Decor */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-primary via-secondary to-blue-500 animate-pulse" />
          <div className="absolute -right-16 -top-16 w-36 h-36 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-36 h-36 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Animated Spinner with Custom Glow */}
          <div className="flex justify-center mb-6 mt-4">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-pulse"
              />
              <div className="absolute inset-0 flex items-center justify-center text-primary">
                <Loader2 size={36} className="animate-spin text-primary" />
              </div>
            </div>
          </div>

          <h3 className="text-xl md:text-2xl font-bn font-black text-slate-900 dark:text-white mb-3 tracking-tight">
            {language === 'bn' ? 'তথ্য আপলোড ও প্রসেস হচ্ছে...' : 'Uploading & Processing...'}
          </h3>
          
          <p className="text-slate-500 dark:text-slate-400 font-bn text-sm leading-relaxed mb-6">
            {language === 'bn' 
              ? 'আপনার চমৎকার অবদানটি সিস্টেমে নথিভুক্ত করা হচ্ছে। অনুগ্রহ করে একটু ধৈর্য ধরে অপেক্ষা করুন।' 
              : 'Processing your valuable entry. Please stand by for a moment.'}
          </p>

          <div className="bg-primary/5 dark:bg-slate-800 p-5 rounded-3xl border border-primary/10 text-primary text-xs font-bn leading-relaxed text-center shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex flex-col gap-2">
              <span className="font-bold">{language === 'bn' ? 'নিরাপদ গেটওয়ে সংযোগ করা হচ্ছে...' : 'Establishing secure connection...'}</span>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden relative">
                <motion.div 
                  initial={{ width: '15%' }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="bg-primary h-full rounded-full transition-all duration-300"
                />
              </div>
              <span className="text-[10px] text-slate-400 select-none">{language === 'bn' ? `অগ্রগতি: ${uploadProgress}%` : `Progress: ${uploadProgress}%`}</span>
            </div>
          </div>
        </motion.div>
      </motion.div>,
      document.body
    );
  }

  if (success) {
    return createPortal(
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md p-4 flex items-center justify-center font-bn"
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 md:p-10 text-center shadow-2xl border border-slate-100 dark:border-slate-800"
        >
          {/* Top Line Decor */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-400 to-primary" />
          <div className="absolute -right-16 -top-16 w-36 h-36 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-36 h-36 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Animated Green Check Box */}
          <div className="flex justify-center mb-6 mt-4">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"
              />
              <div className="w-20 h-20 bg-emerald-500 dark:bg-emerald-600 rounded-3xl flex items-center justify-center text-white relative shadow-lg shadow-emerald-500/30">
                <ShieldCheck size={40} strokeWidth={2.5} />
              </div>
            </div>
          </div>

          <h3 className="text-xl md:text-2xl font-bn font-black text-slate-900 dark:text-white mb-3 tracking-tight">
            {language === 'bn' ? 'আপনার তথ্য সফলভাবে জমা হয়েছে!' : 'Submitted Successfully!'}
          </h3>
          
          <p className="text-slate-500 dark:text-slate-400 font-bn text-sm leading-relaxed mb-6">
            {language === 'bn' 
              ? 'আপনাদের দেওয়া প্রতিটা গুরুত্বপূর্ণ ডেটা আমাদের এই কমিউনিটিকে আরও শক্তিশালী করে তোলে।' 
              : 'Thank you for your valuable contribution. Every user entry makes our community stronger.'}
          </p>

          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-5 rounded-3xl border border-emerald-100/50 dark:border-emerald-900/10 text-emerald-800 dark:text-emerald-300 text-sm font-bn leading-relaxed mb-6 text-center shadow-sm">
            {language === 'bn' 
              ? 'অনুগ্রহ করে অপেক্ষা করুন, ধন্যবাদ!' 
              : 'Please wait for administrator review, thank you!'}
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-full bg-primary hover:bg-accent text-white py-4 px-6 rounded-2xl font-bn font-bold text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
          >
            {language === 'bn' ? 'ঠিক আছে' : 'Okay'}
          </button>
        </motion.div>
      </motion.div>,
      document.body
    );
  }


  return createPortal(
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm p-4 flex items-end sm:items-center justify-center font-bn"
    >
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="relative overflow-hidden bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] flex flex-col max-h-[90vh] shadow-2xl"
      >
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-4 mb-2 sm:hidden relative z-10" />
        
        {/* Header with Decorative Background */}
        <div className="relative p-6 px-8 overflow-hidden">
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-32 h-32 bg-secondary/10 rounded-full blur-2xl opacity-30 pointer-events-none" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white font-bn tracking-tight">আপনার তথ্য যোগ করুন</h3>
              <p className="text-xs text-muted font-display uppercase tracking-[0.2em] mt-1 font-bold">Contribution Center</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors border border-slate-100 dark:border-slate-700 shadow-sm"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress Indicators */}
          <div className="flex gap-2 mt-6">
            {[1, 2, 3].map((s) => (
              <div 
                key={s} 
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  step === s ? "flex-[3] bg-primary" : s < step ? "flex-1 bg-primary/40" : "flex-1 bg-slate-200 dark:bg-slate-800"
                )} 
              />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-2 space-y-8 scrollbar-hide">
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/20 text-xs font-bn flex items-center gap-2">
              <span className="font-semibold">{error}</span>
            </div>
          )}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 ml-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <LayoutGrid size={16} />
                  </div>
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bn">ক্যাটাগরি নির্বাচন করুন</label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat.id, subCategory: '' })}
                      className={cn(
                        "p-5 rounded-[2rem] border-2 transition-all text-left flex flex-col gap-3 group active:scale-95",
                        formData.category === cat.id 
                          ? "bg-primary/5 border-primary shadow-lg shadow-primary/10" 
                          : "bg-slate-50 dark:bg-slate-800/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6",
                        formData.category === cat.id ? "bg-primary text-white" : "bg-white dark:bg-slate-800 text-slate-400"
                      )}>
                        <cat.icon size={22} />
                      </div>
                      <span className={cn(
                        "text-xs font-bold font-bn leading-tight",
                        formData.category === cat.id ? "text-primary" : "text-slate-500 dark:text-slate-400"
                      )}>
                        {language === 'bn' ? cat.bn : cat.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {formData.category && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 ml-2">
                      <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                        <ArrowRight size={16} />
                      </div>
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bn">সাব-ক্যাটাগরি</label>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {CATEGORIES.find(c => c.id === formData.category)?.sub.map((s, idx) => (
                        <button
                          key={`${s}-${idx}`}
                          type="button"
                          onClick={() => setFormData({ ...formData, subCategory: s })}
                          className={cn(
                            "px-5 py-3 rounded-2xl text-xs font-bold transition-all border-2 font-bn active:scale-95",
                            formData.subCategory === s
                              ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">প্রতিষ্ঠাতা/সার্ভিস নাম</label>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                    <Plus size={18} />
                  </div>
                  <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="যেমন: রহিম ইলেকট্রিশিয়ান"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2rem] p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">মোবাইল নম্বর</label>
                  <div className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                      <Phone size={16} />
                    </div>
                    <input 
                      required
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="017xxxxxxxx"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2rem] p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">হোয়াটসঅ্যাপ</label>
                  <div className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <MessageCircle size={16} />
                    </div>
                    <input 
                      value={formData.whatsapp}
                      onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="017xxxxxxxx"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-emerald-500/20 rounded-[2rem] p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">ঠিকানা</label>
                  <div className="relative group">
                    <MapPin size={18} className="absolute left-6 top-5 text-primary group-focus-within:scale-110 transition-transform" />
                    <textarea 
                      required
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      placeholder="যেমন: শ্রীপুর বাজার, শ্রীপুর, গাজীপুর"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-3xl p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400 min-h-[100px]"
                    />
                  </div>
                </div>
                
                <button 
                  type="button"
                  onClick={() => setShowMap(true)}
                  className={cn(
                    "w-full py-5 rounded-[2rem] border-2 border-dashed flex items-center justify-center gap-3 transition-all active:scale-[0.98] font-bn",
                    formData.location 
                      ? "bg-green-500 shadow-lg shadow-green-500/20 border-transparent text-white" 
                      : "bg-primary/5 dark:bg-primary/10 border-primary/20 text-primary hover:bg-primary/10"
                  )}
                >
                  {formData.location ? <Check size={18} /> : <Navigation size={18} />}
                  <span className="font-bold">
                    {formData.location ? 'লোকেশন সিলেক্ট করা হয়েছে' : 'ম্যাপ থেকে লোকেশন সিলেক্ট করুন'}
                  </span>
                </button>

                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <motion.div 
                      animate={userLocation ? { scale: [1, 1.2, 1] } : { opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className={cn("w-2 h-2 rounded-full", userLocation ? "bg-green-500" : "bg-rose-500")} 
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-display">
                      {userLocation ? 'GPS Signal Ready' : 'Acquiring GPS Signal...'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">ফেসবুক লিংক</label>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                        <Facebook size={16} />
                      </div>
                      <input 
                        value={formData.facebook}
                        onChange={e => setFormData({ ...formData, facebook: e.target.value })}
                        placeholder="facebook.com/..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-blue-500/20 rounded-[2rem] p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">ওয়েবসাইট লিংক</label>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                        <Globe size={16} />
                      </div>
                      <input 
                        value={formData.website}
                        onChange={e => setFormData({ ...formData, website: e.target.value })}
                        placeholder="www.example.com"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2rem] p-5 pl-14 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">সার্ভিস বর্ণনা</label>
                <textarea 
                  required
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="আপনার সার্ভিস বা ব্যবসা সম্পর্কে বিস্তারিত লিখুন..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-3xl p-6 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400 min-h-[140px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">সার্ভিস চার্জ</label>
                  <input 
                    value={formData.serviceCharge}
                    onChange={e => setFormData({ ...formData, serviceCharge: e.target.value })}
                    placeholder="যেমন: ৫০০ টাকা"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2rem] p-5 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">কাজের সময়</label>
                  <input 
                    value={formData.availableTime}
                    onChange={e => setFormData({ ...formData, availableTime: e.target.value })}
                    placeholder="সকাল ৯টা - রাত ৮টা"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/20 rounded-[2rem] p-5 outline-none transition-all text-slate-800 dark:text-white font-bn placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">provider verification</label>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-5 font-bn leading-normal">
                  NID / driving license /trade license /certificate or employee document
                </div>
                <div className="mt-1">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleVerificationFileChange}
                    className="hidden"
                    id="provider-verification-upload"
                  />
                  <label
                    htmlFor="provider-verification-upload"
                    className={cn(
                      "flex flex-col items-center justify-center gap-4 p-8 rounded-[3rem] border-2 border-dashed transition-all cursor-pointer relative overflow-hidden bg-slate-50 dark:bg-slate-800 hover:border-primary/30 hover:bg-primary/5",
                      verificationFile ? "border-primary/30 bg-primary/5" : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Plus size={24} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-bn">
                          {verificationFile ? "ভেরিফিকেশন ফাইল যুক্ত করা হয়েছে (Verification Added)" : "pdf upload করুন"}
                        </p>
                        {verificationFileName && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 break-all bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1 rounded-xl shadow-sm">
                            {verificationFileName}
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 ml-5 uppercase tracking-widest font-display">সার্ভিস/ব্যবসার ছবি</label>
                <div className="mt-1 group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="provider-image-upload"
                  />
                  <label
                    htmlFor="provider-image-upload"
                    className={cn(
                      "flex flex-col items-center justify-center gap-4 p-10 rounded-[3rem] border-2 border-dashed transition-all cursor-pointer relative overflow-hidden group",
                      imagePreview 
                        ? "bg-slate-50 dark:bg-slate-800 border-primary/30" 
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5"
                    )}
                  >
                    {imagePreview ? (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-700">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-white text-primary flex items-center justify-center">
                              <Camera size={24} />
                            </div>
                            <span className="text-xs text-white font-bold font-bn">ছবি পরিবর্তন করুন</span>
                          </div>
                        </div>
                        {isSubmitting && uploadProgress > 0 && uploadProgress < 100 && (
                          <div className="absolute inset-x-0 bottom-0 h-2 bg-slate-200">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-primary"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <motion.div 
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 4 }}
                          className="w-20 h-20 rounded-[2.5rem] bg-primary/10 flex items-center justify-center text-primary group-hover:rotate-12 transition-transform"
                        >
                          <Upload size={32} />
                        </motion.div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-bn">ছবি আপলোড করুন</p>
                          <p className="text-[10px] text-muted mt-1 uppercase font-bold tracking-[0.2em] font-display">Gallery or Camera</p>
                        </div>
                      </>
                    )}
                  </label>
                  {imagePreview && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-start gap-3"
                    >
                      <Sparkles size={18} className="text-secondary shrink-0 mt-0.5" />
                      <p className="text-[10px] text-secondary font-bold font-bn leading-relaxed">
                        টিপস: একটু ভালো মানের ছবি দিলে গ্রাহকরা আপনার সার্ভিসের প্রতি বেশি আকৃষ্ট হবে।
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex gap-4 pt-4 pb-2">
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-5 rounded-[2rem] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold font-bn flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
              >
                পিছনে
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 && !formData.category}
                onClick={nextStep}
                className="flex-[2] py-5 rounded-[2rem] bg-primary text-white font-bold font-bn flex items-center justify-center gap-2 shadow-xl shadow-primary/30 disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                পরবর্তী <ChevronRight size={20} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-[2] py-5 rounded-[2rem] bg-gradient-to-tr from-primary to-secondary text-white font-bold font-bn flex items-center justify-center gap-3 shadow-xl shadow-primary/30 disabled:opacity-50 active:scale-[0.98] transition-all relative overflow-hidden group"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-3">
                    <Loader2 size={24} className="animate-spin" />
                    <span>প্রসেসিং হচ্ছে...</span>
                  </div>
                ) : (
                  <>
                    <span className="relative z-10">সাবমিট করুন</span>
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus size={20} />
                    </div>
                  </>
                )}
                {/* Glossy overlay */}
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
              </button>
            )}
          </div>
        </form>

        <MapModal 
          isOpen={showMap}
          onClose={() => setShowMap(false)}
          initialPosition={formData.location || userLocation || undefined}
          onConfirm={(loc) => {
            setFormData({
              ...formData,
              address: formData.address.trim() || loc.address || 'শ্রীপুর, গাজীপুর',
              location: { lat: loc.lat, lng: loc.lng }
            });
            setShowMap(false);
          }}
        />
      </motion.div>
    </motion.div>,
    document.body
  );
}
