import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Bike, 
  MapPin, 
  Navigation, 
  Phone, 
  CheckCircle2, 
  Coins, 
  Clock, 
  Compass, 
  Loader2, 
  AlertCircle,
  Play,
  Check,
  MessageCircle
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, getDoc, setDoc, runTransaction, getDocs } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Order } from '../types';
import { cn } from '../lib/utils';

function getWhatsAppUrl(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  const formatted = cleaned.startsWith('0') && cleaned.length === 11 ? '88' + cleaned : cleaned;
  return `https://wa.me/${formatted}`;
}

// Fix Leaflet marker icon issues in React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Marker icons for Map
const RiderIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const ShopIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const BuyerIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Helper component to center map on coordinates
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [center, map]);
  return null;
}

interface RiderDashboardProps {
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
}

export default function RiderDashboardScreen({ onNavigate, language }: RiderDashboardProps) {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Online/Offline status
  const [isOnline, setIsOnline] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<[number, number]>([24.2000, 90.4667]);
  const [selectedJob, setSelectedJob] = useState<Order | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([24.2000, 90.4667]);

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState<'jobs' | 'active' | 'earnings'>('jobs');

  // Withdrawal Requests
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBkash, setWithdrawBkash] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);

  // COD Cash Submissions (Rider returning cash to Admin)
  const [myCashSubmissions, setMyCashSubmissions] = useState<any[]>([]);
  const [codAmount, setCodAmount] = useState('');
  const [codBkash, setCodBkash] = useState('');
  const [codTxId, setCodTxId] = useState('');
  const [codLoading, setCodLoading] = useState(false);
  const [codSuccess, setCodSuccess] = useState(false);
  const [codError, setCodError] = useState<string | null>(null);

  const currentUser = auth.currentUser;
  const watchIdRef = useRef<number | null>(null);

  // Subscribe to user profile
  useEffect(() => {
    if (!currentUser) return;
    const unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const u = snap.data();
        setUserProfile(u);
        if (u.lat && u.lng) {
          setCurrentCoords([u.lat, u.lng]);
          setMapCenter([u.lat, u.lng]);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
    });
    return () => unsubProfile();
  }, [currentUser]);

  // Real-time GPS Tracker for Riders
  useEffect(() => {
    if (isOnline && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentCoords([latitude, longitude]);
          
          // Auto-recenter on rider only if not viewing a specific order
          setMapCenter((prev) => {
            if (!activeOrder && !selectedJob) {
              return [latitude, longitude];
            }
            return prev;
          });
          
          if (currentUser) {
            // Update rider's real-time position in Firestore
            await updateDoc(doc(db, 'users', currentUser.uid), {
              lat: latitude,
              lng: longitude,
              lastActive: new Date()
            });
          }
        },
        (err) => console.warn("GPS Tracking failed:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isOnline, currentUser, activeOrder, selectedJob]);

  // Recenter map on activeOrder seller location when activeOrder changes
  useEffect(() => {
    if (activeOrder && activeOrder.sellerLocation) {
      setMapCenter([activeOrder.sellerLocation.lat, activeOrder.sellerLocation.lng]);
    }
  }, [activeOrder?.id]);

  // Recenter map on selected available job when selectedJob changes
  useEffect(() => {
    if (selectedJob && selectedJob.sellerLocation) {
      setMapCenter([selectedJob.sellerLocation.lat, selectedJob.sellerLocation.lng]);
    }
  }, [selectedJob?.id]);

  // Fetch orders (available and active)
  useEffect(() => {
    if (!currentUser) return;

    // Available jobs query (accepted by seller, no rider assigned yet)
    const qAvailable = query(collection(db, 'orders'), where('status', '==', 'accepted'));
    const unsubAvailable = onSnapshot(qAvailable, (snap) => {
      const items: Order[] = [];
      snap.forEach(d => {
        const o = { id: d.id, ...d.data() } as Order;
        if (!o.riderId) {
          items.push(o);
        }
      });
      setAvailableOrders(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    // Active delivery job query (riderId is current, status is accepted or picked)
    const qActive = query(
      collection(db, 'orders'), 
      where('riderId', '==', currentUser.uid)
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
      let active: Order | null = null;
      snap.forEach(d => {
        const o = { id: d.id, ...d.data() } as Order;
        if (o.status === 'accepted' || o.status === 'picked') {
          active = o;
        }
      });
      setActiveOrder(active);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    // Subscribe to my withdrawal requests
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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'withdrawalRequests');
    });

    // Subscribe to my cash submissions (COD handover)
    const qSubmissions = query(
      collection(db, 'riderCashSubmissions'),
      where('riderId', '==', currentUser.uid)
    );
    const unsubSubmissions = onSnapshot(qSubmissions, (snap) => {
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
      setMyCashSubmissions(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'riderCashSubmissions');
    });

    return () => {
      unsubAvailable();
      unsubActive();
      unsubWithdrawals();
      unsubSubmissions();
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
                let updatedCodCashOwed: number | null = null;

                // 1. Settle Rider Balance
                if (riderRef) {
                  const riderSnap = await transaction.get(riderRef);
                  if (riderSnap.exists()) {
                    const currentRiderBalance = Number(riderSnap.data().riderBalance || 0);
                    const deliveryChargeVal = Number(order.deliveryCharge || 0);
                    updatedRiderBalance = currentRiderBalance + deliveryChargeVal;
                    if (order.paymentMethod === 'COD') {
                      const currentCodCashOwed = Number(riderSnap.data().codCashOwed || 0);
                      const totalOrderAmt = Number(order.totalAmount || 0);
                      let productVal = totalOrderAmt - deliveryChargeVal;
                      if (isNaN(productVal) || productVal <= 0) {
                        productVal = Number(order.productPrice || 0) * Number(order.quantity || 1);
                      }
                      if (isNaN(productVal) || productVal < 0) {
                        productVal = 0;
                      }
                      updatedCodCashOwed = currentCodCashOwed + productVal;
                    }
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

  // Handle Accept Delivery job
  const handleAcceptJob = async (orderId: string) => {
    if (!currentUser || !userProfile) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        riderId: currentUser.uid,
        riderName: currentUser.displayName || 'রাইডার',
        riderPhone: userProfile.phone || '',
        status: 'accepted' // Keep 'accepted' but assigned
      });
      setSelectedJob(null);
      setActiveTab('active');
    } catch (err) {
      console.error("Failed to accept delivery job:", err);
    }
  };

  // Update order delivery status
  const handleUpdateStatus = async (status: 'picked' | 'delivered') => {
    if (!activeOrder || !currentUser) return;

    try {
      if (status === 'delivered') {
        const orderRef = doc(db, 'orders', activeOrder.id);
        const riderRef = doc(db, 'users', currentUser.uid);
        let sellerId = activeOrder.sellerId;

        // If sellerId is missing on order, try to fetch it from the product
        if (!sellerId && activeOrder.productId) {
          const prodSnap = await getDoc(doc(db, 'products', activeOrder.productId));
          if (prodSnap.exists()) {
            sellerId = prodSnap.data().sellerId;
          }
        }

        const sellerRef = sellerId ? doc(db, 'users', sellerId) : null;

        await runTransaction(db, async (transaction) => {
          // 1. Read latest states
          const riderSnap = await transaction.get(riderRef);
          let sellerSnap = null;
          if (sellerRef) {
            sellerSnap = await transaction.get(sellerRef);
          }

          // 2. Calculations
          const currentRiderBalance = Number(riderSnap.exists() ? (riderSnap.data().riderBalance || 0) : 0);
          const deliveryChargeVal = Number(activeOrder.deliveryCharge || 0);
          const newRiderBalance = currentRiderBalance + deliveryChargeVal;

          const totalOrderAmt = Number(activeOrder.totalAmount || 0);
          let productVal = totalOrderAmt - deliveryChargeVal;
          if (isNaN(productVal) || productVal <= 0) {
            productVal = Number(activeOrder.productPrice || 0) * Number(activeOrder.quantity || 1);
          }
          if (isNaN(productVal) || productVal < 0) {
            productVal = 0;
          }

          // 3. Apply updates
          transaction.update(orderRef, {
            status: 'delivered',
            deliveredAt: new Date(),
            settled: true,
            settledAt: new Date()
          });

          transaction.update(riderRef, {
            riderBalance: isNaN(newRiderBalance) ? currentRiderBalance : newRiderBalance
          });

          if (sellerRef && sellerSnap && sellerSnap.exists()) {
            const currentSellerBalance = Number(sellerSnap.data().sellerBalance || 0);
            transaction.update(sellerRef, {
              sellerBalance: (isNaN(currentSellerBalance) ? 0 : currentSellerBalance) + productVal
            });
          }
        });
      } else {
        // picked
        await updateDoc(doc(db, 'orders', activeOrder.id), {
          status: 'picked'
        });
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Withdrawal Submit for Riders
  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentBalance = userProfile?.riderBalance || 0;
    const amount = parseFloat(withdrawAmount);

    if (!currentUser || !amount || !withdrawBkash) return;

    if (amount > currentBalance) {
      setWithdrawError(language === 'bn' ? 'আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই।' : 'Insufficient balance.');
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError(null);

    try {
      // Deduct immediately on submission for real-time consistency
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        riderBalance: Math.max(0, currentBalance - amount)
      });

      await addDoc(collection(db, 'withdrawalRequests'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'রাইডার',
        userType: 'rider',
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
      console.error("Rider withdrawal failed:", err);
      setWithdrawError(language === 'bn' ? 'অনুরোধ পাঠানো যায়নি। পরে চেষ্টা করুন।' : 'Failed to send request.');
    } finally {
      setWithdrawLoading(false);
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
            <h2 className="text-xl font-black text-slate-900 dark:text-white">রাইডার ড্যাশবোর্ড</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sreepur Rider Hub</p>
          </div>
        </div>

        {/* Online/Offline Toggle Button */}
        <button 
          onClick={() => setIsOnline(!isOnline)}
          className={cn(
            "px-4 py-2 rounded-full text-[10px] font-black transition-all flex items-center gap-1.5 shadow-md",
            isOnline 
              ? "bg-emerald-500 text-white shadow-emerald-500/10" 
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          )}
        >
          <span className={cn("w-2 h-2 rounded-full", isOnline ? "bg-white animate-pulse" : "bg-slate-400")} />
          {isOnline ? 'অনলাইন (Online)' : 'অফলাইন (Offline)'}
        </button>
      </div>

      {/* Map display for tracking */}
      <div className="rounded-[2rem] overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 h-72 mb-4 relative soft-shadow">
        <MapContainer 
          center={mapCenter} 
          zoom={14} 
          style={{ height: '100%', width: '100%', zIndex: 1 }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapRecenter center={mapCenter} />
          
          {/* Rider location marker */}
          <Marker position={currentCoords} icon={RiderIcon}>
            <Popup>
              <span className="font-bold">আমি (রাইডার)</span>
            </Popup>
          </Marker>

          {/* If there is an active delivery, show pickup and dropoff coordinates with pathways */}
          {activeOrder && activeOrder.sellerLocation && (
            <>
              <Marker position={[activeOrder.sellerLocation.lat, activeOrder.sellerLocation.lng]} icon={ShopIcon}>
                <Popup>
                  <div className="font-bn">
                    <span className="font-bold text-amber-500 block">পিকআপ পয়েন্ট (দোকান)</span>
                    <span className="text-xs">{activeOrder.sellerName}</span>
                  </div>
                </Popup>
              </Marker>
              
              {/* Route line: Rider to Seller Pickup */}
              <Polyline 
                positions={[currentCoords, [activeOrder.sellerLocation.lat, activeOrder.sellerLocation.lng]]} 
                color="#3b82f6" 
                dashArray="5, 8" 
                weight={3}
              />
            </>
          )}

          {activeOrder && activeOrder.buyerLocation && (
            <>
              <Marker position={[activeOrder.buyerLocation.lat, activeOrder.buyerLocation.lng]} icon={BuyerIcon}>
                <Popup>
                  <div className="font-bn">
                    <span className="font-bold text-rose-500 block">ডেলিভারি পয়েন্ট (ক্রেতা)</span>
                    <span className="text-xs">{activeOrder.buyerName}</span>
                  </div>
                </Popup>
              </Marker>

              {/* Route line: Seller Pickup to Buyer Dropoff */}
              {activeOrder.sellerLocation && (
                <Polyline 
                  positions={[
                    [activeOrder.sellerLocation.lat, activeOrder.sellerLocation.lng],
                    [activeOrder.buyerLocation.lat, activeOrder.buyerLocation.lng]
                  ]} 
                  color="#10b981" 
                  weight={4}
                />
              )}
            </>
          )}

          {/* If there is a selected available job (and no active order), show its pickup/dropoff on map */}
          {!activeOrder && selectedJob && selectedJob.sellerLocation && (
            <>
              <Marker position={[selectedJob.sellerLocation.lat, selectedJob.sellerLocation.lng]} icon={ShopIcon}>
                <Popup>
                  <div className="font-bn">
                    <span className="font-bold text-amber-500 block">পিকআপ পয়েন্ট (দোকান - কাজের ডাক)</span>
                    <span className="text-xs font-bold">{selectedJob.sellerName}</span>
                  </div>
                </Popup>
              </Marker>

              {/* Route line: Rider to Available Seller */}
              <Polyline 
                positions={[currentCoords, [selectedJob.sellerLocation.lat, selectedJob.sellerLocation.lng]]} 
                color="#3b82f6" 
                dashArray="5, 8" 
                weight={3}
              />
            </>
          )}

          {!activeOrder && selectedJob && selectedJob.buyerLocation && (
            <>
              <Marker position={[selectedJob.buyerLocation.lat, selectedJob.buyerLocation.lng]} icon={BuyerIcon}>
                <Popup>
                  <div className="font-bn">
                    <span className="font-bold text-rose-500 block">ডেলিভারি পয়েন্ট (ক্রেতা - কাজের ডাক)</span>
                    <span className="text-xs font-bold">{selectedJob.buyerName}</span>
                    <p className="text-[10px] text-slate-500 leading-tight mt-1">{selectedJob.buyerLocation.address}</p>
                  </div>
                </Popup>
              </Marker>

              {/* Route line: Seller to Buyer */}
              {selectedJob.sellerLocation && (
                <Polyline 
                  positions={[
                    [selectedJob.sellerLocation.lat, selectedJob.sellerLocation.lng],
                    [selectedJob.buyerLocation.lat, selectedJob.buyerLocation.lng]
                  ]} 
                  color="#10b981" 
                  weight={4}
                  dashArray="2, 5"
                />
              )}
            </>
          )}
        </MapContainer>
      </div>

      {/* Quick Map Navigation Controls & Legend */}
      <div className="flex flex-col gap-2.5 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setMapCenter(currentCoords)}
            className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 border border-blue-500/10"
          >
            <Navigation size={12} className="animate-pulse" /> আমার অবস্থান (Me)
          </button>

          {activeOrder && activeOrder.sellerLocation && (
            <button
              type="button"
              onClick={() => setMapCenter([activeOrder.sellerLocation.lat, activeOrder.sellerLocation.lng])}
              className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 border border-amber-500/10"
            >
              <MapPin size={12} className="text-amber-500" /> পিকআপ পয়েন্ট (Seller)
            </button>
          )}

          {activeOrder && activeOrder.buyerLocation && (
            <button
              type="button"
              onClick={() => setMapCenter([activeOrder.buyerLocation.lat, activeOrder.buyerLocation.lng])}
              className="flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 border border-rose-500/10"
            >
              <MapPin size={12} className="text-rose-500" /> ডেলিভারি পয়েন্ট (Buyer)
            </button>
          )}

          {!activeOrder && selectedJob && selectedJob.sellerLocation && (
            <button
              type="button"
              onClick={() => setMapCenter([selectedJob.sellerLocation.lat, selectedJob.sellerLocation.lng])}
              className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 border border-amber-500/10"
            >
              <MapPin size={12} className="text-amber-500" /> কাজের পিকআপ (Seller)
            </button>
          )}

          {!activeOrder && selectedJob && selectedJob.buyerLocation && (
            <button
              type="button"
              onClick={() => setMapCenter([selectedJob.buyerLocation.lat, selectedJob.buyerLocation.lng])}
              className="flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 px-3 py-1.5 rounded-full text-[10px] font-black transition-all shrink-0 border border-rose-500/10"
            >
              <MapPin size={12} className="text-rose-500" /> কাজের ডেলিভারি (Buyer)
            </button>
          )}
        </div>

        {/* Dynamic Map Legend info */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 p-3 rounded-2xl text-[10px] text-slate-500 dark:text-slate-400 font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            <span>আমি (Rider)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>বিক্রেতার দোকান (Pickup)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span>ক্রেতার অবস্থান (Dropoff)</span>
          </div>
          {(!activeOrder && selectedJob) && (
            <button 
              type="button"
              onClick={() => setSelectedJob(null)}
              className="ml-auto text-[9px] text-red-500 hover:underline hover:scale-105 active:scale-95 transition-all"
            >
              ম্যাপ ক্লিয়ার করুন (Clear)
            </button>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 mb-8">
        <button 
          onClick={() => setActiveTab('jobs')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'jobs'
              ? "border-blue-500 text-blue-500"
              : "border-transparent text-slate-400"
          )}
        >
          নতুন কাজের ডাক ({availableOrders.length})
        </button>
        <button 
          onClick={() => setActiveTab('active')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'active'
              ? "border-blue-500 text-blue-500"
              : "border-transparent text-slate-400"
          )}
        >
          চলতি ডেলিভারি
        </button>
        <button 
          onClick={() => setActiveTab('earnings')}
          className={cn(
            "flex-1 text-center py-4 font-bold text-xs border-b-2 transition-all",
            activeTab === 'earnings'
              ? "border-blue-500 text-blue-500"
              : "border-transparent text-slate-400"
          )}
        >
          ওয়ালেট ও আয়
        </button>
      </div>

      {/* Main lists */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="animate-spin text-blue-500" />
        </div>
      ) : activeTab === 'jobs' ? (
        !isOnline ? (
          <div className="py-12 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8">
            <Compass className="text-blue-500/20 w-16 h-16 mx-auto mb-4 animate-pulse" />
            <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">আপনি বর্তমানে অফলাইনে আছেন</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">নতুন কাজের ডাক বা অর্ডার নোটিফিকেশন পেতে উপরে ডান পাশের বাটন থেকে অনলাইন হোন।</p>
          </div>
        ) : availableOrders.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-slate-400">
            <Clock className="w-16 h-16 text-slate-300 mx-auto mb-3 animate-spin" />
            <p className="font-bold text-xs">শ্রীপুরে এই মুহূর্তে কোনো অর্ডার পেন্ডিং নেই। নতুন অর্ডারের জন্য অপেক্ষা করুন...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {availableOrders.map((o, idx) => (
              <div 
                key={o.id ? `available-order-${o.id}-${idx}` : `available-order-fallback-${idx}`}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 soft-shadow space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white text-sm">নতুন ডেলিভারি অনুরোধ</h4>
                    <p className="text-[9px] text-slate-400 block mt-1">পণ্য: {o.productName} ({o.quantity}টি)</p>
                  </div>
                  <span className="text-xs font-black text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 rounded-xl">৳{o.deliveryCharge}</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="leading-tight text-slate-600 dark:text-slate-400"><strong>পিকআপ (বিক্রেতা):</strong> {o.sellerName}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="leading-tight text-slate-600 dark:text-slate-400"><strong>ড্রপঅফ (ক্রেতা):</strong> {o.buyerLocation?.address}</p>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedJob(o);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={cn(
                      "flex-1 font-black py-3.5 rounded-2xl active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 border",
                      selectedJob?.id === o.id 
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" 
                        : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    )}
                  >
                    <Compass size={14} /> {selectedJob?.id === o.id ? 'ম্যাপে রয়েছে' : 'ম্যাপে দেখুন'}
                  </button>

                  <button 
                    onClick={() => handleAcceptJob(o.id)}
                    className="flex-[1.5] bg-blue-500 hover:bg-blue-600 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
                  >
                    <Play size={14} /> কাজ গ্রহণ করুন
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'active' ? (
        !activeOrder ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 text-slate-400">
            <Compass className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="font-bold text-xs">আপনার কোনো সক্রিয় ডেলিভারি নেই।</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 soft-shadow space-y-5">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] text-blue-500 font-bold uppercase block tracking-wider mb-1">চলতি ডেলিভারি কাজ</span>
                <h4 className="font-black text-slate-800 dark:text-white text-base">{activeOrder.productName} ({activeOrder.quantity}টি)</h4>
              </div>
              <span className="text-sm font-black text-blue-500">চার্জ: ৳{activeOrder.deliveryCharge}</span>
            </div>

            {/* Contacts & Locations */}
            <div className="space-y-4 text-xs">
              {/* Pickup Shop block */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2">
                <span className="text-[9px] text-amber-600 font-black uppercase tracking-wider block mb-1">ধাপ ১: পিকআপ করুন</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">দোকান: {activeOrder.sellerName}</p>
                {activeOrder.sellerPhone && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      <a href={`tel:${activeOrder.sellerPhone}`} className="text-amber-500 font-bold">{activeOrder.sellerPhone}</a>
                    </div>
                    <a
                      href={getWhatsAppUrl(activeOrder.sellerPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all w-max shadow-sm active:scale-95"
                    >
                      <MessageCircle size={12} /> WhatsApp এ যোগাযোগ করুন
                    </a>
                  </div>
                )}
                {activeOrder.sellerLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${activeOrder.sellerLocation.lat},${activeOrder.sellerLocation.lng}&travelmode=driving`;
                      window.open(url, '_blank');
                    }}
                    className="mt-1.5 flex items-center gap-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors w-max"
                  >
                    <Compass size={12} /> গুগল ম্যাপসে নেভিগেশন
                  </button>
                )}
              </div>

              {/* Delivery Buyer block */}
              <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 space-y-2">
                <span className="text-[9px] text-rose-600 font-black uppercase tracking-wider block mb-1">ধাপ ২: ক্রেতাকে দিন</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">ক্রেতা: {activeOrder.buyerName}</p>
                {activeOrder.buyerPhone && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      <a href={`tel:${activeOrder.buyerPhone}`} className="text-rose-500 font-bold">{activeOrder.buyerPhone}</a>
                    </div>
                    <a
                      href={getWhatsAppUrl(activeOrder.buyerPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all w-max shadow-sm active:scale-95"
                    >
                      <MessageCircle size={12} /> WhatsApp এ যোগাযোগ করুন
                    </a>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 leading-snug">ঠিকানা: {activeOrder.buyerLocation?.address}</p>
                {activeOrder.buyerLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${activeOrder.buyerLocation.lat},${activeOrder.buyerLocation.lng}&travelmode=driving`;
                      window.open(url, '_blank');
                    }}
                    className="mt-1.5 flex items-center gap-1.5 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors w-max"
                  >
                    <Compass size={12} /> গুগল ম্যাপসে নেভিগেশন
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2">
              {activeOrder.status === 'accepted' ? (
                <button 
                  onClick={() => handleUpdateStatus('picked')}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Check size={16} /> আমি দোকান থেকে পণ্য সংগ্রহ করেছি
                </button>
              ) : (
                <button 
                  onClick={() => handleUpdateStatus('delivered')}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> ডেলিভারি সম্পন্ন হয়েছে
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        /* Earnings Tab */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-2 opacity-95">রাইডার ওয়ালেট ব্যালেন্স</span>
            <span className="text-3xl font-black block mb-4">৳ {userProfile?.riderBalance?.toFixed(2) || '0.00'}</span>
            <p className="text-[10px] text-white/90 leading-relaxed max-w-xs">
              আপনার সফল হওয়া ডেলিভারির অর্জিত টাকা সরাসরি এখানে এসে জমা হবে। সেন্ড মানির মাধ্যমে ২৪ ঘণ্টায় তা উত্তোলন করা যাবে।
            </p>
          </div>

          {/* Withdrawal requests */}
          <form onSubmit={handleWithdrawalSubmit} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
            <h4 className="font-black text-slate-800 dark:text-white text-sm pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Coins size={18} className="text-blue-500" /> টাকা উত্তোলন করুন (Withdraw)
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={withdrawLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all mt-4"
                >
                  {withdrawLoading ? 'প্রক্রিয়াধীন...' : 'টাকা উত্তোলন অনুরোধ পাঠান'}
                </button>
              </div>
            )}
          </form>

          {/* Past withdrawal requests */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
            <h4 className="font-black text-slate-800 dark:text-white text-sm pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-indigo-500" /> উত্তোলনের ইতিহাস (Withdrawal History)
            </h4>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {myWithdrawals.map((req, idx) => (
                <div key={req.id ? `withdraw-rider-${req.id}-${idx}` : `withdraw-rider-fallback-${idx}`} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl flex justify-between items-center text-xs">
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
      )}
    </div>
  );
}
