import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Store, Camera, ArrowLeft, CheckCircle2, AlertCircle, MapPin, Loader2 } from 'lucide-react';
import { db, auth, storage } from '../lib/firebase';
import { doc, setDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { compressAndConvertToBase64 } from '../lib/image-utils';
import MapModal from '../components/MapModal';

interface SellerApplyProps {
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
}

export default function SellerApplyScreen({ onNavigate, language }: SellerApplyProps) {
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [nid, setNid] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map state
  const [isMapOpen, setIsMapOpen] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => {
    // Load local storage fallbacks first for fast visual load
    const savedLat = localStorage.getItem('user_lat');
    const savedLng = localStorage.getItem('user_lng');
    const savedAddress = localStorage.getItem('user_address');
    if (savedLat && savedLng) {
      setLocation({ lat: Number(savedLat), lng: Number(savedLng) });
    }
    if (savedAddress) {
      setAddress(savedAddress);
    }

    if (currentUser) {
      setName(currentUser.displayName || '');
      // Load current user's profile to check if already pending
      const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
        if (snap.exists()) {
          const u = snap.data();
          if (u.isSeller === 'pending') {
            setSuccess(true);
          }
          if (u.lat && u.lng) {
            setLocation({ lat: Number(u.lat), lng: Number(u.lng) });
          }
          if (u.address) {
            setAddress(u.address);
          }
          if (u.phone) {
            setPhone(u.phone);
          }
          if (u.nid) {
            setNid(u.nid);
          }
          if (u.businessName) {
            setBusinessName(u.businessName);
          }
        }
      });
      return () => unsub();
    }
  }, [currentUser]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadBusinessImage = async (file: File): Promise<string> => {
    try {
      const storageRef = ref(storage, `sellers/${currentUser?.uid || 'anonymous'}_${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      const storagePromise = new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(Math.round(progress));
          },
          (error) => reject(error),
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          }
        );
      });

      // 12 seconds timeout for Firebase Storage
      const withTimeout = (promise: Promise<string>, timeoutMs: number): Promise<string> => {
        return Promise.race([
          promise,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
        ]);
      };

      return await withTimeout(storagePromise, 12000);
    } catch (err) {
      console.warn("Storage upload failed for seller image, falling back to compressed base64:", err);
      setUploadProgress(50);
      // Fallback base64 conversion & compression
      const base64Url = await compressAndConvertToBase64(file, 600, 0.6);
      setUploadProgress(100);
      return base64Url;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!imageFile) {
      setError(language === 'bn' ? 'দোকানের লোগো/ছবি নির্বাচন করা আবশ্যক' : 'Shop/Business Image is required');
      return;
    }
    if (!location) {
      setError(language === 'bn' ? 'দয়া করে ম্যাপে আপনার দোকানের লোকেশন চিহ্নিত করুন' : 'Please pin your shop location on the map');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Upload/Convert Image
      const imageUrl = await uploadBusinessImage(imageFile);

      // 2. Write Verification Request to Firestore
      const requestData = {
        userId: currentUser.uid,
        userName: name,
        type: 'seller',
        status: 'pending',
        details: {
          nid,
          phone,
          address,
          businessName,
          lat: location.lat,
          lng: location.lng,
          imageUrl
        },
        createdAt: new Date()
      };

      await addDoc(collection(db, 'verificationRequests'), requestData);

      // 3. Set 'isSeller' to 'pending' in User Document
      await setDoc(doc(db, 'users', currentUser.uid), {
        isSeller: 'pending',
        phone,
        address,
        businessName,
        lat: location.lat,
        lng: location.lng,
        updatedAt: new Date()
      }, { merge: true });

      setSuccess(true);
    } catch (err: any) {
      console.error("Seller application failed:", err);
      setError(language === 'bn' ? 'আবেদন জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' : 'Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMapConfirm = async (pos: any) => {
    const coords = { lat: Number(pos.lat), lng: Number(pos.lng) };
    setLocation(coords);
    const finalAddress = pos.address || address;
    setAddress(finalAddress);
    setIsMapOpen(false);

    // Save locally and in database immediately so it is permanently persisted
    localStorage.setItem('user_lat', String(coords.lat));
    localStorage.setItem('user_lng', String(coords.lng));
    if (finalAddress) {
      localStorage.setItem('user_address', finalAddress);
    }

    if (currentUser) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), {
          lat: coords.lat,
          lng: coords.lng,
          address: finalAddress,
          updatedAt: new Date()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to instantly save pinned location to Firestore:", err);
      }
    }
  };

  return (
    <div className="p-6 pb-24 font-bn">
      {/* Top Navigation Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => onNavigate('MARKETPLACE')}
          className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">উদ্যোক্তা (বিক্রেতা) আবেদন</h2>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Join Sreepur Merchant Network</p>
        </div>
      </div>

      {success ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-center soft-shadow py-12">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={36} className="animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">আবেদন সফলভাবে জমা হয়েছে!</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto mb-8">
            আপনার দেয়া সকল তথ্য ও এনআইডি সফলভাবে পাঠানো হয়েছে। অ্যাডমিন কর্তৃক যাচাই-বাছাই শেষে আগামী ২৪ ঘণ্টার মধ্যে আপনার সেলার অ্যাকাউন্টটি সচল করে দেওয়া হবে। ধন্যবাদ।
          </p>
          <button 
            onClick={() => onNavigate('MARKETPLACE')}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
          >
            মার্কেটপ্লেসে ফিরে যান
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Store size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">দোকানের বিবরণ</h4>
              <p className="text-[9px] text-slate-400 font-bold">Please fill in details accurately</p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 text-rose-500 border border-rose-500/15 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">উদ্যোক্তার নাম</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="আপনার পুরো নাম লিখুন"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">ব্যবসা/দোকানের নাম</label>
            <input 
              type="text" 
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="যেমন: মাওনা অর্গানিক ডেইরি ফার্ম"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">যোগাযোগের মোবাইল নম্বর</label>
            <input 
              type="tel" 
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="যেমন: ০১৭XXXXXXXX"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">জাতীয় পরিচয়পত্র (NID) নম্বর</label>
            <input 
              type="number" 
              required
              value={nid}
              onChange={(e) => setNid(e.target.value)}
              placeholder="এনআইডি নম্বর দিন"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
            />
          </div>

          {/* Location Picker */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">দোকানের অবস্থান (লোকেশন)</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                required
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (!location) {
                    setLocation({ lat: 24.2000, lng: 90.4667 });
                  }
                }}
                onClick={() => setIsMapOpen(true)}
                placeholder="ম্যাপ থেকে ঠিকানা নির্বাচন করুন বা ম্যানুয়ালি লিখুন"
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-amber-500 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setIsMapOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold p-3.5 rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
              >
                <MapPin size={18} />
              </button>
            </div>
          </div>

          {/* Shop Image upload */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-2">দোকানের ছবি/লোগো আপলোড</label>
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center group">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="text-slate-400 group-hover:scale-110 transition-transform" size={24} />
                )}
              </div>
              <div className="flex-1">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageChange}
                  id="seller-image-upload"
                  className="hidden" 
                />
                <label 
                  htmlFor="seller-image-upload"
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs px-4 py-3 rounded-xl cursor-pointer inline-block"
                >
                  ছবি নির্বাচন করুন
                </label>
                <p className="text-[9px] text-slate-400 mt-2">JPEG/PNG ফাইল, সাইজ সর্বোচ্চ ৫ মেগাবাইট</p>
              </div>
            </div>
          </div>

          {loading && uploadProgress > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>ছবি আপলোড হচ্ছে...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full bg-amber-500 rounded-full"
                />
              </div>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                আবেদন জমা হচ্ছে...
              </>
            ) : 'আবেদন সাবমিট করুন'}
          </button>
        </form>
      )}

      {/* Map Picker Modal */}
      {isMapOpen && (
        <MapModal 
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleMapConfirm}
          initialPosition={{ lat: 24.2000, lng: 90.4667 }}
        />
      )}
    </div>
  );
}
