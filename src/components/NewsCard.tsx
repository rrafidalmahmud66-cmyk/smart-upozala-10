import React, { useState } from 'react';
import { Trash2, Play, Clock, Tag, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getNewsFallbackImage, getCleanImageUrl } from '../lib/image-utils';

interface NewsCardProps {
  key?: any;
  news: any;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
  onClick?: () => void;
  language?: 'bn' | 'en';
}

// নিউজ কার্ড কম্পোনেন্ট যা ইউজার এবং এডমিন উভয়ই ব্যবহার করবে
const NewsCard = ({ news, isAdmin, onDelete, isDeleting, onClick, language = 'bn' }: NewsCardProps) => {
  const { title, description, category, thumbnail, image, videoUrl, createdAt } = news;
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // ইমেজ রেন্ডারিং লজিক (Priority: thumbnail > image > placeholder)
  const displayImage = thumbnail || image;

  const formatDate = (at: any) => {
    if (!at) return language === 'bn' ? 'সাম্প্রতিক' : 'Recent';
    const date = at.toDate ? at.toDate() : new Date(at);
    return date.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const placeholderImg = getNewsFallbackImage(title, category);

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-800 rounded-3xl overflow-hidden soft-shadow border border-slate-100 dark:border-slate-700 transition-all flex flex-col h-full relative group",
        onClick && "cursor-pointer hover:scale-[1.01]"
      )}
    >
      {/* ইমেজ সেকশন ১:১৬ রেশিও */}
      <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
        {displayImage && !imageError ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900 z-10">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            )}
            <img 
              src={getCleanImageUrl(displayImage, { id: news.id, category: 'news', title: news.title })} 
              alt={title}
              loading="lazy"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              className={cn(
                "w-full h-full object-cover transition-all duration-700",
                imageLoading ? "scale-105 blur-sm opacity-0" : "scale-100 blur-0 opacity-100"
              )}
            />
          </>
        ) : (
          <div className="w-full h-full relative group">
             <img 
              src={placeholderImg} 
              alt="Default placeholder"
              className="w-full h-full object-cover opacity-60"
              loading="lazy"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
              <ImageIcon size={40} strokeWidth={1.5} className="mb-2 opacity-50" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">{imageError ? 'Load Failed' : 'No Cover Image'}</span>
            </div>
          </div>
        )}
        
        {/* ক্যাটাগরি চিপ */}
        {category && (
          <div className="absolute top-4 left-4 bg-primary/90 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider z-20">
            {category}
          </div>
        )}

        {/* ভিডিও প্লে বাটন ওভারলে */}
        {videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/30 transition-all z-10">
            <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white border border-white/50 shadow-xl group-hover:scale-110 transition-transform">
              <Play size={24} fill="currentColor" />
            </div>
          </div>
        )}

        {/* ডিলিট বাটন (এডমিনদের জন্য) */}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(news.id);
            }}
            disabled={isDeleting}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg active:scale-95 disabled:bg-slate-300 z-30"
          >
            {isDeleting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={18} />}
          </button>
        )}
      </div>

      {/* কন্টেন্ট সেকশন */}
      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">
          <Clock size={12} className="text-secondary" />
          <span>{formatDate(createdAt)}</span>
        </div>
        
        <h3 className="text-lg font-bn font-bold text-slate-800 dark:text-white line-clamp-2 mb-2 leading-snug group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <p className="text-sm font-bn text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
};

export default NewsCard;
