import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Plus, 
  Store, 
  Coins, 
  PlusCircle, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  User, 
  Phone,
  Camera,
  Loader2,
  Trash2,
  AlertCircle,
  MapPin,
  Settings,
  Bike,
  MessageCircle
} from 'lucide-react';
import { db, auth, storage } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc, addDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { compressAndConvertToBase64 } from '../lib/image-utils';
import { Product, Order } from '../types';
import { cn } from '../lib/utils';
import MapModal from '../components/MapModal';

interface SellerDashboardProps {
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
}

export default function SellerDashboardScreen({ onNavigate, language }: SellerDashboardProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'wallet' | 'settings'>('products');

  // Settings Form state
  const [settingsBusinessName, setSettingsBusinessName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsLocation, setSettingsLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isSettingsMapOpen, setIsSettingsMapOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setSettingsBusinessName(userProfile.businessName || '');
      setSettingsPhone(userProfile.phone || '');
      setSettingsAddress(userProfile.address || '');
      if (userProfile.lat && userProfile.lng) {
        setSettingsLocation({ lat: userProfile.lat, lng: userProfile.lng });
      }
    }
  }, [userProfile]);

  // Add Product Form Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodCategory, setProdCategory] = useState('veggies');
  const [prodImage, setProdImage] = useState<File | null>(null);
  const [prodImagePreview, setProdImagePreview] = useState<string | null>(null);
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Withdrawal Request Form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBkash, setWithdrawBkash] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);

  const currentUser = auth.currentUser;

  // Categories
  const CATEGORIES = [
    { id: 'veggies', bn: 'শাকসবজি ও ফলমূল' },
    { id: 'poultry', bn: 'হাঁস-মুরগি ও ডিম' },
    { id: 'dairy', bn: 'দুগ্ধজাত পণ্য' },
    { id: 'handicrafts', bn: 'হস্তশিল্প ও বুটিক' },
    { id: 'used_items', bn: 'পুরাতন জিনিস' },
    { id: 'electronics', bn: 'ইলেকট্রনিক জিনিস' },
    { id: 'plants_flowers', bn: 'গাছের ফুল ও চারা' },
    { id: 'others', bn: 'অন্যান্য' }
  ];

  // Fetch Seller Profile & Data
  useEffect(() => {
    if (!currentUser) return;

    // Profile subscription
    const unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data());
      }
    });

    // Products query
    const qProd = query(collection(db, 'products'), where('sellerId', '==', currentUser.uid));
    const unsubProd = onSnapshot(qProd, (snap) => {
      const items: Product[] = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() } as Product));
      setProducts(items);
    });

    // Orders query
    const qOrders = query(collection(db, 'orders'), where('sellerId', '==', currentUser.uid));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const items: Order[] = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() } as Order));
      // Sort by latest
      items.sort((a, b) => {
        const tA = a.createdAt?.seconds || a.createdAt?.toDate?.()?.getTime() || 0;
        const tB = b.createdAt?.seconds || b.createdAt?.toDate?.()?.getTime() || 0;
        return tB - tA;
      });
      setOrders(items);
      setLoading(false);
    });

    // Subscribe to seller's own withdrawal requests
    const qWithdrawals = query(
      collection(db, 'withdrawalRequests'),
      where('userId', '==', currentUser.uid)
    );
    const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
      const items: any[] = [];
      snap.forEach(d => {
        items.push({ id: d.id, ...d.data() });
      });
      // Sort by newest
      items.sort((a, b) => {
        const tA = a.createdAt?.seconds || a.createdAt?.toDate?.()?.getTime() || 0;
        const tB = b.createdAt?.seconds || b.createdAt?.toDate?.()?.getTime() || 0;
        return tB - tA;
      });
      setMyWithdrawals(items);
    });

    return () => {
      unsubProfile();
      unsubProd();
      unsubOrders();
      unsubWithdrawals();
    };
  }, [currentUser]);

  // Automatic Recovery: Settle any completed orders that haven't been credited yet
  useEffect(() => {
    if (!currentUser) return;

    const recoverUnsettledOrders = async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('status', '==', 'delivered')
        );
        const snap = await getDocs(q);
        
        for (const d of snap.docs) {
          const order = { id: d.id, ...d.data() } as any;
          if (order.settled === true) continue;
          
          const isRiderOfThisOrder = order.riderId === currentUser.uid;
          const isSellerOfThisOrder = order.sellerId === currentUser.uid;
          
          if (isRiderOfThisOrder || isSellerOfThisOrder) {
            console.log("Found unsettled completed order:", order.id);
            
            const orderRef = doc(db, 'orders', order.id);
            const riderRef = order.riderId ? doc(db, 'users', order.riderId) : null;
            const sellerRef = order.sellerId ? doc(db, 'users', order.sellerId) : null;
            
            try {
              await runTransaction(db, async (transaction) => {
                const orderSnap = await transaction.get(orderRef);
                if (!orderSnap.exists() || orderSnap.data().settled === true) {
                  return;
                }
                
                let updatedRiderBalance = null;
                let updatedSellerBalance = null;

                // 1. Settle Rider Balance
                if (riderRef) {
                  const riderSnap = await transaction.get(riderRef);
                  if (riderSnap.exists()) {
                    const currentRiderBalance = Number(riderSnap.data().riderBalance || 0);
                    const deliveryChargeVal = Number(order.deliveryCharge || 0);
                    updatedRiderBalance = currentRiderBalance + deliveryChargeVal;
                  }
                }
                
                // 2. Settle Seller Balance
                if (sellerRef) {
                  const sellerSnap = await transaction.get(sellerRef);
                  if (sellerSnap.exists()) {
                    const currentSellerBalance = Number(sellerSnap.data().sellerBalance || 0);
                    const deliveryChargeVal = Number(order.deliveryCharge || 0);
                    const totalOrderAmt = Number(order.totalAmount || 0);
                    let productVal = totalOrderAmt - deliveryChargeVal;
                    if (isNaN(productVal) || productVal <= 0) {
                      productVal = Number(order.productPrice || 0) * Number(order.quantity || 1);
                    }
                    if (isNaN(productVal) || productVal < 0) {
                      productVal = 0;
                    }
                    updatedSellerBalance = currentSellerBalance + productVal;
                  }
                }
                
                // 3. Mark Order as Settled and write balances
                transaction.update(orderRef, {
                  settled: true,
                  settledAt: new Date()
                });

                if (riderRef && updatedRiderBalance !== null) {
                  transaction.update(riderRef, {
                    riderBalance: isNaN(updatedRiderBalance) ? 0 : updatedRiderBalance
                  });
                }

                if (sellerRef && updatedSellerBalance !== null) {
                  transaction.update(sellerRef, {
                    sellerBalance: isNaN(updatedSellerBalance) ? 0 : updatedSellerBalance
                  });
                }
              });
              console.log("Successfully settled completed order:", order.id);
            } catch (transErr) {
              console.error("Failed transaction for order settlement:", order.id, transErr);
            }
          }
        }
      } catch (err) {
        console.error("Error during automatic order settlement recovery:", err);
      }
    };

    recoverUnsettledOrders();
  }, [currentUser]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProdImage(file);
      setProdImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadProductImage = async (file: File): Promise<string> => {
    try {
      const storageRef = ref(storage, `products/${currentUser?.uid || 'anonymous'}_${Date.now()}_${file.name}`);
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
      console.warn("Storage upload failed for product image, falling back to base64 compression:", err);
      setUploadProgress(50);
      const base64Url = await compressAndConvertToBase64(file, 600, 0.6);
      setUploadProgress(100);
      return base64Url;
    }
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !prodName || !prodPrice) return;

    setSubmitLoading(true);
    try {
      let imageUrl = '';
      if (prodImage) {
        imageUrl = await uploadProductImage(prodImage);
      }

      const productPayload = {
        name: prodName,
        description: prodDesc,
        price: parseFloat(prodPrice),
        stock: parseInt(prodStock),
        category: prodCategory,
        sellerId: currentUser.uid,
        sellerName: userProfile?.businessName || currentUser.displayName || 'উদ্যোক্তা',
        pickupLocation: {
          lat: userProfile?.lat || 24.2000,
          lng: userProfile?.lng || 90.4667
        },
        imageUrl,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'products'), productPayload);

      // Reset
      setProdName('');
      setProdDesc('');
      setProdPrice('');
      setProdStock('10');
      setProdImage(null);
      setProdImagePreview(null);
      setUploadProgress(0);
      setIsAddOpen(false);
    } catch (err) {
      console.error("Failed to add product:", err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি পণ্যটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (err) {
      console.error("Delete product failed:", err);
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentBalance = userProfile?.sellerBalance || 0;
    const amount = parseFloat(withdrawAmount);

    if (!currentUser || !amount || !withdrawBkash) return;

    if (amount > currentBalance) {
      setWithdrawError(language === 'bn' ? 'আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই।' : 'Insufficient balance.');
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError(null);

    try {
      // Deduct immediately on submission for consistency
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        sellerBalance: Math.max(0, currentBalance - amount)
      });

      // Submit Withdrawal Document
      await addDoc(collection(db, 'withdrawalRequests'), {
        userId: currentUser.uid,
        userName: userProfile?.businessName || currentUser.displayName || 'উদ্যোক্তা',
        userType: 'seller',
        amount,
        bkashNumber: withdrawBkash,
        status: 'pending',
        isDeducted: true,
        createdAt: new Date()
      });

      setWithdrawSuccess(true);
      setWithdrawAmount('');
      setWithdrawBkash('');
      setTimeout(() => setWithdrawSuccess(false), 3000);
    } catch (err) {
      console.error("Withdrawal failed:", err);
      setWithdrawError(language === 'bn' ? 'অনুরোধ পাঠানো যায়নি। পরে চেষ্টা করুন।' : 'Failed to send request.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'accepted'
      });
    } catch (err) {
      console.error("Accept order failed:", err);
    }
  };

  const handleSettingsMapConfirm = (pos: any) => {
    setSettingsLocation({ lat: pos.lat, lng: pos.lng });
    setSettingsAddress(pos.address || settingsAddress);
    setIsSettingsMapOpen(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!settingsBusinessName.trim()) {
      setSettingsError(language === 'bn' ? 'ব্যবসা/দোকানের নাম আবশ্যক' : 'Shop/Business name is required');
      return;
    }
    if (!settingsPhone.trim()) {
      setSettingsError(language === 'bn' ? 'যোগাযোগের মোবাইল নম্বর আবশ্যক' : 'Contact number is required');
      return;
    }

    setIsSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(false);

    try {
      // 1. Update user document
      const userRef = doc(db, 'users', currentUser.uid);
      const updateData: any = {
        businessName: settingsBusinessName,
        phone: settingsPhone,
        address: settingsAddress,
        updatedAt: new Date()
      };

      if (settingsLocation) {
        updateData.lat = settingsLocation.lat;
        updateData.lng = settingsLocation.lng;
      }

      await updateDoc(userRef, updateData);

      // 2. Update existing products' sellerName & pickupLocation
      const productsQuery = query(collection(db, 'products'), where('sellerId', '==', currentUser.uid));
      const productsSnapshot = await getDocs(productsQuery);
      
      const batchPromises = productsSnapshot.docs.map((productDoc) => {
        const productRef = doc(db, 'products', productDoc.id);
        const productUpdate: any = {
          sellerName: settingsBusinessName
        };
        if (settingsLocation) {
          productUpdate.pickupLocation = {
            lat: settingsLocation.lat,
            lng: settingsLocation.lng
          };
        }
        return updateDoc(productRef, productUpdate);
      });

      await Promise.all(batchPromises);

      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save shop settings:", err);
      setSettingsError(language === 'bn' ? 'সেটিংস সেভ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' : 'Failed to save settings. Please try again.');
    } finally {
      setIsSettingsSaving(false);
    }
  };

  return (
    <div className="p-6 pb-24 font-bn">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onNavigate('MARKETPLACE')}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">উদ্যোক্তা ড্যাশবোর্ড</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{userProfile?.businessName || 'Merchant Center'}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white p-3.5 rounded-2xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 mb-8">
        <button 
          onClick={() => setActiveTab('products')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'products'
              ? "border-amber-500 text-amber-500 font-extrabold"
              : "border-transparent text-slate-400 font-bold"
          )}
        >
          পণ্যসমূহ ({products.length})
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'orders'
              ? "border-amber-500 text-amber-500 font-extrabold"
              : "border-transparent text-slate-400 font-bold"
          )}
        >
          অর্ডারসমূহ ({orders.length})
        </button>
        <button 
          onClick={() => setActiveTab('wallet')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'wallet'
              ? "border-amber-500 text-amber-500 font-extrabold"
              : "border-transparent text-slate-400 font-bold"
          )}
        >
          আমার আয়
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'settings'
              ? "border-amber-500 text-amber-500 font-extrabold"
              : "border-transparent text-slate-400 font-bold"
          )}
        >
          সেটিংস
        </button>
      </div>

      {/* Content Rendering */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full"
          />
        </div>
      ) : activeTab === 'products' ? (
        products.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8">
            <Store className="text-amber-500/20 w-16 h-16 mx-auto mb-4" />
            <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">আপনার কোনো পণ্য নেই</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6">আজই আপনার প্রথম স্থানীয় খামারি পণ্যটি যোগ করুন এবং শ্রীপুরের ক্রেতাদের কাছে বিক্রি শুরু করুন।</p>
            <button 
              onClick={() => setIsAddOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-6 py-3 rounded-xl"
            >
              পণ্য যোগ করুন
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((p, idx) => (
              <div 
                key={p.id ? `product-${p.id}-${idx}` : `product-fallback-${idx}`}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex gap-4 soft-shadow items-center"
              >
                <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                  {p.imageUrl || p.imageBase64 ? (
                    <img src={p.imageUrl || p.imageBase64} alt={p.name} className="w-full h-full object-cover" />
                  ) : '🏪'}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate">{p.name}</h4>
                  <span className="text-[10px] text-amber-500 font-bold block mt-0.5">৳ {p.price}</span>
                  <span className="text-[9px] text-slate-400 mt-1 block">স্টক: {p.stock || '0'}টি</span>
                </div>
                <button 
                  onClick={() => handleDeleteProduct(p.id)}
                  className="p-3 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'orders' ? (
        orders.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-slate-400">
            <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="font-bold">এখন পর্যন্ত কোনো অর্ডার পাওয়া যায়নি।</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o, idx) => (
              <div 
                key={o.id ? `order-${o.id}-${idx}` : `order-fallback-${idx}`}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 soft-shadow space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white text-sm">{o.productName} ({o.quantity}টি)</h4>
                    <span className="text-[10px] text-slate-400 font-bold block mt-1">অর্ডার আইডি: #{o.id.slice(-6).toUpperCase()}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-3 py-1 rounded-full",
                    o.status === 'pending' && "bg-amber-100 text-amber-600",
                    o.status === 'accepted' && "bg-blue-100 text-blue-600",
                    o.status === 'picked' && "bg-indigo-100 text-indigo-600",
                    o.status === 'delivered' && "bg-emerald-100 text-emerald-600"
                  )}>
                    {o.status === 'pending' && 'নতুন অর্ডার'}
                    {o.status === 'accepted' && (o.riderId ? 'রাইডার আসছে' : 'রাইডার খুঁজছে')}
                    {o.status === 'picked' && 'ডেলিভারিতে আছে'}
                    {o.status === 'delivered' && 'ডেলিভার্ড'}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-slate-400" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">ক্রেতা: {o.buyerName}</span>
                  </div>
                  {o.buyerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />
                      <a href={`tel:${o.buyerPhone}`} className="text-primary font-bold">{o.buyerPhone}</a>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 leading-tight">ঠিকানা: {o.buyerLocation?.address}</p>

                  {/* Assigned Rider Info */}
                  {o.riderId && (
                    <div className="pt-3 mt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                      <span className="text-[9px] text-blue-500 font-extrabold uppercase tracking-wider block">গৃহীত রাইডার বিবরণ:</span>
                      <div className="flex items-center gap-2">
                        <Bike size={14} className="text-blue-500" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">রাইডার: {o.riderName || 'রাইডার'}</span>
                      </div>
                      {o.riderPhone && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-slate-400" />
                            <a href={`tel:${o.riderPhone}`} className="text-primary font-bold">{o.riderPhone}</a>
                          </div>
                          <a
                            href={`https://wa.me/${o.riderPhone.replace(/\D/g, '').startsWith('0') && o.riderPhone.replace(/\D/g, '').length === 11 ? '88' + o.riderPhone.replace(/\D/g, '') : o.riderPhone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all w-max shadow-sm active:scale-95"
                          >
                            <MessageCircle size={12} /> WhatsApp এ কথা বলুন
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs font-bold text-slate-500">মোট বিল: <strong className="text-amber-500">৳{o.totalAmount}</strong> ({o.paymentMethod === 'wallet' ? 'ওয়ালেট' : 'ক্যাশ'})</span>
                  {o.status === 'pending' && (
                    <button 
                      onClick={() => handleAcceptOrder(o.id)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
                    >
                      অর্ডার গ্রহণ করুন
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'wallet' ? (
        /* Wallet & Earnings Tab */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-2 opacity-95">উদ্যোক্তা অ্যাকাউন্ট ব্যালেন্স</span>
            <span className="text-3xl font-black block mb-4">৳ {userProfile?.sellerBalance?.toFixed(2) || '0.00'}</span>
            <p className="text-[10px] text-white/90 leading-relaxed max-w-xs">
              ডেলিভারি সম্পন্ন হওয়া অর্ডারের টাকা সরাসরি এখানে জমা হবে। বিকাশ/নগদের মাধ্যমে সহজেই টাকা তুলতে পারবেন।
            </p>
          </div>

          {/* Withdrawal Form */}
          <form onSubmit={handleWithdrawalSubmit} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
            <h4 className="font-black text-slate-800 dark:text-white text-sm pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Coins size={18} className="text-emerald-500" /> টাকা উত্তোলন করুন (Withdraw)
            </h4>

            {withdrawSuccess ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="text-emerald-500 w-12 h-12 mx-auto mb-3 animate-bounce" />
                <h4 className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">উত্তোলন আবেদন জমা হয়েছে!</h4>
                <p className="text-[10px] text-slate-400 mt-1">অ্যাডমিন কর্তৃক যাচাই সাপেক্ষে ২৪ ঘণ্টার মধ্যে বিকাশ নম্বরে টাকা পাঠানো হবে।</p>
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawError && (
                  <div className="bg-rose-500/10 text-rose-500 border border-rose-500/15 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={15} />
                    <span>{withdrawError}</span>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-500 font-bold block mb-1">উত্তোলনের পরিমাণ (৳)</label>
                  <input 
                    type="number" 
                    required
                    min="100"
                    placeholder="সর্বনিম্ন ১০০ টাকা"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-bold block mb-1">বিকাশ পার্সোনাল নম্বর</label>
                  <input 
                    type="tel" 
                    required
                    placeholder="যেমন: ০১৭XXXXXXXX"
                    value={withdrawBkash}
                    onChange={(e) => setWithdrawBkash(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 dark:text-white"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={withdrawLoading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all mt-4"
                >
                  {withdrawLoading ? 'প্রক্রিয়াধীন...' : 'টাকা উত্তোলন অনুরোধ পাঠান'}
                </button>
              </div>
            )}
          </form>

          {/* Past withdrawal requests */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
            <h4 className="font-black text-slate-800 dark:text-white text-sm pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-teal-500" /> উত্তোলনের ইতিহাস (Withdrawal History)
            </h4>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {myWithdrawals.map((req, idx) => (
                <div key={req.id ? `withdraw-${req.id}-${idx}` : `withdraw-fallback-${idx}`} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white">৳ {req.amount}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">বিকাশ: {req.bkashNumber}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold block ${
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
              
              {myWithdrawals.length === 0 && (
                <div className="text-center py-6 text-slate-400 italic text-xs">
                  কোনো উত্তোলনের ইতিহাস পাওয়া যায়নি।
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-5 font-bn">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Settings size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">ব্যবসা প্রোফাইল সেটিংস</h4>
                <p className="text-[9px] text-slate-400 font-bold">এখানে আপনার ব্যবসা/দোকানের তথ্য পরিবর্তন করতে পারেন</p>
              </div>
            </div>

            {settingsSuccess && (
              <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/15 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>আপনার ব্যবসা প্রোফাইলের তথ্য সফলভাবে আপডেট করা হয়েছে!</span>
              </div>
            )}

            {settingsError && (
              <div className="bg-rose-500/10 text-rose-500 border border-rose-500/15 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{settingsError}</span>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">ব্যবসা/দোকানের নাম</label>
              <input 
                type="text" 
                required
                value={settingsBusinessName}
                onChange={(e) => setSettingsBusinessName(e.target.value)}
                placeholder="যেমন: সোনালী এন্টারপ্রাইজ"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">যোগাযোগের মোবাইল নম্বর</label>
              <input 
                type="tel" 
                required
                value={settingsPhone}
                onChange={(e) => setSettingsPhone(e.target.value)}
                placeholder="যেমন: ০১৭XXXXXXXX"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">দোকান/খামারের ঠিকানা</label>
              <input 
                type="text" 
                required
                value={settingsAddress}
                onChange={(e) => setSettingsAddress(e.target.value)}
                placeholder="যেমন: শ্রীপুর চৌরাস্তা, গাজীপুর"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-1.5">দোকানের জিপিএস লোকেশন (পিন)</label>
              <div className="flex gap-2.5 items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <MapPin size={18} className="text-amber-500 shrink-0" />
                <div className="flex-1 text-xs">
                  {settingsLocation ? (
                    <span className="text-slate-700 dark:text-slate-300 font-bold">ল্যাটিটিউড: {settingsLocation.lat.toFixed(5)}, লঙ্গিটিউড: {settingsLocation.lng.toFixed(5)}</span>
                  ) : (
                    <span className="text-slate-400">লোকেশন চিহ্নিত করা নেই</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsMapOpen(true)}
                  className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 px-3.5 py-1.5 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-200 active:scale-95 transition-all shrink-0"
                >
                  ম্যাপ থেকে চিহ্নিত করুন
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isSettingsSaving}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all text-xs flex items-center justify-center gap-2"
            >
              {isSettingsSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>সংরক্ষণ করা হচ্ছে...</span>
                </>
              ) : (
                <span>পরিবর্তনসমূহ সংরক্ষণ করুন</span>
              )}
            </button>
          </form>

          {isSettingsMapOpen && (
            <MapModal 
              isOpen={isSettingsMapOpen}
              onClose={() => setIsSettingsMapOpen(false)}
              onConfirm={handleSettingsMapConfirm}
              initialPosition={settingsLocation || { lat: 24.2000, lng: 90.4667 }}
            />
          )}
        </div>
      )}

      {/* Add Product Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 font-bn w-full max-w-md mx-auto">
          <div className="bg-white dark:bg-slate-900 w-full rounded-[2.5rem] overflow-hidden p-6 soft-shadow flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Store className="text-amber-500" size={20} /> নতুন পণ্য যুক্ত করুন
              </h3>
              <button 
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">পণ্যের নাম</label>
                <input 
                  type="text" 
                  required
                  placeholder="যেমন: বাড়ির খাঁটি গাভীর দুধ"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">বিবরণ</label>
                <textarea 
                  placeholder="পণ্যের গুণাগুণ ও বিস্তারিত লিখুন"
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 font-bold block mb-1">দাম (৳)</label>
                  <input 
                    type="number" 
                    required
                    placeholder="দাম দিন"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-bold block mb-1">স্টক পরিমাণ</label>
                  <input 
                    type="number" 
                    required
                    placeholder="পরিমাণ"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">বিভাগ</label>
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 dark:text-white font-bold"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.bn}</option>
                  ))}
                </select>
              </div>

              {/* Product Photo upload with fallback */}
              <div>
                <label className="text-xs text-slate-500 font-bold block mb-2">পণ্যের ছবি</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 rounded-xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                    {prodImagePreview ? (
                      <img src={prodImagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : '📷'}
                  </div>
                  <div className="flex-1">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageChange}
                      id="product-image-add-upload"
                      className="hidden" 
                    />
                    <label 
                      htmlFor="product-image-add-upload"
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                    >
                      ছবি নির্বাচন করুন
                    </label>
                  </div>
                </div>
              </div>

              {submitLoading && uploadProgress > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div style={{ width: `${uploadProgress}%` }} className="h-full bg-amber-500 transition-all" />
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={submitLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2"
              >
                {submitLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    যোগ হচ্ছে...
                  </>
                ) : 'পণ্য যোগ করুন'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
