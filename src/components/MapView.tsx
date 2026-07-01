import React, { useState, useEffect, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { ServiceItem } from '../types';
import { Crosshair, MapPin, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MapViewProps {
  services: ServiceItem[];
  onSelectService: (service: ServiceItem) => void;
  userLocation?: [number, number] | null;
}

const SREEPUR_CENTER = { lat: 24.2000, lng: 90.4667 };

export default function MapView({ services, onSelectService, userLocation: externalUserLocation, language = 'bn' }: MapViewProps & { language?: 'en' | 'bn' }) {
  const [selectedPreview, setSelectedPreview] = useState<ServiceItem | null>(null);
  const [mapCenter, setMapCenter] = useState(SREEPUR_CENTER);

  useEffect(() => {
    if (externalUserLocation) {
      setMapCenter({ lat: externalUserLocation[0], lng: externalUserLocation[1] });
    }
  }, [externalUserLocation]);

  const servicesWithCoords = services.map((s, i) => ({
    ...s,
    lat: s.lat || SREEPUR_CENTER.lat + (Math.sin(i * 123.456) * 0.02),
    lng: s.lng || SREEPUR_CENTER.lng + (Math.cos(i * 987.654) * 0.02)
  }));

  if (!hasValidKey) {
    return (
      <div className="h-[600px] w-full rounded-[2.5rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-center p-8 border-4 border-white dark:border-slate-800 font-bn">
        <div>
           <MapPin className="mx-auto mb-4 text-slate-400" size={48} />
           <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Google Maps API Key Required</h3>
           <p className="text-sm text-slate-500">ম্যাপ দেখার জন্য এপিআই কি প্রয়োজন। অনুগ্রহ করে আপনার এপিআই কি যোগ করুন।</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full rounded-[2.5rem] overflow-hidden soft-shadow border-4 border-white dark:border-slate-800 z-0 relative">
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={SREEPUR_CENTER}
          defaultZoom={13}
          center={mapCenter}
          onCenterChanged={e => setMapCenter(e.detail.center)}
          mapId="SREEPUR_EXPLORE_MAP"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          disableDefaultUI={true}
          zoomControl={true}
        >
          {externalUserLocation && (
            <AdvancedMarker position={{ lat: externalUserLocation[0], lng: externalUserLocation[1] }}>
               <Pin background="#4285F4" glyphColor="#fff" />
            </AdvancedMarker>
          )}

          {servicesWithCoords.map((service, idx) => (
            <AdvancedMarker 
                key={`${service.id}-${idx}`} 
                position={{ lat: service.lat, lng: service.lng }}
                onClick={() => setSelectedPreview(service)}
            >
              <div 
                className="w-10 h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: service.color }}
              >
                {typeof service.icon === 'string' ? (
                  <span className="text-lg">{service.icon}</span>
                ) : (
                  <service.icon size={18} />
                )}
              </div>
            </AdvancedMarker>
          ))}
        </Map>

        {/* Custom Actions */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
           <button 
             onClick={() => setMapCenter(SREEPUR_CENTER)}
             className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex items-center justify-center text-primary border border-slate-100 dark:border-slate-800 active:scale-90 transition-all"
           >
             <MapPin size={24} />
           </button>
           <button 
             onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(pos => {
                    setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  });
                }
             }}
             className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex items-center justify-center text-emerald-500 border border-slate-100 dark:border-slate-800 active:scale-90 transition-all"
           >
             <Crosshair size={24} />
           </button>
        </div>
      </APIProvider>

      {/* Floating Preview Card */}
      <AnimatePresence>
        {selectedPreview && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 z-[1001] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-3 sm:p-5 shadow-2xl border border-white/20 flex items-center gap-2 sm:gap-4"
          >
            <div 
              className="w-11 h-11 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-md"
              style={{ backgroundColor: selectedPreview.color, color: '#fff' }}
            >
              {typeof selectedPreview.icon === 'string' ? (
                <span className="text-xl sm:text-3xl">{selectedPreview.icon}</span>
              ) : (
                <selectedPreview.icon className="w-5 h-5 sm:w-8 sm:h-8" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 sm:gap-2 mb-0.5">
                 <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
                   {selectedPreview.category}
                 </span>
              </div>
              <h4 className="font-bn font-bold text-slate-800 dark:text-white text-xs sm:text-lg line-clamp-2 leading-tight sm:leading-snug">
                {language === 'en' ? selectedPreview.name : selectedPreview.bnName}
              </h4>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button 
                onClick={() => onSelectService(selectedPreview)}
                className="bg-primary text-white px-3 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl font-bn font-bold text-[11px] sm:text-sm shadow-lg shadow-primary/10 flex items-center gap-1 hover:bg-opacity-95 active:scale-95 transition-all outline-none"
              >
                <span>{language === 'bn' ? 'বিস্তারিত' : 'Detail'}</span>
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              
              <button 
                onClick={() => setSelectedPreview(null)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-200/50 dark:bg-slate-800 text-slate-500 flex items-center justify-center active:scale-95 transition-all outline-none hover:bg-slate-200"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
