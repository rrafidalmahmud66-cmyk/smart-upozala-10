import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, MapPin, Check, Loader2, Layers, Navigation } from 'lucide-react';
import { getCoordinates } from '../lib/utils';

// Fix Leaflet marker icon issues in React with a custom SVG DivIcon
import 'leaflet/dist/leaflet.css';

const customMarkerIcon = L.divIcon({
  html: `
    <div class="relative flex flex-col items-center">
      <div class="w-10 h-10 rounded-full bg-emerald-500/30 border-2 border-emerald-500 flex items-center justify-center shadow-xl animate-bounce">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="w-2.5 h-2.5 rounded-full bg-emerald-500/50 -mt-1 blur-[1px]"></div>
    </div>
  `,
  className: 'custom-leaflet-marker',
  iconSize: [40, 48],
  iconAnchor: [20, 44],
});

L.Marker.prototype.options.icon = customMarkerIcon;

const MapEvents = ({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
};

const RecenterMap = ({ position, isOpen }: { position: { lat: number, lng: number }, isOpen: boolean }) => {
  const map = useMap();
  useEffect(() => {
    if (map && isOpen) {
      const timer = setTimeout(() => {
        map.invalidateSize();
        map.setView([position.lat, position.lng], map.getZoom());
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [position, map, isOpen]);
  return null;
};

const MapModal = ({ isOpen, onClose, onConfirm, initialPosition, isViewOnly = false, title, subtitle }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm?: (pos: any) => void, 
  initialPosition: any, 
  isViewOnly?: boolean,
  title?: string,
  subtitle?: string
}) => {
  const [position, setPosition] = useState(() => getCoordinates(initialPosition) || { lat: 24.2000, lng: 90.4667 });
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (isOpen && initialPosition) {
      const coords = getCoordinates(initialPosition);
      setPosition(coords || { lat: 24.2000, lng: 90.4667 });
    }
  }, [isOpen, initialPosition]);

  useEffect(() => {
    if (isOpen && position) {
      reverseGeocode(position.lat, position.lng);
    }
  }, [isOpen, position]);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPosition({ lat, lng });
          setSearchError('');
        },
        (err) => {
          console.warn("Geolocation failed:", err);
          setSearchError("লোকেশন অ্যাক্সেস পাওয়া যায়নি। অনুগ্রহ করে ম্যানুয়ালি ম্যাপে ক্লিক করে বা সার্চ করে পিন করুন।");
        }
      );
    } else {
      setSearchError("আপনার ব্রাউজারে লোকেশন সার্ভিস সাপোর্ট করে না।");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      // Prioritize Bangladesh and Sreepur region in the search
      const query = `${searchQuery}, Sreepur, Gazipur, Bangladesh`;
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=3&accept-language=bn`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            setPosition({ lat, lng });
            return;
          }
        }
      }
      
      // Fallback: search without Sreepur suffix
      const responseFallback = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=3&accept-language=bn`);
      if (responseFallback.ok) {
        const data = await responseFallback.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lng)) {
            setPosition({ lat, lng });
            return;
          }
        }
      }
      
      setSearchError('স্থানটি খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।');
    } catch (err) {
      console.error('Search failed:', err);
      setSearchError('অনুসন্ধানে ত্রুটি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setSearching(false);
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    if (lat === undefined || lat === null || isNaN(lat) || lng === undefined || lng === null || isNaN(lng)) {
      setAddress('স্থানাঙ্ক পাওয়া যায়নি');
      return;
    }
    setLoading(true);
    try {
      // 1. Try Nominatim (OpenStreetMap)
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=bn`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.display_name) {
            setAddress(data.display_name);
            setLoading(false);
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
            setLoading(false);
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
        setAddress(`শ্রীপুর সংলগ্ন এলাকা (স্থানাঙ্ক: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    } catch (error) {
      console.error('All geocoding layers failed:', error);
      // Fallback to basic coordinates instead of generic failure string
      setAddress(`শ্রীপুর এলাকা (স্থানাঙ্ক: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  if (typeof window === 'undefined' || !window.document || !window.document.body) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 font-bn w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] overflow-hidden flex flex-col soft-shadow max-h-[90vh]">
        <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <MapPin size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  {title || (isViewOnly ? 'প্রোভাইডার লোকেশন' : 'লোকেশন নির্বাচন করুন')}
                </h3>
                <p className="text-xs text-muted">
                  {subtitle || (isViewOnly ? 'উদ্যোক্তার সঠিক অবস্থান' : 'সঠিক অবস্থান চিহ্নিত করুন')}
                </p>
              </div>
          </div>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search Bar for location search */}
        {!isViewOnly && (
          <div className="px-6 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="এলাকার নাম লিখে খুঁজুন (যেমন: মাওনা বা শ্রীপুর)"
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary dark:text-white"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center min-w-[70px] disabled:opacity-50"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : 'খুঁজুন'}
              </button>
            </div>
            {searchError && (
              <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                ⚠️ {searchError}
              </p>
            )}
          </div>
        )}

        <div className="flex-1 relative min-h-[400px]">
          <MapContainer 
            center={[position.lat, position.lng]} 
            zoom={15} 
            scrollWheelZoom={true}
            style={{ width: '100%', height: '400px', minHeight: '400px', zIndex: 1 }}
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
            
            <RecenterMap position={position} isOpen={isOpen} />
            {!isViewOnly && (
              <MapEvents 
                onMapClick={(latlng) => {
                  setPosition({ lat: latlng.lat, lng: latlng.lng });
                  setSearchError('');
                }} 
              />
            )}
            <Marker 
              position={[position.lat, position.lng]} 
              draggable={!isViewOnly}
              eventHandlers={{
                dragend: (e: any) => {
                  const marker = e.target;
                  if (marker != null) {
                    const latLng = marker.getLatLng();
                    setPosition({ lat: latLng.lat, lng: latLng.lng });
                    setSearchError('');
                  }
                }
              }}
            />
          </MapContainer>
          
          {!isViewOnly && (
            <button 
              type="button"
              onClick={handleGetCurrentLocation}
              className="absolute bottom-4 right-4 z-[999] bg-white dark:bg-slate-800 text-slate-800 dark:text-white p-3 rounded-2xl shadow-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center gap-1.5 font-bn text-xs font-bold"
              title="আমার বর্তমান অবস্থান"
            >
              <Navigation size={14} className="text-primary animate-pulse" />
              <span>আমার অবস্থান</span>
            </button>
          )}
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6 flex items-start gap-3">
              <MapPin className="text-primary mt-1 shrink-0" size={18} />
              <div className="flex-1 overflow-hidden">
                <span className="text-[10px] font-bold text-muted uppercase">বর্তমান ঠিকানা</span>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-bold leading-snug truncate-2-lines">
                  {loading ? 'লোড হচ্ছে...' : address}
                </p>
              </div>
          </div>
          {!isViewOnly && (
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onConfirm) {
                  onConfirm({ ...position, address });
                }
              }}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl shadow-xl shadow-primary/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Check size={20} /> লোকেশন নিশ্চিত করুন
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MapModal;
