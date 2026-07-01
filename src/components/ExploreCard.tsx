import { useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, Phone, ArrowRight, Star } from 'lucide-react';
import { ExploreItem } from '../data/exploreData';
import { getSmartFallbackImage, getCleanImageUrl, getDynamicServiceGradient } from '../lib/image-utils';

interface ExploreCardProps {
  item: ExploreItem;
  onClick: (item: ExploreItem) => void;
  language?: 'bn' | 'en';
}

const enToBn = (str: string) => {
  if (!str) return '';
  const digits: any = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  return str.replace(/[0-9]/g, (w) => digits[w]);
};

export default function ExploreCard({ item, onClick, language = 'bn' }: ExploreCardProps) {
  const [imageError, setImageError] = useState(false);
  const title = language === 'bn' ? item.bengaliTitle : item.title;
  
  const fallbackImage = getSmartFallbackImage(item);
  const itemImage = item.image || (item as any).imageUrl || (item as any).image_url || (item as any).businessImage;

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => onClick(item)}
      className="group relative bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-800"
    >
      {/* Featured Badge */}
      {item.featured && (
        <div className="absolute top-3 right-3 z-10 bg-amber-400 text-white p-1.5 rounded-xl shadow-lg ring-2 ring-white/50">
          <Star size={14} fill="currentColor" />
        </div>
      )}

      {/* Emergency Badge */}
      {item.emergency && (
        <div className="absolute top-3 left-3 z-10 bg-rose-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
          SOS
        </div>
      )}

      <div className="aspect-[16/9] w-full relative overflow-hidden bg-slate-100 dark:bg-slate-950">
        {!imageError ? (
          <img 
            src={getCleanImageUrl(itemImage, item)} 
            alt={title}
            onError={handleImageError}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-900">
            {/* Elegant computer workspace background image from Unsplash */}
            <img 
              src="https://images.unsplash.com/photo-1496181130204-755241544ee0?auto=format&fit=crop&q=80&w=800"
              alt="Computer training workspace"
              className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay scale-100 group-hover:scale-105 transition-transform duration-[4000ms]"
              referrerPolicy="no-referrer"
            />
            {/* Stylish fallback category-colored mesh gradient blend */}
            <div 
              className="absolute inset-0 opacity-40 mix-blend-multiply"
              style={{ background: getDynamicServiceGradient((item as any).color || '#3b82f6', item.id) }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <span className="text-[10px] font-bn font-black tracking-widest text-primary bg-primary/10 border border-primary/25 rounded-md px-2 py-0.5 mb-2 backdrop-blur-md">
                {item.subCategory || 'সেবা তথ্য'}
              </span>
              <h4 className="text-white font-bn font-black text-sm text-center drop-shadow-md px-4 line-clamp-1">
                {title}
              </h4>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none" />
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md">
            {item.subCategory}
          </span>
        </div>
        
        <h3 className="text-xl font-bn font-black text-slate-800 dark:text-white mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <p className="text-xs font-bn text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 leading-relaxed">
          {item.shortDescription}
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-slate-400">
            <MapPin size={14} className="shrink-0" />
            <span className="text-[11px] font-bn line-clamp-1">{item.address}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Phone size={14} className="shrink-0" />
            <span className="text-[11px] font-sans font-bold">{language === 'bn' ? enToBn(item.contactNumber) : item.contactNumber}</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[10px] font-bn font-bold text-slate-400 italic">
            {item.openingHours}
          </span>
          <button className="flex items-center gap-1.5 text-primary text-sm font-bn font-black group/btn">
            <span>বিস্তারিত</span>
            <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
