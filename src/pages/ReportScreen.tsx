import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, FileText, Send, MapPin, CheckCircle2, Map as MapIcon, Navigation, X, Search, ShieldCheck, Files, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, getDoc, addDoc, collection, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { sendEmail } from '../services/emailService';
import { Language, translations } from '../translations';
import { compressAndConvertToBase64 } from '../lib/image-utils';

// Fix Leaflet marker icon issues in React
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom hook to handle map events like clicking to place a marker
const LocationPicker = ({ onLocationSelect }: { onLocationSelect: (latlng: L.LatLng) => void }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
};

const RecenterMap = ({ lat, lng }: { lat: number, lng: number }) => {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
    // Trigger invalidateSize after a slight delay to solve Leaflet layout/rendering sizing issues in animated modals
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);
    return () => clearTimeout(timer);
  }, [lat, lng, map]);
  return null;
};

// Sreepur, Gazipur Coordinates
const DEFAULT_CENTER = { lat: 24.2016, lng: 90.4851 };

export default function ReportScreen({ onBack, language = 'bn' }: { onBack: (trackId?: string) => void, language?: Language }) {
  const t = translations[language] || translations['bn'];
  const [success, setSuccess] = useState(false);
  const [trackingId, setTrackingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('বর্জ্য ব্যবস্থাপনা');
  const [priority, setPriority] = useState('medium');
  const [location, setLocation] = useState<{ lat: number, lng: number }>(DEFAULT_CENTER);
  const [address, setAddress] = useState('Sreepur, Gazipur');
  const [showMap, setShowMap] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: boolean }>({});

  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          setLocation({ lat: newPos.lat, lng: newPos.lng });
          fetchAddress(newPos.lat, newPos.lng);
        }
      },
    }),
    [],
  );

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetchingAddress(true);
    setAddress(language === 'bn' ? 'ঠিকানা খোঁজা হচ্ছে...' : 'Fetching address...');
    try {
      // 1. Try Nominatim (OpenStreetMap)
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=bn`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.display_name) {
            setAddress(data.display_name);
            setIsFetchingAddress(false);
            return;
          }
        }
      } catch (error) {
        console.warn('Nominatim geocoding failed, trying BigDataCloud...', error);
      }

      // 2. Try BigDataCloud reverse geocode client API
      try {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=bn`);
        if (response.ok) {
          const data = await response.json();
          let parts: string[] = [];
          
          if (data.localityInfo && data.localityInfo.administrative) {
            const adminParts = data.localityInfo.administrative
              .filter((item: any) => item.name && item.name.trim() !== '')
              .map((item: any) => item.name);
            
            if (adminParts.length > 0) {
              parts = [...adminParts].reverse();
              parts = parts.filter((p: string) => p !== 'Earth' && p !== 'পৃথিবী');
            }
          }
          
          if (parts.length === 0) {
            if (data.locality) parts.push(data.locality);
            if (data.city && data.city !== data.locality) parts.push(data.city);
            if (data.principalSubdivision) parts.push(data.principalSubdivision);
            if (data.countryName) parts.push(data.countryName);
          }
          
          if (parts.length > 0) {
            setAddress(Array.from(new Set(parts)).join(', '));
            setIsFetchingAddress(false);
            return;
          }
        }
      } catch (error) {
        console.warn('BigDataCloud geocoding failed, using local fallback...', error);
      }

      // 3. Fallback to Local Sreepur, Gazipur location name calculation
      const SREEPUR_LOCATIONS = [
        { name: 'মাওনা চৌরাস্তা, শ্রীপুর, গাজীপুর', lat: 24.2096, lng: 90.3951 },
        { name: 'মাওনা ইউনিয়ন, শ্রীপুর, গাজীপুর', lat: 24.2120, lng: 90.4131 },
        { name: 'শ্রীপুর পৌরসভা, গাজীপুর', lat: 24.2023, lng: 90.4819 },
        { name: 'শ্রীপুর রেলওয়ে স্টেশন এলাকা, শ্রীপুর, গাজীপুর', lat: 24.1983, lng: 90.4792 },
        { name: 'গোসিংগা, শ্রীপুর, গাজীপুর', lat: 24.2155, lng: 90.5476 },
        { name: 'বর্মী বাজার, শ্রীপুর, গাজীপুর', lat: 24.2625, lng: 90.5284 },
        { name: 'কাওরাইদ, শ্রীপুর, গাজীপুর', lat: 24.3015, lng: 90.4442 },
        { name: 'প্রহলাদপুর, শ্রীপুর, গাজীপুর', lat: 24.1130, lng: 90.5056 },
        { name: 'গাজীপুর ইউনিয়ন, শ্রীপুর, গাজীপুর', lat: 24.1378, lng: 90.4183 },
        { name: 'টেংরা, শ্রীপুর, গাজীপুর', lat: 24.2250, lng: 90.4800 },
        { name: 'রাজাবাড়ী, শ্রীপুর, গাজীপুর', lat: 24.1583, lng: 90.4625 }
      ];

      let nearest = SREEPUR_LOCATIONS[2]; // Default to Sreepur Pourashava
      let minDistance = Infinity;

      for (const loc of SREEPUR_LOCATIONS) {
        const d = Math.pow(loc.lat - lat, 2) + Math.pow(loc.lng - lng, 2);
        if (d < minDistance) {
          minDistance = d;
          nearest = loc;
        }
      }

      if (lat >= 23.8 && lat <= 24.6 && lng >= 90.1 && lng <= 90.7) {
        setAddress(nearest.name);
      } else {
        const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setAddress(language === 'bn' 
          ? `ঠিকানা পাওয়া যায়নি (স্থানাঙ্ক: ${coords})` 
          : `Address not found (Coords: ${coords})`
        );
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setAddress(language === 'bn' 
        ? `ঠিকানা পাওয়া যায়নি (স্থানাঙ্ক: ${coords})` 
        : `Address not found (Coords: ${coords})`
      );
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingAddress(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=bn`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newPos = { lat: parseFloat(lat), lng: parseFloat(lon) };
        setLocation(newPos);
        setAddress(display_name);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    try {
      const storageRef = ref(storage, `complaints/${Date.now()}_${file.name}`);
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

      const withTimeout = (promise: Promise<string>, timeoutMs: number): Promise<string> => {
        return Promise.race([
          promise,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
        ]);
      };

      return await withTimeout(storagePromise, 12000);
    } catch (err) {
      console.warn("Storage upload failed for complaint image, fallback to compressed base64:", err);
      setUploadProgress(50);
      const base64Url = await compressAndConvertToBase64(file, 600, 0.6);
      setUploadProgress(100);
      return base64Url;
    }
  };

  const handleNextStep = () => {
    setError(null);
    setFormErrors({});
    if (currentStep === 1) {
      if (!title.trim()) {
        setFormErrors({ title: true });
        setError(language === 'bn' ? "দয়া করে রিপোর্টের একটি শিরোনাম দিন।" : "Please provide a report title.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!description.trim()) {
        setFormErrors({ description: true });
        setError(language === 'bn' ? "দয়া করে আপনার অভিযোগের বিস্তারিত বিবরণ লিখুন।" : "Please write a detailed description of your complaint.");
        return;
      }
      setCurrentStep(3);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setFormErrors({});
    setUploadProgress(0);
    
    if (currentStep < 3) {
      handleNextStep();
      return;
    }
    
    // Field level validation
    const newErrors: { [key: string]: boolean } = {};
    if (!title.trim()) {
      newErrors.title = true;
      setError(language === 'bn' ? "দয়া করে রিপোর্টের একটি শিরোনাম দিন।" : "Please provide a report title.");
      setCurrentStep(1);
    } else if (!description.trim()) {
      newErrors.description = true;
      setError(language === 'bn' ? "দয়া করে আপনার অভিযোগের বিস্তারিত বিবরণ লিখুন।" : "Please write a detailed description of your complaint.");
      setCurrentStep(2);
    } else if (!address || !address.trim()) {
      newErrors.address = true;
      setError(language === 'bn' ? "দয়া করে সঠিক ঠিকানা বা লোকেশন চিহ্নিত করুন।" : "Please specify a location or address.");
      setCurrentStep(3);
    }

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors);
      return;
    }

    setLoading(true);
    
    try {
      let imageUrl = null;
      if (image) {
        try {
          imageUrl = await uploadImage(image);
        } catch (uploadErr) {
          setError(language === 'bn' ? "দুঃখিত, ছবিটি আপলোড করা সম্ভব হয়নি। আপনার নেটওয়ার্ক চেক করুন।" : "Sorry, could not upload the image. Please check your network.");
          setLoading(false);
          return;
        }
      }

      let userName = 'গোপন ইউজার';
      if (!isAnonymous && auth.currentUser) {
        try {
          // Attempt to fetch profile silently
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid)).catch(() => null);
          if (userDoc && userDoc.exists()) {
            userName = userDoc.data()?.displayName || auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'ইউজার';
          } else {
            userName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'ইউজার';
          }
        } catch (e) {
          // Suppress offline warning console logging to prevent triggering offline flags
          userName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'ইউজার';
        }
      }

      const reportData = {
        title,
        description,
        category,
        priority,
        // Save as both GeoPoint and plain object for flexibility
        lat: location.lat,
        lng: location.lng,
        location: new GeoPoint(location.lat, location.lng),
        address,
        isAnonymous,
        userName,
        imageUrl,
        userId: auth.currentUser?.uid || 'anonymous',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const path = 'reports';
      const docId = Math.floor(1000000 + Math.random() * 9000000).toString();
      setTrackingId(docId);

      // Save tracking ID to localStorage so they can see it in Recent Tracking on Home page immediately
      try {
        const savedTracking = localStorage.getItem('recent_tracking_ids');
        let currentHistory: string[] = [];
        if (savedTracking) {
          try {
            currentHistory = JSON.parse(savedTracking);
            if (!Array.isArray(currentHistory)) currentHistory = [];
          } catch (e) {}
        }
        const updatedHistory = [docId, ...currentHistory.filter(id => id !== docId)].slice(0, 5);
        localStorage.setItem('recent_tracking_ids', JSON.stringify(updatedHistory));
      } catch (lhErr) {
        console.warn("Could not save tracking ID locally:", lhErr);
      }

      // Immediately set success and clear loading overlay so the user sees the confirmation with docId instantly!
      setSuccess(true);
      setLoading(false);

      // Save the document and trigger notifications in the background
      (async () => {
        try {
          await setDoc(doc(db, path, docId), reportData);
        } catch (err) {
          console.warn("Background setDoc failed but queued offline:", err);
        }
        
        // Create admin notification in the background
        try {
          await addDoc(collection(db, 'admin_notifications'), {
            title: language === 'bn' ? 'নতুন অভিযোগ জমা পড়েছে' : 'New Report Submitted',
            message: language === 'bn' ? `"${title}" শিরোনামে একটি নতুন অভিযোগ জমা পড়েছে।` : `A new report titled "${title}" has been submitted.`,
            type: 'report_alert',
            createdAt: serverTimestamp(),
            isRead: false,
            reportId: docId
          });
        } catch (notifErr) {
          console.warn('Failed to send admin notification quietly:', notifErr);
        }

        // Trigger Email Notification in the background
        sendEmail({
          subject: `New Report: ${title} [${priority.toUpperCase()}]`,
          html: `
            <h3>New Citizenship Report Submitted</h3>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>Priority:</strong> <span style="color: ${priority === 'high' ? 'red' : priority === 'medium' ? 'orange' : 'blue'}">${priority.toUpperCase()}</span></p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Description:</strong> ${description}</p>
            <p><strong>Location:</strong> ${address}</p>
            ${imageUrl ? `<p><strong>Image:</strong> <br/><img src="${imageUrl}" style="max-width: 300px; border-radius: 10px;" /></p>` : ''}
            <p><strong>User ID:</strong> ${auth.currentUser?.uid || 'Anonymous'}</p>
            <p><strong>Report ID:</strong> ${docId}</p>
            <hr/>
            <p>This is an automated notification from the Upazila Helpline System.</p>
          `
        }).catch(err => console.error("Email notification failed:", err));
      })();

    } catch (err: any) {
      console.error(err);
      let errorMsg = language === 'bn' ? "রিপোর্ট সাবমিট করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" : "Submission failed. Please try again.";
      
      // Try to parse JSON from handleFirestoreError if it was thrown earlier
      try {
        if (err.message && err.message.startsWith('{')) {
          const parsed = JSON.parse(err.message);
          errorMsg = `${errorMsg} (${parsed.operationType}: ${parsed.error})`;
        }
      } catch (e) {}

      setError(errorMsg);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in font-sans">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
          className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-8 md:p-10 text-center shadow-2xl relative overflow-hidden"
        >
          {/* Decorative glowing gradient accents */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-primary via-accent to-secondary" />
          <div className="absolute -right-16 -top-16 w-36 h-36 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-36 h-36 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Glowing Animated Success Icon Bundle */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-green-500/20 rounded-full blur-xl"
              />
              <div className="w-24 h-24 bg-green-500 dark:bg-green-600 rounded-3xl flex items-center justify-center text-white relative shadow-xl shadow-green-500/30">
                <CheckCircle2 size={46} strokeWidth={2.5} />
              </div>
            </div>
          </div>

          <h3 className="text-2xl md:text-3xl font-bn font-black text-slate-900 dark:text-white mb-3 tracking-tight">
            {language === 'bn' ? 'আপনার রিপোর্টটি সফলভাবে জমা হয়েছে!' : 'Your report has been successfully submitted!'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 font-bn text-sm leading-relaxed mb-6 max-w-md mx-auto">
            {language === 'bn' 
              ? 'আইডি ব্যবহার করে শ্রীপুর সিটিজেন ওয়েবসাইটের হোম পেজে গিয়ে নাগরিক অভিযোগ ট্র্যাকিং অপশনে আপনার অভিযোগের স্থিতি জানতে পারবেন।' 
              : 'You can track the live status (Pending, Resolved, or Cancelled) of your report from the Home screen anytime using this unique tracking ID.'}
          </p>

          {/* Glowing Report Tracking ID Badge Box */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 mb-6 relative overflow-hidden group">
            <span className="text-[10px] font-bn text-slate-400 font-bold uppercase tracking-widest block mb-1">
              {language === 'bn' ? 'আপনার রিপোর্ট আইডি' : 'YOUR REPORT ID'}
            </span>
            <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900/80 px-4 py-3 border border-slate-105 dark:border-slate-800 rounded-2xl">
              <span className="text-2xl font-mono font-black text-primary tracking-wider">{trackingId}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(trackingId);
                  const btn = document.getElementById('dialog-copy-btn');
                  if (btn) {
                    btn.innerHTML = language === 'bn' ? 'কপি হয়েছে' : 'Copied!';
                    btn.classList.add('bg-emerald-500', 'text-white', 'border-emerald-500');
                    setTimeout(() => {
                      btn.innerHTML = language === 'bn' ? 'কপি করুন' : 'Copy ID';
                      btn.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-500');
                    }, 2000);
                  }
                }}
                id="dialog-copy-btn"
                className="px-4 py-2 text-xs font-bn font-bold text-primary hover:text-white bg-primary/5 hover:bg-primary border border-primary/20 hover:border-primary rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
              >
                {language === 'bn' ? 'কপি করুন' : 'Copy ID'}
              </button>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
            <button 
              onClick={() => onBack(trackingId)}
              className="w-full bg-primary hover:bg-accent text-white py-4 px-6 rounded-2xl font-bn font-bold text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {language === 'bn' ? 'হোমে ফিরে যান' : 'Back to Home'}
            </button>
            <button 
              onClick={() => {
                setSuccess(false);
                setTitle('');
                setDescription('');
                setImage(null);
                setImagePreview(null);
              }}
              className="w-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-750 py-4 px-6 rounded-2xl font-bn font-bold text-base active:scale-[0.98] transition-all"
            >
              {language === 'bn' ? 'আরেকটি রিপোর্ট করুন' : 'Submit Another'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-20">
      <div className="mt-4 mb-8">
        <h2 className="text-3xl font-display font-bold text-slate-800 dark:text-white">{t.report.title}</h2>
        <p className="text-muted font-bn mt-1 italic">{t.report.subtitle}</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="mb-8 overflow-hidden"
          >
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4 rounded-3xl flex items-center gap-4 text-rose-600 dark:text-rose-400 font-bn shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20">
                 <X size={20} strokeWidth={3} />
              </div>
              <p className="text-sm font-bold flex-1">{error}</p>
              <button onClick={() => setError(null)} className="p-2 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-10 overflow-hidden">
         <div className="flex justify-between mb-2">
            {[1, 2, 3].map(step => (
              <div key={step} className="flex flex-col items-center gap-1.5 flex-1 relative">
                 {step < 3 && (
                   <div className={cn(
                     "absolute top-4 left-[60%] right-[-40%] h-0.5 -z-10 bg-slate-100 dark:bg-slate-800",
                     currentStep > step ? "bg-primary" : ""
                   )} />
                 )}
                 <div className={cn(
                   "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all relative z-10",
                   currentStep === step ? "bg-primary text-white shadow-lg shadow-primary/20 scale-110" :
                   currentStep > step ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                 )}>
                   {currentStep > step ? <CheckCircle2 size={16} /> : step}
                 </div>
                 <span className={cn(
                    "text-[9px] font-bn font-bold uppercase tracking-wider",
                    currentStep === step ? "text-primary" : "text-slate-400"
                 )}>
                    {step === 1 ? (language === 'bn' ? "বিষয়" : "Topic") : 
                     step === 2 ? (language === 'bn' ? "বিস্তারিত" : "Details") : 
                     (language === 'bn' ? "লোকেশন" : "Location")}
                 </span>
              </div>
            ))}
         </div>
      </div>

      <div className="space-y-8">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{t.report.formTitle}</label>
                <input 
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.report.formTitlePlaceholder}
                  className={cn(
                    "w-full bg-white dark:bg-slate-800 border-2 rounded-3xl py-4 px-6 outline-none focus:border-primary transition-all font-bn soft-shadow dark:text-white",
                    formErrors.title ? "border-rose-500" : "border-slate-100 dark:border-slate-700"
                  )}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{t.report.formCategory}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'waste', name: t.report.categories.waste, color: 'emerald' },
                    { id: 'roads', name: t.report.categories.roads, color: 'amber' },
                    { id: 'water', name: t.report.categories.water, color: 'cyan' },
                    { id: 'electricity', name: t.report.categories.electricity, color: 'orange' },
                    { id: 'traffic', name: t.report.categories.traffic, color: 'rose' },
                    { id: 'others', name: t.report.categories.others, color: 'slate' },
                  ].map(cat => (
                    <button 
                      key={cat.id}
                      type="button" 
                      onClick={() => setCategory(cat.name)}
                      className={cn(
                        "px-4 py-2 rounded-2xl border-2 text-sm font-bn font-bold transition-all",
                        category === cat.name 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-primary/30"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{language === 'bn' ? "অগ্রাধিকার" : "Priority"}</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'low', label: t.report.priorityLow, color: 'blue' },
                    { id: 'medium', label: t.report.priorityMedium, color: 'amber' },
                    { id: 'high', label: t.report.priorityHigh, color: 'red' },
                  ].map(p => (
                    <button 
                      key={p.id}
                      type="button" 
                      onClick={() => setPriority(p.id)}
                      className={cn(
                        "py-3 rounded-2xl border-2 text-sm font-bn font-bold transition-all",
                        priority === p.id 
                          ? (p.id === 'high' ? "border-red-500 bg-red-50 text-red-500" : p.id === 'medium' ? "border-amber-500 bg-amber-50 text-amber-500" : "border-blue-500 bg-blue-50 text-blue-500")
                          : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{t.report.formDescription}</label>
                <textarea 
                  required
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.report.formDescriptionPlaceholder}
                  className={cn(
                    "w-full bg-white dark:bg-slate-800 border-2 rounded-[2.5rem] py-5 px-6 outline-none focus:border-primary transition-all font-bn soft-shadow dark:text-white resize-none",
                    formErrors.description ? "border-rose-500" : "border-slate-100 dark:border-slate-700"
                  )}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{t.report.formImage}</label>
                <div 
                  onClick={() => document.getElementById('imageInput')?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "w-full h-56 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 relative overflow-hidden group",
                    isDragging 
                      ? "border-primary bg-primary/5 scale-[1.02]" 
                      : "border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <input 
                    type="file" 
                    id="imageInput" 
                    hidden 
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                  
                  {imagePreview ? (
                    <div className="relative w-full h-full group">
                      <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                      
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImage(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all z-10"
                      >
                        <X size={20} />
                      </button>

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl text-white text-xs font-bold border border-white/30">
                          {language === 'bn' ? "পরিবর্তন করতে ক্লিক করুন" : "Click to change"}
                        </div>
                      </div>
                      
                      {loading && (
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-8 z-20">
                          <div className="w-full max-w-[120px] h-1.5 bg-white/20 rounded-full overflow-hidden mb-3">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-primary shadow-[0_0_10px_rgba(255,107,0,0.5)]"
                            />
                          </div>
                          <p className="text-[10px] text-white font-bold tracking-widest uppercase">
                            {language === 'bn' ? "আপলোড হচ্ছে..." : "Uploading..."} {uploadProgress}%
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={cn(
                        "w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500",
                        isDragging ? "bg-primary text-white rotate-12 scale-110" : "bg-white dark:bg-slate-900 text-slate-400 group-hover:text-primary group-hover:scale-110"
                      )}>
                        <Camera size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bn font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {language === 'bn' ? "ছবি ড্র্যাগ করে আনুন অথবা ক্লিক করুন" : "Drag & Drop or Click to Upload"}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bn italic">{t.report.formImagePlaceholder}</p>
                      </div>
                    </>
                  )}

                  {/* Drag Indicator */}
                  {isDragging && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 border-4 border-primary border-dashed rounded-[2.5rem] pointer-events-none"
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300 ml-1">{t.report.formLocation}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                       {isFetchingAddress ? (
                         <Loader2 className="text-primary animate-spin" size={18} />
                       ) : (
                         <MapPin className="text-primary" size={18} />
                       )}
                    </div>
                    <input 
                      type="text"
                      readOnly
                      value={address}
                      onClick={() => setShowMap(true)}
                      className={cn(
                        "w-full bg-white dark:bg-slate-800 border-2 rounded-3xl py-4 pl-12 pr-6 outline-none focus:border-primary transition-all font-bn soft-shadow dark:text-white cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap",
                        isFetchingAddress && "opacity-70 animate-pulse",
                        formErrors.address ? "border-rose-500" : "border-slate-100 dark:border-slate-700"
                      )}
                    />
                  </div>
                  <button 
                      type="button"
                      onClick={() => setShowMap(true)}
                      className="w-14 h-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shrink-0 soft-shadow active:scale-95 transition-all"
                  >
                      <MapIcon size={24} />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                      isAnonymous ? "bg-primary text-white" : "bg-slate-200/50 dark:bg-slate-700 text-slate-400"
                    )}>
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h4 className="font-bn font-bold text-slate-800 dark:text-white">{t.report.anonymous}</h4>
                      <p className="text-[10px] text-slate-400 font-bn uppercase tracking-widest">{t.report.anonymousSubtitle}</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all duration-300 p-1 flex items-center",
                      isAnonymous ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"
                    )}
                  >
                    <motion.div 
                      layout
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                      animate={{ x: isAnonymous ? 24 : 0 }}
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-4 pt-4">
          {currentStep > 1 && (
            <button 
              type="button"
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-4 rounded-[2rem] font-bn font-bold text-lg active:scale-95 transition-all"
            >
              {language === 'bn' ? "পিছনে" : "Back"}
            </button>
          )}
          
          {currentStep < 3 ? (
            <button 
              type="button"
              disabled={currentStep === 1 && !title}
              onClick={handleNextStep}
              className="flex-[2] bg-slate-900 border-2 border-slate-900 dark:bg-white dark:text-slate-900 text-white py-4 rounded-[2rem] font-bn font-bold text-lg active:scale-95 transition-all disabled:opacity-50"
            >
               {language === 'bn' ? "পরবর্তী ধাপ" : "Next Step"}
            </button>
          ) : (
            <button 
              type="button" 
              onClick={() => handleSubmit()}
              disabled={loading}
              className={cn(
                "flex-[2] bg-primary text-white py-4 rounded-[2rem] font-bn font-bold text-lg shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3",
                loading && "opacity-80 cursor-not-allowed"
              )}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span>{language === 'bn' ? 'সাবমিট হচ্ছে...' : 'Submitting...'}</span>
                </div>
              ) : (
                <>{t.report.submitButton} <Send size={20} /></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Map Modal */}
      <AnimatePresence>
        {showMap && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 w-full max-w-md mx-auto"
          >
            <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[3rem] sm:rounded-[3rem] h-[92vh] sm:h-[85vh] overflow-hidden flex flex-col"
            >
                <div className="px-6 py-4 flex items-center justify-between border-b dark:border-slate-800">
                    <div>
                        <h3 className="text-xl font-bn font-extrabold text-slate-800 dark:text-white">{t.report.mapModalTitle}</h3>
                        <p className="text-[10px] text-muted font-bn">{t.report.mapModalSubtitle}</p>
                    </div>
                    <button 
                        onClick={() => setShowMap(false)}
                        className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 py-3 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                   <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder={language === 'bn' ? 'ঠিকানা খুঁজুন...' : 'Search address...'}
                        className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl py-2.5 pl-12 pr-12 outline-none focus:border-primary transition-all font-bn dark:text-white"
                      />
                      {searchQuery && (
                        <button 
                          onClick={handleSearch}
                          disabled={isSearchingAddress}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-xl shadow-md active:scale-95 transition-all text-sm font-bold disabled:opacity-50"
                        >
                          {isSearchingAddress ? <Loader2 size={16} className="animate-spin" /> : (language === 'bn' ? 'খুঁজুন' : 'Find')}
                        </button>
                      )}
                   </div>
                </div>

                <div className="flex-1 relative overflow-hidden">
                    <MapContainer 
                        center={[location.lat, location.lng]} 
                        zoom={15} 
                        scrollWheelZoom={true}
                        style={{ height: '100%', width: '100%', zIndex: 1 }}
                    >
                        <LayersControl position="topright">
                          <LayersControl.BaseLayer checked name="OpenStreetMap">
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                          </LayersControl.BaseLayer>
                          <LayersControl.BaseLayer name="Google Roadmap">
                            <TileLayer
                                attribution='&copy; Google Maps'
                                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                            />
                          </LayersControl.BaseLayer>
                          <LayersControl.BaseLayer name="Google Hybrid">
                            <TileLayer
                                attribution='&copy; Google Maps'
                                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                            />
                          </LayersControl.BaseLayer>
                          <LayersControl.BaseLayer name="Google Satellite">
                            <TileLayer
                                attribution='&copy; Google Maps'
                                url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                            />
                          </LayersControl.BaseLayer>
                        </LayersControl>
                        <RecenterMap lat={location.lat} lng={location.lng} />
                        <LocationPicker 
                            onLocationSelect={(latlng) => {
                                setLocation({ lat: latlng.lat, lng: latlng.lng });
                                fetchAddress(latlng.lat, latlng.lng);
                            }} 
                        />
                        <Marker 
                            draggable={true}
                            eventHandlers={eventHandlers}
                            position={[location.lat, location.lng]}
                            ref={markerRef}
                        />

                        {/* My Location Button */}
                        <div className="absolute bottom-10 right-6 z-[1000] flex flex-col gap-2 pointer-events-auto">
                            <button 
                                type="button"
                                disabled={isLocating}
                                onClick={() => {
                                if (navigator.geolocation) {
                                    setIsLocating(true);
                                    navigator.geolocation.getCurrentPosition(
                                        (pos) => {
                                            const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                            setLocation(newPos);
                                            fetchAddress(newPos.lat, newPos.lng).finally(() => setIsLocating(false));
                                        },
                                        (err) => {
                                            console.error("Geolocation error:", err);
                                            setError(language === 'bn' ? "আপনার লোকেশন পাওয়া সম্ভব হয়নি।" : "Could not retrieve your location.");
                                            setIsLocating(false);
                                        }
                                    );
                                }
                                }}
                                className={cn(
                                "w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 text-primary flex items-center justify-center shadow-lg border border-slate-100 dark:border-slate-700 active:scale-90 transition-all",
                                isLocating && "animate-pulse opacity-70"
                                )}
                            >
                                {isLocating ? <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Navigation size={22} />}
                            </button>
                        </div>
                    </MapContainer>
                </div>

                <div className="p-5 pb-7 bg-white dark:bg-slate-900 border-t dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <MapPin className="text-primary shrink-0" size={18} />
                        <span className="text-sm font-bn text-slate-700 dark:text-slate-300 line-clamp-2">
                            {address}
                        </span>
                    </div>
                    <button 
                        onClick={() => {
                            setShowMap(false);
                        }}
                        className="w-full bg-primary text-white py-4 rounded-[2rem] font-bn font-bold text-lg shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                    >
                        {t.report.confirmLocation}
                    </button>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submission Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 w-full max-w-md mx-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6 p-10 bg-white dark:bg-slate-800 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-700 w-full max-w-sm"
            >
               <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                  <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <Send className="text-primary animate-pulse" size={32} />
               </div>
               <div className="text-center">
                  <h3 className="text-2xl font-bn font-extrabold text-slate-800 dark:text-white mb-2">
                    {language === 'bn' ? 'রিপোর্ট সাবমিট হচ্ছে...' : 'Submitting Report...'}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-bn">
                    {language === 'bn' ? 'দয়া করে অপেক্ষা করুন, এটি কিছুক্ষণ সময় নিতে পারে।' : 'Please wait, this might take a moment.'}
                  </p>
               </div>
               {uploadProgress > 0 && (
                 <div className="w-full space-y-2 mt-2">
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        className="h-full bg-primary shadow-[0_0_10px_rgba(255,107,0,0.5)]"
                       />
                    </div>
                    <p className="text-[10px] text-center font-bold text-primary uppercase tracking-widest flex items-center justify-center gap-2">
                       <Loader2 size={10} className="animate-spin" />
                       {language === 'bn' ? 'ছবি আপলোড হচ্ছে' : 'Uploading Image'}: {uploadProgress}%
                    </p>
                 </div>
               )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
