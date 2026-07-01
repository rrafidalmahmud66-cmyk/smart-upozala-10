import { motion } from 'motion/react';

export default function SplashScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-between bg-white dark:bg-slate-950 px-6 py-12 relative overflow-hidden select-none">
      {/* Premium Decorative Ambient Glows */}
      <div className="absolute top-[-10%] right-[-10%] w-80 h-80 rounded-full bg-primary/10 dark:bg-primary/5 blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[20%] left-[-10%] w-72 h-72 rounded-full bg-secondary/10 dark:bg-secondary/5 blur-[100px] pointer-events-none" />

      {/* Empty space to mimic mobile device safe areas and create symmetrical balance */}
      <div className="h-4" />

      {/* Core Brand Symbol & Identity Block */}
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 25, delay: 0.1 }}
          className="relative w-36 h-36 flex items-center justify-center"
        >
          {/* Layered Cards to create stunning depth */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary to-emerald-500 rounded-[2.75rem] shadow-2xl shadow-primary/30 dark:shadow-primary/10 rotate-6 transition-transform hover:rotate-12 duration-550" />
          <div className="absolute inset-0 bg-white dark:bg-slate-900 rounded-[2.75rem] m-0.5" />
          <div className="absolute inset-2 bg-gradient-to-tr from-primary to-emerald-500 rounded-[2.25rem] opacity-5 dark:opacity-10" />
          
          {/* Custom SVG Logo Symbol (Pruned & Highly Crafted) */}
          <svg viewBox="0 0 100 100" className="w-20 h-20 relative z-10">
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0F9D58" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            {/* The 'S' Shape with a digital/tech twist */}
            <path 
              d="M75,30 c0,-10 -10,-15 -25,-15 c-20,0 -25,10 -25,20 c0,25 50,15 50,40 c0,10 -10,15 -25,15 c-20,0 -25,-10 -25,-20" 
              fill="none" 
              stroke="url(#logoGradient)" 
              strokeWidth="11" 
              strokeLinecap="round"
              className="drop-shadow-sm"
              strokeDasharray="200"
              strokeDashoffset="0"
            />
            {/* Digital Node connection points */}
            <circle cx="75" cy="30" r="6" fill="#10b981" className="animate-ping" style={{ transformOrigin: '75px 30px' }} />
            <circle cx="75" cy="30" r="5" fill="#10b981" />
            <circle cx="25" cy="70" r="5" fill="#0F9D58" />
          </svg>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-8 text-center"
        >
          <h1 className="text-3xl font-display font-black tracking-tight text-slate-800 dark:text-white">
            Smart <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-500">Sreepur</span>
          </h1>
          
          {/* Elegant Bengali sub-label rendered with beautiful tracking and font */}
          <div className="mt-4">
            <span className="text-xs font-bn font-black tracking-widest text-primary dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 px-5 py-2 rounded-full inline-flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              স্মার্ট উপজেলা • শ্রীপুর
            </span>
          </div>
        </motion.div>
      </div>

      {/* Animated Minimal Progress Bar */}
      <div className="w-full flex flex-col items-center gap-4">
        <motion.div 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "64%", opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative"
        >
          <motion.div 
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-1/3 h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full"
          />
        </motion.div>
        
        {/* Humble, formal credit block */}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bn uppercase tracking-[0.25em] text-center">
          Government of Bangladesh
        </p>
      </div>
    </div>
  );
}
