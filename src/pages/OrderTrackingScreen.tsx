import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  MapPin, 
  Bike, 
  Clock, 
  CheckCircle2, 
  Phone, 
  ShoppingBag, 
  CreditCard,
  AlertCircle
} from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Order } from '../types';
import { cn } from '../lib/utils';

// Leaflet Icons
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

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

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [center, map]);
  return null;
}

interface OrderTrackingProps {
  orderId: string;
  onNavigate: (screen: any) => void;
  language: 'bn' | 'en';
}

export default function OrderTrackingScreen({ orderId, onNavigate, language }: OrderTrackingProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [riderProfile, setRiderProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Default focus coords
  const [mapCenter, setMapCenter] = useState<[number, number]>([24.2000, 90.4667]);

  useEffect(() => {
    if (!orderId) return;

    // Listen to order updates in real-time
    const unsubOrder = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) {
        const oData = { id: snap.id, ...snap.data() } as Order;
        setOrder(oData);
        setLoading(false);

        if (oData.buyerLocation) {
          setMapCenter([oData.buyerLocation.lat, oData.buyerLocation.lng]);
        }

        // If rider is assigned, fetch/subscribe to rider's real-time coords
        if (oData.riderId) {
          const unsubRider = onSnapshot(doc(db, 'users', oData.riderId), (rSnap) => {
            if (rSnap.exists()) {
              const rData = rSnap.data();
              setRiderProfile(rData);
              if (rData.lat && rData.lng) {
                // Focus map on rider position
                setMapCenter([rData.lat, rData.lng]);
              }
            }
          });
          return () => unsubRider();
        }
      }
    });

    return () => unsubOrder();
  }, [orderId]);

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

  if (!order) {
    return (
      <div className="p-6 text-center font-bn">
        <AlertCircle className="text-rose-500 w-12 h-12 mx-auto mb-4" />
        <p className="font-bold">অর্ডারটি পাওয়া যায়নি।</p>
        <button onClick={() => onNavigate('MARKETPLACE')} className="mt-4 text-primary font-bold">মার্কেটপ্লেসে ফিরে যান</button>
      </div>
    );
  }

  // Delivery Progress Stepper
  const STEPS = [
    { label: 'অর্ডার পেন্ডিং', desc: 'দোকানদার যাচাই করছেন', status: 'pending' },
    { label: 'অর্ডার গৃহিত', desc: 'রাইডার পণ্য নিতে যাচ্ছেন', status: 'accepted' },
    { label: 'পণ্য সংগৃহীত', desc: 'রাইডার আপনার ঠিকানার দিকে আসছেন', status: 'picked' },
    { label: 'ডেলিভার্ড সম্পন্ন', desc: 'পণ্য সফলভাবে বুঝিয়ে দেওয়া হয়েছে', status: 'delivered' }
  ];

  const getStepIndex = (status: string) => {
    if (status === 'pending') return 0;
    if (status === 'accepted') return 1;
    if (status === 'picked') return 2;
    if (status === 'delivered') return 3;
    return 0;
  };

  const currentStepIdx = getStepIndex(order.status);

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
          <h2 className="text-xl font-black text-slate-900 dark:text-white">অর্ডার ট্র্যাকিং (Live)</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Order ID: #{order.id.slice(-6).toUpperCase()}</p>
        </div>
      </div>

      {/* Map displaying live tracking */}
      <div className="rounded-[2.5rem] overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 h-72 mb-8 relative soft-shadow">
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

          {/* Seller / Pickup point */}
          {order.sellerLocation && (
            <Marker position={[order.sellerLocation.lat, order.sellerLocation.lng]} icon={ShopIcon}>
              <Popup>
                <div className="font-bn text-xs">
                  <strong className="text-amber-500">পিকআপ পয়েন্ট ({order.sellerName})</strong>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Buyer / Destination point */}
          {order.buyerLocation && (
            <Marker position={[order.buyerLocation.lat, order.buyerLocation.lng]} icon={BuyerIcon}>
              <Popup>
                <div className="font-bn text-xs">
                  <strong className="text-rose-500">আমার ঠিকানা (ডেলিভারি)</strong>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Rider real-time position if online and assigned */}
          {riderProfile && riderProfile.lat && riderProfile.lng && (order.status === 'accepted' || order.status === 'picked') && (
            <Marker position={[riderProfile.lat, riderProfile.lng]} icon={RiderIcon}>
              <Popup>
                <div className="font-bn text-xs">
                  <strong className="text-blue-500">ডেলিভারি রাইডার (লাইভ)</strong>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Order Progress Stepper */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow mb-8">
        <h3 className="text-sm font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <Clock size={16} className="text-amber-500" /> ডেলিভারি ট্র্যাকিং স্ট্যাটাস
        </h3>

        <div className="relative pl-6 space-y-6">
          {/* Progress vertical line */}
          <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-slate-100 dark:bg-slate-800">
            <div 
              style={{ height: `${(currentStepIdx / 3) * 100}%` }} 
              className="w-full bg-emerald-500 transition-all duration-500"
            />
          </div>

          {STEPS.map((step, idx) => {
            const isCompleted = idx <= currentStepIdx;
            const isActive = idx === currentStepIdx;

            return (
              <div key={idx} className="relative flex items-start gap-4">
                {/* Stepper Dot */}
                <div className={cn(
                  "absolute -left-5 w-5 h-5 rounded-full border-4 flex items-center justify-center transition-all",
                  isCompleted 
                    ? "bg-emerald-500 border-emerald-100 dark:border-emerald-900" 
                    : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
                )}>
                  {isCompleted && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>

                <div className="flex-1">
                  <h4 className={cn(
                    "text-xs font-bold",
                    isActive ? "text-emerald-500 font-black text-sm" : isCompleted ? "text-slate-800 dark:text-slate-200" : "text-slate-400"
                  )}>
                    {step.label}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rider details card */}
      {order.riderId && riderProfile ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-5 soft-shadow flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center">
              <Bike size={24} />
            </div>
            <div>
              <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider">ডেলিভারি রাইডার</span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">{order.riderName}</h4>
            </div>
          </div>
          {order.riderPhone && (
            <a 
              href={`tel:${order.riderPhone}`}
              className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-xl transition-all active:scale-95 flex items-center justify-center shadow-md shadow-blue-500/5"
            >
              <Phone size={18} />
            </a>
          )}
        </div>
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-[2rem] p-6 text-center text-xs font-bold text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-bounce" />
          <p>আপনার অর্ডারের জন্য রাইডার খোঁজা হচ্ছে... অনুগ্রহ করে একটু অপেক্ষা করুন।</p>
        </div>
      )}

      {/* Order Item details summary */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow mt-6 space-y-4">
        <h3 className="text-sm font-black text-slate-800 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <ShoppingBag size={16} className="text-amber-500" /> অর্ডার বিবরণী
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400">
            <span>পণ্য:</span>
            <span className="text-slate-800 dark:text-white">{order.productName} × {order.quantity}</span>
          </div>
          <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400">
            <span>ডেলিভারি চার্জ:</span>
            <span className="text-slate-800 dark:text-white">৳{order.deliveryCharge}</span>
          </div>
          <div className="flex justify-between font-black text-slate-800 dark:text-white pt-2 border-t border-dashed border-slate-100 dark:border-slate-800 text-sm">
            <span>মোট পরিশোধিত:</span>
            <span className="text-amber-500">৳{order.totalAmount} ({order.paymentMethod === 'wallet' ? 'ডিজিটাল ওয়ালেট' : 'ক্যাশ অন ডেলিভারি'})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
