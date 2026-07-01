import { motion } from 'motion/react';
import { EXPLORE_CATEGORIES } from '../data/exploreCategories';
import { cn } from '../lib/utils';

interface CategoryTabsProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  language?: 'bn' | 'en';
}

export default function ExploreCategoryTabs({ activeTab, onTabChange, language = 'bn' }: CategoryTabsProps) {
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide px-6 py-4">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onTabChange('ALL')}
        className={cn(
          "relative px-6 py-3 rounded-2xl font-bn font-black text-sm whitespace-nowrap transition-all flex items-center gap-2",
          activeTab === 'ALL' 
            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl" 
            : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700"
        )}
      >
        <span>{language === 'bn' ? 'সব' : 'All'}</span>
        {activeTab === 'ALL' && (
          <motion.div layoutId="tab-active" className="absolute inset-0 bg-primary/10 rounded-2xl -z-10" />
        )}
      </motion.button>

      {EXPLORE_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const isActive = activeTab === cat.id;

        return (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onTabChange(cat.id)}
            className={cn(
              "relative px-5 py-3 rounded-2xl font-bn font-black text-sm whitespace-nowrap transition-all flex items-center gap-2.5 group",
              isActive 
                ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xl ring-2 ring-primary/20" 
                : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700 hover:border-primary/30"
            )}
          >
            <div className={cn(
               "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
               isActive ? "bg-primary text-white" : "bg-slate-50 dark:bg-slate-900 text-slate-400 group-hover:text-primary"
            )}>
              <Icon size={18} />
            </div>
            <span>{language === 'bn' ? cat.bn : cat.en}</span>
            
            {isActive && (
              <motion.div 
                layoutId="active-pill" 
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" 
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
