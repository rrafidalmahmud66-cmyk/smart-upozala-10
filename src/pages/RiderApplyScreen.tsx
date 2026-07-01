import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bike, Camera, ArrowLeft, CheckCircle2, AlertCircle, Loader2, MapPin } from 'lucide-react';
import { db, auth, storage } from '../lib/firebase';
import { doc, setDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { compressAndConvertToBase64 } from '../lib/image-utils';
import MapModal from '../components/MapModal';

interface RiderApplyProps {
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
}

export default function RiderApplyScreen({ onNavigate, language }: RiderApplyProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nid, setNid] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleType, setVehicleType] = useState('Bicycle');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Load current user's profile to check if already pending, and populate states
      const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
        if (snap.exists()) {
          const u = snap.data();
          if (u.isRider === 'pending') {
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

  const uploadRiderImage = async (file: File): Promise<string> => {
    try {
      const storageRef = ref(storage, `riders/${currentUser?.uid || 'anonymous'}_${Date.now()}_${file.name}`);
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
      console.warn("Storage upload failed for rider image, falling back to compressed base64:", err);
      setUploadProgress(50);
      // Fallback base64 conversion & compression
      const base64Url = await compressAndConvertToBase64(file, 600, 0.6);
      setUploadProgress(100);
      return base64Url;
    }
  };

  const handleMapConfirm = async (pos: any) => {
    const coords = { lat: Number(pos.lat), lng: Number(pos.lng) };
    setLocation(coords);
    if (pos.address) {
      setAddress(pos.address);
    }
    setIsMapOpen(false);

    // Save locally and in database immediately so it is permanently persisted
    localStorage.setItem('user_lat', String(coords.lat));
    localStorage.setItem('user_lng', String(coords.lng));
    if (pos.address) {
      localStorage.setItem('user_address', pos.address);
    }

    if (currentUser) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), {
          lat: coords.lat,
          lng: coords.lng,
          address: pos.address || address,
          updatedAt: new Date()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to instantly save pinned location to Firestore:", err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!imageFile) {
      setError(language === 'bn' ? 'ড্রাইভিং লাইসেন্স/ছবি আপলোড করা আবশ্যক' : 'Rider identity photo is required');
      return;
    }
    if (!location) {
      setError(language === 'bn' ? 'দয়া করে ম্যাপে আপনার বর্তমান অবস্থান চিহ্নিত করুন' : 'Please pin your current location on the map');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Upload/Convert Image
      const imageUrl = await uploadRiderImage(imageFile);

      // 2. Write Verification Request to Firestore
      const requestData = {
        userId: currentUser.uid,
        userName: name,
        type: 'rider',
        status: 'pending',
        details: {
          nid,
          phone,
          address,
          vehicleType,
          lat: location.lat,
          lng: location.lng,
          imageUrl
        },
        createdAt: new Date()
      };

      await addDoc(collection(db, 'verificationRequests'), requestData);

      // 3. Set 'isRider' to 'pending' in User Document
      await setDoc(doc(db, 'users', currentUser.uid), {
        isRider: 'pending',
        phone,
        address,
        vehicleType,
        lat: location.lat,
        lng: location.lng,
        updatedAt: new Date()
      }, { merge: true });

      setSuccess(true);
    } catch (err: any) {
      console.error("Rider application failed:", err);
      setError(language === 'bn' ? 'আবেদন জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' : 'Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
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
          <h2 className="text-xl font-black text-slate-900 dark:text-white">রাইডার আবেদন</h2>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Join Sreepur Logistics Network</p>
        </div>
      </div>

      {success ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-center soft-shadow py-12">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={36} className="animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">আবেদন সফলভাবে জমা হয়েছে!</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto mb-8">
            আপনার রাইডার আবেদন ও এনআইডি সফলভাবে পাঠানো হয়েছে। অ্যাডমিন কর্তৃক তথ্য যাচাই শেষে আগামী ২৪ ঘণ্টার মধ্যে আপনার রাইডার প্যানেলটি সচল করে দেওয়া হবে। ধন্যবাদ।
          </p>
          <button 
            onClick={() => onNavigate('MARKETPLACE')}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
          >
            মার্কেটপ্লেসে ফিরে যান
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Bike size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">রাইডার প্রোফাইল বিবরণ</h4>
              <p className="text-[9px] text-slate-400 font-bold">Provide logistics profile information</p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 text-rose-500 border border-rose-500/15 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">রাইডারের নাম</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="আপনার পুরো নাম লিখুন"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">মোবাইল নম্বর</label>
            <input 
              type="tel" 
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="যেমন: ০১৭XXXXXXXX"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
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
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">বর্তমান ঠিকানা</label>
            <input 
              type="text" 
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="আপনার বর্তমান গ্রাম ও ইউনিয়ন"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>

          {/* Map Location Pin */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">বর্তমান অবস্থান (ম্যাপ পিন)</label>
            <button
              type="button"
              onClick={() => setIsMapOpen(true)}
              className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-sm transition-all ${
                location 
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold" 
                  : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500"
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                <span>
                  {location 
                    ? `অবস্থান চিহ্নিত হয়েছে (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})` 
                    : 'ম্যাপে আপনার অবস্থান চিহ্নিত করুন'}
                </span>
              </div>
              <span className="text-xs text-blue-500 font-black">ম্যাপ খুলুন</span>
            </button>
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">যানবাহনের ধরন</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white font-bold"
            >
              <option value="Bicycle">বাইসাইকেল (Bicycle)</option>
              <option value="Motorbike">মোটরসাইকেল (Motorbike)</option>
              <option value="Electric Bike">ইলেকট্রিক অটো/বাইক (Electric Bike)</option>
              <option value="Walking">হেঁটে ডেলিভারি (Walking)</option>
            </select>
          </div>

          {/* Rider Photo upload */}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-2">প্রোফাইল ছবি / ড্রাইভিং লাইসেন্স ছবি আপলোড</label>
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
                  id="rider-image-upload"
                  className="hidden" 
                />
                <label 
                  htmlFor="rider-image-upload"
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
                  className="h-full bg-blue-500 rounded-full"
                />
              </div>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                আবেদন জমা হচ্ছে...
              </>
            ) : 'রাইডার আবেদন জমা দিন'}
          </button>
        </form>
      )}

      {/* Map Picker Modal */}
      {isMapOpen && (
        <MapModal 
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleMapConfirm}
          initialPosition={location || { lat: 24.2000, lng: 90.4667 }}
          title={language === 'bn' ? 'বর্তমান অবস্থান পিন করুন' : 'Pin Your Location'}
          subtitle={language === 'bn' ? 'ম্যাপ থেকে আপনার সঠিক অবস্থান সিলেক্ট করুন' : 'Select your exact current location on the map'}
        />
      )}
    </div>
  );
}
