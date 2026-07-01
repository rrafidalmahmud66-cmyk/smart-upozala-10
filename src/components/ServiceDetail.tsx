import { 
  Phone, 
  MessageCircle, 
  Facebook, 
  MapPin, 
  Clock, 
  User, 
  FileText, 
  Star, 
  Share2, 
  X,
  Navigation,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ArrowLeft,
  TrendingUp,
  Globe,
  MessageSquare,
  ShieldAlert
} from 'lucide-react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn, handleShare, getCoordinates } from '../lib/utils';
import { Language } from '../translations';
import { getDirectImageUrl, getCleanImageUrl, getSmartFallbackImage } from '../lib/image-utils';
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import AbuseReportModal from './AbuseReportModal';

// Fix for default marker icons in Leaflet
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Create a specialized icon for the main service
const PrimaryIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Provider {
  id: string;
  userId: string;
  name: string;
  contactPerson?: string;
  category: string;
  subCategory?: string;
  phone: string;
  whatsapp?: string;
  facebook?: string;
  website?: string;
  address: string;
  description: string;
  experience?: string;
  serviceCharge?: string;
  availableTime?: string;
  requiredDocuments?: string[];
  serviceArea?: string;
  image?: string;
  businessImage?: string;
  location?: { lat: number; lng: number };
  status: 'pending' | 'approved' | 'rejected';
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  createdAt: any;
}

const RecenterAndResizeMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    if (map) {
      const timer = setTimeout(() => {
        map.invalidateSize();
        map.setView([lat, lng], map.getZoom());
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [lat, lng, map]);
  return null;
};

interface ServiceDetailProps {
  service: Provider;
  language: Language;
  t: any;
  onBack: () => void;
  onReview: () => void;
  userLocation: { lat: number; lng: number } | null;
  allProviders: Provider[];
  onSelectProvider: (p: Provider) => void;
}

export default function ServiceDetail({ 
  service, 
  language, 
  t, 
  onBack, 
  onReview, 
  userLocation,
  allProviders,
  onSelectProvider 
}: ServiceDetailProps) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [service.id]);
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportTargetType, setReportTargetType] = useState<'user' | 'news' | 'review'>('user');
  const [reportTargetTitle, setReportTargetTitle] = useState('');
  const [reportTargetDetails, setReportTargetDetails] = useState('');

  const handleReportProvider = () => {
    setReportTargetId(service.id);
    setReportTargetType('user');
    setReportTargetTitle(service.name);
    setReportTargetDetails(service.description || '');
    setReportModalOpen(true);
  };

  const handleReportReview = (rev: any) => {
    setReportTargetId(rev.id);
    setReportTargetType('review');
    setReportTargetTitle(`${language === 'bn' ? 'রিভিউ বাই' : 'Review by'} ${rev.userName || 'User'}`);
    setReportTargetDetails(rev.comment || '');
    setReportModalOpen(true);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'reviews'), 
      where('providerId', '==', service.id),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [service.id]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const serviceCoords = getCoordinates(service.location) || getCoordinates(service) || { lat: 24.2000, lng: 90.4667 };
  const distance = userLocation && serviceCoords 
    ? calculateDistance(userLocation.lat, userLocation.lng, serviceCoords.lat, serviceCoords.lng)
    : null;

  const nearbyProviders = userLocation 
    ? allProviders
        .filter(p => {
          const pCoords = getCoordinates(p.location) || getCoordinates(p);
          return p.id !== service.id && pCoords;
        })
        .map(p => {
          const pCoords = (getCoordinates(p.location) || getCoordinates(p))!;
          return {
            ...p,
            distance: calculateDistance(userLocation.lat, userLocation.lng, pCoords.lat, pCoords.lng)
          };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)
    : [];

  const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');

  return createPortal(
    <motion.div 
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col font-bn w-full max-w-md mx-auto shadow-2xl overflow-hidden",
        isDark ? "dark bg-slate-950 text-white" : "bg-white text-slate-900"
      )}
    >
      {/* Immersive Cover Header */}
      <div className="relative h-72 sm:h-80 shrink-0">
        {!imageError ? (
          <img 
            src={getCleanImageUrl(service.image || service.businessImage, { id: service.id, title: service.name, category: service.category, subCategory: service.subCategory })} 
            alt={service.name} 
            onError={() => setImageError(true)}
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer" 
          />
        ) : (
          <img 
            src={getSmartFallbackImage({ id: service.id, title: service.name, category: service.category, subCategory: service.subCategory })} 
            alt={service.name} 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer" 
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
        
        {/* Floating Header Actions */}
        <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex items-center justify-between z-10">
          <button 
            onClick={onBack}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/20"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => handleShare({
                  title: service.name,
                  text: service.description,
                  url: service.website || window.location.href
                })}
                className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/20"
              >
               <Share2 size={20} />
             </button>
             <button 
                onClick={handleReportProvider}
                title={language === 'bn' ? 'রিপোর্ট করুন' : 'Report provider'}
                className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-rose-400 hover:text-rose-500 active:scale-90 transition-all hover:bg-white/20"
              >
               <ShieldAlert size={20} />
             </button>
          </div>
        </div>

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8 pt-20">
           <div className="flex items-center gap-2 mb-3">
              {service.isVerified && (
                <div className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-primary/30">
                  <CheckCircle2 size={12} />
                  {t.serviceHub.providerVerified}
                </div>
              )}
              {distance !== null && (
                <div className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20">
                   {distance.toFixed(1)} km {language === 'bn' ? 'দূরে' : 'Away'}
                </div>
              )}
           </div>
           <h1 className="text-3xl font-display font-bold text-white leading-tight mb-2 drop-shadow-md">
             {service.name}
           </h1>
           <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-amber-400">
                <Star size={16} fill="currentColor" />
                <span className="font-bold text-sm tracking-widest">{service.rating || 'New'}</span>
              </div>
              <span className="text-white/40 text-xs tracking-widest">•</span>
              <button 
                onClick={onReview}
                className="text-xs text-white/80 font-bold hover:text-white transition-colors"
              >
                {service.reviewCount || 0} {t.serviceHub.ratingCount}
              </button>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-32 pt-8 scrollbar-hide">
        <div className="space-y-10">
          {/* Action Buttons */}
          <div className={`grid gap-4 ${service.whatsapp ? "grid-cols-2" : "grid-cols-1"}`}>
            <motion.a 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href={`tel:${service.phone}`}
              className="flex flex-col items-center justify-center gap-3 py-6 bg-primary text-white rounded-[2.5rem] shadow-xl shadow-primary/20 transition-all border border-primary"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <Phone size={24} />
              </div>
              <span className="font-bold text-sm uppercase tracking-widest">{t.serviceHub.call}</span>
            </motion.a>
            {service.whatsapp && (
              <motion.a 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href={`https://wa.me/${service.whatsapp.startsWith('0') ? '88' + service.whatsapp : service.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center gap-3 py-6 bg-green-500 text-white rounded-[2.5rem] shadow-xl shadow-green-500/20 transition-all border border-green-400"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                  <MessageCircle size={24} />
                </div>
                <span className="font-bold text-sm uppercase tracking-widest">{t.serviceHub.whatsappBtn}</span>
              </motion.a>
            )}
          </div>

          {(service.facebook || service.website) && (
            <div className="flex flex-wrap gap-4">
               {service.facebook && (
                 <motion.a 
                   whileHover={{ x: 5 }}
                   href={service.facebook.startsWith('http') ? service.facebook : `https://${service.facebook}`} 
                   target="_blank" 
                   rel="noreferrer"
                   className="flex-1 flex items-center gap-4 p-4 bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 rounded-3xl border border-blue-600/20 group"
                 >
                   <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Facebook size={20} />
                   </div>
                   <span className="font-bold text-xs uppercase tracking-widest">Facebook</span>
                 </motion.a>
               )}
               {service.website && (
                 <motion.a 
                   whileHover={{ x: 5 }}
                   href={service.website.startsWith('http') ? service.website : `https://${service.website}`} 
                   target="_blank" 
                   rel="noreferrer"
                   className="flex-1 flex items-center gap-4 p-4 bg-slate-800/10 dark:bg-slate-300/10 text-slate-800 dark:text-slate-300 rounded-3xl border border-slate-800/20 dark:border-slate-300/20 group"
                 >
                   <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-300 text-white dark:text-slate-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Globe size={20} />
                   </div>
                   <span className="font-bold text-xs uppercase tracking-widest">Website</span>
                 </motion.a>
               )}
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex items-center gap-5">
              <div className="w-14 h-14 rounded-[1.8rem] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <User size={24} />
              </div>
              <div>
                <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">{t.serviceHub.contactPerson}</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight">{service.contactPerson || "Not specified"}</p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 flex items-center gap-5">
              <div className="w-14 h-14 rounded-[1.8rem] bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">{t.serviceHub.availableTime}</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight">{service.availableTime || "Not specified"}</p>
              </div>
            </div>
          </div>

          {/* Description Block */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 px-2 flex items-center gap-2">
               <FileText size={20} className="text-primary" />
               {t.serviceHub.description}
            </h3>
            <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform duration-1000">
                 <FileText size={120} />
              </div>
              <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed relative z-10">
                {service.description}
              </p>
            </div>
          </div>

          {/* Required Documents */}
          {service.requiredDocuments && service.requiredDocuments.length > 0 && (
            <div className="space-y-4 font-bn">
               <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 px-2 flex items-center gap-2">
                 <Calendar size={20} className="text-secondary" />
                 {t.serviceHub.documents}
               </h3>
               <div className="flex flex-wrap gap-3">
                {service.requiredDocuments.map((doc, idx) => (
                  <div key={`doc-${idx}-${doc}`} className="px-5 py-3 bg-white dark:bg-slate-900 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    {doc}
                  </div>
                ))}
               </div>
            </div>
          )}

          {/* Address & Live Map */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <MapPin size={20} className="text-rose-500" />
                {language === 'bn' ? 'ঠিকানা ও লোকেশন' : 'Address & Location'}
              </h3>
              {serviceCoords && (
                <a 
                  href={`https://www.google.com/maps?q=${serviceCoords.lat},${serviceCoords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary font-bold hover:underline underline-offset-4"
                >
                  {t.serviceHub.direction}
                </a>
              )}
            </div>
            
            <div className="p-3 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none overflow-hidden group">
              {(() => {
                const sCoords = serviceCoords;
                return sCoords ? (
                  <div className="h-72 w-full rounded-[2.5rem] overflow-hidden relative z-0 border border-slate-50 dark:border-slate-800 transition-transform group-hover:scale-[1.01] duration-500">
                      <MapContainer 
                        center={[sCoords.lat, sCoords.lng]} 
                        zoom={15} 
                        scrollWheelZoom={false}
                        className="h-full w-full"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <RecenterAndResizeMap lat={sCoords.lat} lng={sCoords.lng} />
                      
                        <Marker 
                          position={[sCoords.lat, sCoords.lng]}
                          icon={PrimaryIcon}
                        >
                          <Popup>
                            <div className="p-2 text-center font-bn">
                              <p className="font-bold text-sm text-primary mb-1">{service.name}</p>
                              <p className="text-[10px] text-slate-500 line-clamp-1">{service.address}</p>
                            </div>
                          </Popup>
                        </Marker>

                        {allProviders
                          .filter(p => {
                            const pCoords = getCoordinates(p.location);
                            return p.id !== service.id && pCoords && p.category === service.category;
                          })
                          .map((p, idx) => {
                            const pCoords = getCoordinates(p.location)!;
                            return (
                              <Marker 
                                key={`${p.id}-${idx}`} 
                                position={[pCoords.lat, pCoords.lng]}
                              >
                                <Popup>
                                  <div className="p-3 min-w-[160px] text-center font-bn">
                                    <h4 className="font-bold text-sm text-slate-800 mb-1">{p.name}</h4>
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-amber-500 mb-3">
                                      <Star size={10} fill="currentColor" />
                                      <span>{p.rating || 'New'}</span>
                                    </div>
                                    <button 
                                      onClick={() => onSelectProvider(p)}
                                      className="w-full py-2 bg-primary text-white text-[10px] font-bold rounded-xl shadow-lg shadow-primary/20"
                                    >
                                      {language === 'bn' ? 'বিস্তারিত দেখুন' : 'View Details'}
                                    </button>
                                  </div>
                                </Popup>
                              </Marker>
                            );
                          })
                        }
                      </MapContainer>
                  </div>
                ) : (
                  <div className="h-72 bg-slate-50 dark:bg-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 gap-4">
                    <MapPin size={48} strokeWidth={1} className="opacity-20 translate-y-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">{language === 'bn' ? 'ম্যাপ লোকেশন নেই' : 'No Location Data'}</p>
                  </div>
                );
              })()}
              
              <div className="p-6 pt-4 text-center">
                <p className="text-base text-slate-600 dark:text-slate-400 font-bn leading-relaxed max-w-[80%] mx-auto">{service.address}</p>
              </div>
            </div>
          </div>

          {/* Reviews Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <MessageSquare size={20} className="text-primary" />
                {language === 'bn' ? 'রিভিউ ও রেটিংসমূহ' : 'Reviews & Ratings'}
              </h3>
              <span className="text-xs font-bold text-slate-400">({reviews.length})</span>
            </div>

            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((rev, idx) => (
                  <div key={`${rev.id}-${idx}`} className="p-5 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {rev.userName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{rev.userName || (language === 'bn' ? 'ব্যবহারকারী' : 'User')}</p>
                          <p className="text-[10px] text-muted">
                            {rev.createdAt?.toDate().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full">
                          <Star size={12} fill="currentColor" />
                          <span className="text-xs font-bold">{rev.rating}</span>
                        </div>
                        <button
                          onClick={() => handleReportReview(rev)}
                          title={language === 'bn' ? 'রিভিউ রিপোর্ট করুন' : 'Report review'}
                          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                        >
                          <ShieldAlert size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-bn leading-relaxed">
                      {rev.comment}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800">
                <MessageSquare size={32} className="opacity-20 mb-3" />
                <p className="text-xs font-bold uppercase tracking-widest">{language === 'bn' ? 'কোন রিভিউ নেই' : 'No Reviews Yet'}</p>
              </div>
            )}
          </div>

          {/* Recommended Nearby Section */}
          {nearbyProviders.length > 0 && (
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <TrendingUp size={20} className="text-primary" />
                  {language === 'bn' ? 'আপনার পাশের সার্ভিসসমূহ' : 'Services Near You'}
                </h3>
              </div>
              <div className="flex gap-5 overflow-x-auto scrollbar-hide pb-6 -mx-6 px-6">
                {nearbyProviders.map((p, idx) => (
                  <NearbyProviderCard key={`${p.id}-${idx}`} p={p} onSelectProvider={onSelectProvider} />
                ))}
                {false && [].map((p: any, idx) => (
                  <motion.div
                    key={`${p.id}-${idx}`}
                    whileHover={{ y: -8 }}
                    onClick={() => onSelectProvider(p)}
                    className="min-w-[180px] max-w-[180px] bg-white dark:bg-slate-900 p-4 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none cursor-pointer group"
                  >
                    <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 bg-slate-50 dark:bg-slate-800 relative">
                      {p.image || p.businessImage ? (
                        <img 
                          src={getCleanImageUrl(p.image || p.businessImage, { id: p.id, title: p.name, category: 'business' })} 
                          alt="" 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                           <Star size={32} strokeWidth={1} />
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-primary text-white text-[9px] font-bold rounded-lg shadow-lg">
                        {p.distance.toFixed(1)} km
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate mb-1">{p.name}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500">
                      <Star size={12} fill="currentColor" />
                      {p.rating || 'New'}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Dynamic Floating Action Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pt-4 pb-10 bg-gradient-to-t from-white dark:from-slate-950 via-white/95 dark:via-slate-950/95 to-transparent z-[110] flex justify-center">
         <motion.button 
           whileHover={{ scale: 1.05 }}
           whileTap={{ scale: 0.95 }}
           onClick={onReview}
           className="w-full max-w-xs py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2.5rem] font-bold shadow-2xl shadow-slate-400/50 dark:shadow-none flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
         >
           <Star size={22} className="text-amber-400" fill="currentColor" />
           <span className="text-lg font-bn">{language === 'bn' ? 'রিভিউ ও রেটিং দিন' : 'Rate this Service'}</span>
         </motion.button>
      </div>

      {/* Decorative Blur Elements */}
      <div className="absolute top-1/2 left-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none -translate-x-20" />
      <div className="absolute top-1/4 right-0 w-48 h-48 bg-secondary/5 rounded-full blur-3xl pointer-events-none translate-x-20" />

      <AbuseReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        reportedId={reportTargetId}
        reportedType={reportTargetType}
        reportedTitle={reportTargetTitle}
        reportedDetails={reportTargetDetails}
        language={language}
      />
    </motion.div>,
    document.body
  );
}

function NearbyProviderCard({ p, onSelectProvider }: { p: any, onSelectProvider: any }) {
  const [imgError, setImgError] = useState(false);
  return (
    <motion.div
      whileHover={{ y: -8 }}
      onClick={() => onSelectProvider(p)}
      className="min-w-[180px] max-w-[180px] bg-white dark:bg-slate-900 p-4 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none cursor-pointer group"
    >
      <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 bg-slate-50 dark:bg-slate-800 relative">
        {!imgError ? (
          <img 
            src={getCleanImageUrl(p.image || p.businessImage, { id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
            alt="" 
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <img 
            src={getSmartFallbackImage({ id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
            alt="" 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-primary text-white text-[9px] font-bold rounded-lg shadow-lg">
          {p.distance.toFixed(1)} km
        </div>
      </div>
      <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate mb-1">{p.name}</h4>
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500">
        <Star size={12} fill="currentColor" />
        {p.rating || 'New'}
      </div>
    </motion.div>
  );
}
