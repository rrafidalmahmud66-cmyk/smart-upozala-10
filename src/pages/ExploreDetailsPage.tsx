import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Globe, 
  Clock, 
  Share2, 
  Copy, 
  ExternalLink, 
  PhoneCall,
  Map as MapIcon,
  CircleCheck,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { ExploreItem } from '../data/exploreData';
import { handleShare, cn } from '../lib/utils';
import { getSmartFallbackImage, getCleanImageUrl, getDynamicServiceGradient } from '../lib/image-utils';

interface ExploreDetailsPageProps {
  item: ExploreItem;
  onBack: () => void;
  language?: 'bn' | 'en';
}

const enToBn = (str: string) => {
  if (!str) return '';
  const digits: any = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  return str.replace(/[0-9]/g, (w) => digits[w]);
};

export default function ExploreDetailsPage({ item, onBack, language = 'bn' }: ExploreDetailsPageProps) {
  const [imageError, setImageError] = useState(false);
  const title = language === 'bn' ? item.bengaliTitle : item.title;

  const fallbackImage = getSmartFallbackImage(item);
  const itemImage = item.image || (item as any).imageUrl || (item as any).image_url || (item as any).businessImage;

  const handleImageError = () => {
    setImageError(true);
  };

  const handleCall = () => {
    window.location.href = `tel:${item.contactNumber}`;
  };

  const handleMap = () => {
    window.open(item.mapLink || `https://www.google.com/maps?q=${item.latitude},${item.longitude}`, "_blank");
  };

  const handleWebsite = () => {
    if (item.website) window.open(item.website, "_blank");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(item.contactNumber);
    alert(language === 'bn' ? 'নম্বরটি কপি করা হয়েছে!' : 'Number copied!');
  };

  return (
    <div className="pb-24 min-h-screen bg-white dark:bg-slate-950">
      {/* Header Image Section */}
      <div className="relative h-72 sm:h-96 bg-slate-955">
        {!imageError ? (
          <img 
            src={getCleanImageUrl(itemImage, item)} 
            alt={title}
            onError={handleImageError}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-900">
            {/* Elegant computer workspace background image from Unsplash */}
            <img 
              src="https://images.unsplash.com/photo-1496181130204-755241544ee0?auto=format&fit=crop&q=80&w=1200"
              alt="Computer training workspace background"
              className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-overlay"
              referrerPolicy="no-referrer"
            />
            {/* Dynamic category colored mesh gradient */}
            <div 
              className="absolute inset-0 opacity-40 mix-blend-multiply"
              style={{ background: getDynamicServiceGradient((item as any).color || '#3b82f6', item.id) }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-950 via-black/20 to-transparent pointer-events-none" />
        
        <button 
          onClick={onBack}
          className="absolute top-10 left-6 w-11 h-11 rounded-2xl bg-white/30 backdrop-blur-md border border-white/40 flex items-center justify-center text-white shadow-xl z-20"
        >
          <ArrowLeft size={22} />
        </button>

        <div className="absolute bottom-12 left-6 right-6 z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">
                {item.category}
              </span>
              {item.featured && (
                <span className="px-3 py-1 bg-amber-400 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg flex items-center gap-1">
                  <Sparkles size={10} />
                  {language === 'bn' ? 'টপ রেটেড' : 'Top Rated'}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bn font-black text-white drop-shadow-md leading-tight break-words">
              {title}
            </h1>
          </motion.div>
        </div>
      </div>

      {/* Action Quick Bar */}
      <div className="px-6 -mt-8 relative z-20">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-4 flex items-center justify-around border border-slate-100 dark:border-slate-800">
           <ActionButton icon={PhoneCall} label={language === 'bn' ? "কল দিন" : "Call"} onClick={handleCall} color="text-emerald-500 bg-emerald-500/10" />
           <ActionButton icon={MapIcon} label={language === 'bn' ? "ম্যাপ" : "Map"} onClick={handleMap} color="text-blue-500 bg-blue-500/10" />
           <ActionButton icon={Globe} label={language === 'bn' ? "ওয়েবসাইট" : "Web"} onClick={handleWebsite} color="text-indigo-500 bg-indigo-500/10" disabled={!item.website} />
           <ActionButton icon={Share2} label={language === 'bn' ? "শেয়ার" : "Share"} onClick={() => handleShare({ title, text: item.shortDescription, url: window.location.href })} color="text-rose-500 bg-rose-500/10" />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 mt-10 space-y-10">
        {/* Description */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles size={18} />
            <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">{language === 'bn' ? 'বিস্তারিত তথ্য' : 'Information'}</h3>
          </div>
          <div className="p-6 rounded-[2.5rem] bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <p className="text-lg font-bn text-slate-700 dark:text-slate-200 leading-relaxed">
              {item.fullDescription}
            </p>
          </div>
        </section>

        {/* Contact Info Card */}
        <section className="space-y-6">
           <div className="grid grid-cols-1 gap-4">
              <InfoItem icon={MapPin} label={language === 'bn' ? 'ঠিকানা' : 'Address'} value={item.address} color="rose" />
              <InfoItem icon={Phone} label={language === 'bn' ? 'ফোন নম্বর' : 'Phone'} value={language === 'bn' ? enToBn(item.contactNumber) : item.contactNumber} color="emerald" extraAction={handleCopy} />
              {item.hotline && <InfoItem icon={PhoneCall} label={language === 'bn' ? 'জরুরি হটলাইন' : 'Hotline'} value={language === 'bn' ? enToBn(item.hotline) : item.hotline} color="amber" />}
              <InfoItem icon={Clock} label={language === 'bn' ? 'অফিস সময়' : 'Hours'} value={item.openingHours} color="indigo" />
           </div>
        </section>

        {/* Required Documents Section */}
        {item.requiredDocuments && item.requiredDocuments.length > 0 && (
          <section className="space-y-4">
             <div className="flex items-center gap-2 text-rose-500">
               <ShieldCheck size={18} />
               <h3 className="text-[12px] font-black uppercase tracking-[0.2em]">{language === 'bn' ? 'প্রয়োজনীয় কাগজপত্র' : 'Required Documents'}</h3>
             </div>
             <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-[2rem] p-6">
                <ul className="space-y-3">
                   {item.requiredDocuments.map((doc, idx) => (
                     <li key={idx} className="flex items-start gap-3 text-slate-700 dark:text-slate-300 font-bn">
                        <CircleCheck size={18} className="text-rose-500 shrink-0 mt-0.5" />
                        <span>{doc}</span>
                     </li>
                   ))}
                </ul>
             </div>
          </section>
        )}

        {/* Verification Badge */}
        <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ShieldCheck size={28} />
           </div>
           <div>
              <h4 className="text-sm font-bn font-black text-emerald-800 dark:text-emerald-400">সরকারি ভেরিফাইড তথ্য</h4>
              <p className="text-xs font-bn text-emerald-600/70">এই তথ্যটি উপজেলা ডিজিটাল সেন্টার দ্বারা যাচাইকৃত।</p>
           </div>
        </div>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4">
            {Array.from(new Set(item.tags)).map((tag, idx) => (
              <span key={`${tag}-${idx}`} className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, color, disabled = false }: any) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.9 } : {}}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2",
        disabled && "opacity-30 grayscale"
      )}
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-all", color)}>
        <Icon size={24} />
      </div>
      <span className="text-[10px] font-bn font-black uppercase tracking-widest opacity-60">{label}</span>
    </motion.button>
  );
}

function InfoItem({ icon: Icon, label, value, color, extraAction }: any) {
  const colorMap: any = {
    rose: "bg-rose-500/10 text-rose-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
    indigo: "bg-indigo-500/10 text-indigo-500",
  };

  return (
    <div className="flex items-start gap-4 p-5 bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-50 dark:border-slate-800 group transition-all hover:shadow-md hover:border-slate-200">
       <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", colorMap[color])}>
          <Icon size={22} />
       </div>
       <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
          <p className="text-lg font-bn font-bold text-slate-800 dark:text-slate-200 leading-snug">{value}</p>
       </div>
       {extraAction && (
         <button onClick={extraAction} className="p-3 text-slate-300 hover:text-primary transition-colors">
            <Copy size={18} />
         </button>
       )}
    </div>
  );
}
