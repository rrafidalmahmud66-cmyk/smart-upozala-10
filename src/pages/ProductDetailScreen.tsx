import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  MapPin, 
  CreditCard, 
  Truck, 
  Check, 
  Loader2, 
  AlertCircle, 
  Plus, 
  Minus,
  CheckCircle2,
  Phone,
  User,
  Navigation
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, updateDoc, onSnapshot } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { Product } from '../types';
import MapModal from '../components/MapModal';

// Haversine formula
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

interface ProductDetailProps {
  productId: string;
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
  setCurrentOrderId: (id: string) => void;
}

export default function ProductDetailScreen({ productId, onNavigate, language, setCurrentOrderId }: ProductDetailProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [buyerProfile, setBuyerProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'wallet'>('COD');
  
  // Locations
  const [buyerLocation, setBuyerLocation] = useState<{ lat: number, lng: number, address: string } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(30);

  // Modals
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const currentUser = auth.currentUser;

  // Fetch product and seller profile
  useEffect(() => {
    if (!productId) return;
    
    const unsubProduct = onSnapshot(doc(db, 'products', productId), async (snap) => {
      if (snap.exists()) {
        const pData = snap.data() as Product;
        setProduct({ id: snap.id, ...pData });
        
        // Load seller profile
        const sSnap = await getDoc(doc(db, 'users', pData.sellerId));
        if (sSnap.exists()) {
          setSellerProfile(sSnap.data());
        }
        setLoading(false);
      }
    });

    return () => unsubProduct();
  }, [productId]);

  // Fetch current user (buyer) profile
  useEffect(() => {
    if (!currentUser) return;
    const unsubBuyer = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const bData = snap.data();
        setBuyerProfile(bData);
        if (bData.lat && bData.lng && bData.address) {
          setBuyerLocation({ lat: bData.lat, lng: bData.lng, address: bData.address });
        }
      }
    });
    return () => unsubBuyer();
  }, [currentUser]);

  // Recalculate distance and delivery charge when buyer location changes
  useEffect(() => {
    if (product?.pickupLocation && buyerLocation) {
      const dist = calculateHaversineDistance(
        product.pickupLocation.lat,
        product.pickupLocation.lng,
        buyerLocation.lat,
        buyerLocation.lng
      );
      setDistance(dist);
      // Delivery charge: 10 TK per km, minimum 30 TK
      const calculatedCharge = Math.max(30, Math.round(dist * 10));
      setDeliveryCharge(calculatedCharge);
    }
  }, [product, buyerLocation]);

  // Attempt auto-capture of location
  const handleAutoCaptureLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          let addressText = `শ্রীপুর এলাকা (স্থানাঙ্ক: ${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          // Reverse geocode
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=bn`);
            const data = await res.json();
            if (data && data.display_name) {
              addressText = data.display_name;
            }
          } catch (e) {
            console.warn("Reverse geocode failed, using default fallback text");
          }

          setBuyerLocation({ lat, lng, address: addressText });

          // Save to user profile permanently so they don't have to pin/set it again on future checkouts
          if (currentUser) {
            try {
              await updateDoc(doc(db, 'users', currentUser.uid), {
                lat,
                lng,
                address: addressText,
                updatedAt: new Date()
              });
            } catch (err) {
              console.error("Failed to save auto-captured location to user profile:", err);
            }
          }
        },
        (error) => {
          console.warn("Geolocation permission blocked or failed, opening MapModal:", error);
          setIsMapOpen(true);
        }
      );
    } else {
      setIsMapOpen(true);
    }
  };

  const handleMapConfirm = async (coords: { lat: number, lng: number, address?: string }) => {
    const finalAddress = coords.address || `স্থানাঙ্ক: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    setBuyerLocation({
      lat: coords.lat,
      lng: coords.lng,
      address: finalAddress
    });
    setIsMapOpen(false);

    // Save to user profile permanently so they don't have to pin/set it again on future checkouts
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          lat: coords.lat,
          lng: coords.lng,
          address: finalAddress,
          updatedAt: new Date()
        });
      } catch (err) {
        console.error("Failed to save pinned location to user profile:", err);
      }
    }
  };

  const handlePlaceOrder = async () => {
    if (!currentUser || !product || !buyerLocation) return;
    
    const totalAmount = (product.price * quantity) + deliveryCharge;

    if (paymentMethod === 'wallet') {
      const currentBalance = buyerProfile?.walletBalance || 0;
      if (currentBalance < totalAmount) {
        setOrderError(language === 'bn' 
          ? `আপনার ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। মোট প্রয়োজন ৳${totalAmount}, কিন্তু আপনার আছে ৳${currentBalance.toFixed(2)}` 
          : `Insufficient wallet balance. Needed: ৳${totalAmount}, Available: ৳${currentBalance.toFixed(2)}`
        );
        return;
      }
    }

    setOrderLoading(true);
    setOrderError(null);

    try {
      // 1. If wallet payment, deduct balance
      if (paymentMethod === 'wallet') {
        const newBalance = buyerProfile.walletBalance - totalAmount;
        await updateDoc(doc(db, 'users', currentUser.uid), {
          walletBalance: newBalance
        });
      }

      // 2. Create Order Document
      const orderData = {
        buyerId: currentUser.uid,
        buyerName: currentUser.displayName || 'ক্রেতা',
        buyerPhone: buyerProfile?.phone || '',
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        sellerPhone: sellerProfile?.phone || '',
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        quantity,
        deliveryCharge,
        totalAmount,
        paymentMethod,
        sellerLocation: product.pickupLocation,
        buyerLocation: { lat: buyerLocation.lat, lng: buyerLocation.lng, address: buyerLocation.address },
        status: 'pending',
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      
      // Update stock if tracked
      if (product.stock !== undefined) {
        await updateDoc(doc(db, 'products', product.id), {
          stock: Math.max(0, product.stock - quantity)
        });
      }

      setCurrentOrderId(docRef.id);
      onNavigate('ORDER_TRACKING');
    } catch (err: any) {
      console.error("Order placement failed:", err);
      setOrderError(language === 'bn' ? 'অর্ডার সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।' : 'Failed to place order. Try again.');
    } finally {
      setOrderLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center font-bn">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full"
        />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6 text-center font-bn">
        <AlertCircle className="text-rose-500 w-12 h-12 mx-auto mb-4" />
        <p className="font-bold">পণ্যটি পাওয়া যায়নি।</p>
        <button onClick={() => onNavigate('MARKETPLACE')} className="mt-4 text-primary font-bold">মার্কেটপ্লেসে ফিরে যান</button>
      </div>
    );
  }

  const totalProductPrice = product.price * quantity;
  const totalBillAmount = totalProductPrice + deliveryCharge;

  return (
    <div className="p-6 pb-24 font-bn">
      {/* Top Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => onNavigate('MARKETPLACE')}
          className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">পণ্যের বিবরণ</h2>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Product Details & Delivery</p>
        </div>
      </div>

      {/* Main product card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] overflow-hidden soft-shadow mb-8">
        {/* Image */}
        <div className="relative h-64 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
          {product.imageUrl || product.imageBase64 ? (
            <img 
              src={product.imageUrl || product.imageBase64} 
              alt={product.name} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-6xl">🏪</div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-1">{product.name}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">বিক্রেতা: {product.sellerName}</p>
            </div>
            <span className="text-2xl font-black text-amber-500">৳{product.price}</span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl">
            {product.description}
          </p>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between py-4 border-t border-slate-100 dark:border-slate-800 mb-6">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">পরিমাণ (Quantity)</span>
            <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
              <button 
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <Minus size={16} />
              </button>
              <span className="font-black text-slate-800 dark:text-white w-6 text-center">{quantity}</span>
              <button 
                onClick={() => setQuantity(q => Math.min(product.stock || 10, q + 1))}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Delivery Location section */}
          <div className="border-t border-slate-100 dark:border-slate-800 py-6 mb-6">
            <h4 className="text-sm font-black text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <Truck size={18} className="text-amber-500" /> ডেলিভারি লোকেশন
            </h4>

            {buyerLocation ? (
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
                <MapPin className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">বর্তমান গন্তব্য</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-bold leading-normal line-clamp-2">
                    {buyerLocation.address}
                  </p>
                  {distance !== null && (
                    <span className="text-[10px] text-amber-500 font-bold block mt-1">
                      দূরত্ব: {distance.toFixed(2)} কিমি (চার্জ: ৳{deliveryCharge})
                    </span>
                  )}
                  <button 
                    onClick={() => setIsMapOpen(true)}
                    className="text-[10px] text-primary font-bold mt-2 hover:underline"
                  >
                    লোকেশন পরিবর্তন করুন
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleAutoCaptureLocation}
                className="w-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:bg-slate-50 dark:hover:bg-slate-800/20 text-center text-xs font-bold text-slate-500 flex flex-col items-center gap-2"
              >
                <Navigation size={24} className="text-amber-500 animate-pulse" />
                ডেলিভারি লোকেশন চিহ্নিত করতে চাপুন
              </button>
            )}
          </div>

          {/* Payment Method selector */}
          <div className="border-t border-slate-100 dark:border-slate-800 py-6 mb-6">
            <h4 className="text-sm font-black text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <CreditCard size={18} className="text-amber-500" /> পেমেন্ট পদ্ধতি
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={() => setPaymentMethod('COD')}
                className={cn(
                  "p-4 rounded-2xl border text-left flex flex-col justify-between h-24 transition-all duration-300",
                  paymentMethod === 'COD'
                    ? "border-amber-500 bg-amber-500/5 text-amber-600"
                    : "border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-xs">ক্যাশ অন ডেলিভারি</span>
                  {paymentMethod === 'COD' && <Check size={16} />}
                </div>
                <span className="text-[10px] text-slate-400">হাতে পেয়ে পরিশোধ</span>
              </button>

              <button 
                type="button"
                onClick={() => setPaymentMethod('wallet')}
                className={cn(
                  "p-4 rounded-2xl border text-left flex flex-col justify-between h-24 transition-all duration-300",
                  paymentMethod === 'wallet'
                    ? "border-amber-500 bg-amber-500/5 text-amber-600"
                    : "border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-xs">ডিজিটাল ওয়ালেট</span>
                  {paymentMethod === 'wallet' && <Check size={16} />}
                </div>
                <span className="text-[10px] text-slate-400">
                  ব্যালেন্স: ৳{buyerProfile?.walletBalance?.toFixed(2) || '0.00'}
                </span>
              </button>
            </div>
          </div>

          {/* Order Bill Summary */}
          <div className="border-t border-slate-100 dark:border-slate-800 py-6 space-y-2 mb-6">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span>পণ্যের দাম ({quantity}টি)</span>
              <span>৳{totalProductPrice}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span>ডেলিভারি চার্জ</span>
              <span>৳{deliveryCharge}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-800 dark:text-white font-black pt-2 border-t border-dashed border-slate-100 dark:border-slate-800">
              <span>মোট বিল</span>
              <span className="text-amber-500 text-base">৳{totalBillAmount}</span>
            </div>
          </div>

          {orderError && (
            <div className="bg-rose-500/10 text-rose-500 border border-rose-500/15 p-4 rounded-2xl text-xs font-bold flex items-start gap-2 mb-4">
              <AlertCircle className="shrink-0 mt-0.5" size={16} />
              <p className="leading-snug">{orderError}</p>
            </div>
          )}

          {/* Order Placement button */}
          <button 
            onClick={handlePlaceOrder}
            disabled={orderLoading || !buyerLocation}
            className="w-full bg-amber-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {orderLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                অর্ডার নিশ্চিত হচ্ছে...
              </>
            ) : !buyerLocation ? (
              'লোকেশন নিশ্চিত করুন'
            ) : (
              'অর্ডার নিশ্চিত করুন'
            )}
          </button>
        </div>
      </div>

      {/* Map modal for buyer delivery address selection */}
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
