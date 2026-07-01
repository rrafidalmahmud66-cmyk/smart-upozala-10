import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, CheckCircle2, ChevronRight, LogIn, UserPlus, Eye, EyeOff, Sparkles, ArrowLeft } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Language, translations } from '../translations';

export default function AuthScreen({ language = 'bn' }: { language?: Language }) {
  const t = translations[language] || translations['bn'];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setError(language === 'bn' ? 'গুগল লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' : 'Google login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError(language === 'bn' ? 'এই ইমেইলটি দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' : 'No account found with this email.');
      } else if (err.code === 'auth/invalid-email') {
        setError(language === 'bn' ? 'সঠিক ইমেইল এড্রেস প্রদান করুন।' : 'Please enter a valid email address.');
      } else {
        setError(language === 'bn' ? 'পাসওয়ার্ড রিসেট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' : 'Failed to send reset link. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        if (name) {
          await updateProfile(user, { displayName: name });
        }
        
        // Write standard profile immediately so displayName is guaranteed to sync on registration
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: (name || '').slice(0, 100),
          photoURL: '',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(language === 'bn' ? 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।' : 'Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError(language === 'bn' ? 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হচ্ছে।' : 'Email already in use.');
      } else if (err.code === 'auth/weak-password') {
        setError(language === 'bn' ? 'পাসওয়ার্ডটি অত্যন্ত দুর্বল (কমপক্ষে ৬ ডিজিট দিন)।' : 'Password is too weak (min 6 digits).');
      } else {
        setError(language === 'bn' ? 'লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' : 'Authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col justify-between px-6 py-10 bg-slate-50 dark:bg-slate-950 relative overflow-y-auto scrollbar-hide select-none">
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-[-5%] right-[-5%] w-72 h-72 bg-primary/5 rounded-full blur-[90px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[10%] left-[-5%] w-72 h-72 bg-secondary/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Decorative Branding Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center pt-6"
      >
        {/* Beautiful Custom SVG Logo representing Smart Sreepur */}
        <div className="w-20 h-20 bg-emerald-50 dark:bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto mb-5 border border-emerald-100 dark:border-slate-800 shadow-sm animate-bounce" style={{ animationDuration: '4s' }}>
          <svg viewBox="0 0 100 100" className="w-12 h-12 relative z-10">
            <defs>
              <linearGradient id="logoGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <path 
              d="M75,30 c0,-10 -10,-15 -25,-15 c-20,0 -25,10 -25,20 c0,25 50,15 50,40 c0,10 -10,15 -25,15 c-20,0 -25,-10 -25,-20" 
              fill="none" 
              stroke="url(#logoGradient2)" 
              strokeWidth="11" 
              strokeLinecap="round"
              className="drop-shadow-sm"
              strokeDasharray="200"
              strokeDashoffset="0"
            />
            <circle cx="75" cy="30" r="5" fill="#059669" />
            <circle cx="25" cy="70" r="5" fill="#10b981" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight max-w-sm mx-auto px-2">
          {isForgotPassword 
            ? (language === 'bn' ? 'পাসওয়ার্ড রিসেট করুন' : 'Reset Password')
            : isLogin 
              ? (language === 'bn' ? 'স্মার্ট উপজেলা অ্যাপে আপনাকে স্বাগত' : 'Welcome to Smart Sreepur') 
              : (language === 'bn' ? 'নতুন অ্যাকাউন্ট খুলুন' : 'Create Account')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-bn text-sm mt-2.5 max-w-xs mx-auto">
          {isForgotPassword
            ? (language === 'bn' ? 'আপনার ব্যক্তিগত অ্যাকাউন্ট পাসওয়ার্ড রিসেট করুন' : 'Confirm your email to reset security password')
            : isLogin 
              ? (language === 'bn' ? 'আপনার ব্যক্তিগত অ্যাকাউন্টে নিরাপদে লগইন করুন' : 'Sign in safely to your personal account')
              : (language === 'bn' ? 'স্মার্ট উপজেলা নাগরিক সেবা গ্রহণ করতে যুক্ত হোন' : 'Join the smart citizen platform')}
        </p>
      </motion.div>

      {/* Primary Form Card */}
      <div className="my-8 flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {isForgotPassword ? (
            <motion.div
              key="forgot_password"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 border border-slate-100 dark:border-slate-800 soft-shadow"
            >
              {resetSent ? (
                <div className="space-y-6 text-center py-4">
                  <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
                    <CheckCircle2 size={36} className="animate-bounce" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bn font-black text-xl text-slate-900 dark:text-white">
                      {language === 'bn' ? 'ইমেইল পাঠানো হয়েছে!' : 'Reset Email Sent!'}
                    </h3>
                    <p className="text-sm font-bn text-slate-500 dark:text-slate-400 leading-relaxed px-4">
                      {language === 'bn' 
                        ? `একটি পাসওয়ার্ড রিসেট লিঙ্ক আপনার ইমেইল (${email}) এ পাঠানো হয়েছে। অনুগ্রহ করে ইনবক্স অথবা স্প্যাম ফোল্ডার চেক করুন।` 
                        : `A password reset link has been sent to your email (${email}). Please check your inbox or spam folder.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                      setError(null);
                    }}
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-4 rounded-2xl font-bn font-black text-base shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>{language === 'bn' ? 'লগইন স্ক্রিনে ফিরে যান' : 'Back to Login'}</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 ml-1.5 uppercase tracking-wider">
                      {language === 'bn' ? 'ইমেইল এড্রেস' : 'Email Address'}
                    </label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="example@mail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-3.5 pl-11 pr-5 focus:border-primary focus:bg-white dark:focus:bg-slate-900 outline-none transition-all font-sans dark:text-white font-medium"
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-rose-500 text-xs font-bn text-center bg-rose-50 dark:bg-rose-950/20 py-2.5 px-3 rounded-2xl border border-rose-100 dark:border-rose-900/30"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    disabled={isLoading}
                    type="submit"
                    className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-3.5 rounded-2xl font-bn font-black text-lg shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:scale-100 cursor-pointer"
                  >
                    {isLoading ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <>
                        <span>{language === 'bn' ? 'রিসেট লিঙ্ক পাঠান' : 'Send Reset Link'}</span>
                        <ChevronRight size={18} className="stroke-[3]" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setError(null);
                    }}
                    className="w-full bg-transparent text-slate-550 dark:text-slate-400 py-2 font-bn font-bold text-sm text-center flex items-center justify-center gap-2 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>{language === 'bn' ? 'লগইনে ফিরে যান' : 'Back to Login'}</span>
                  </button>
                </form>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 border border-slate-100 dark:border-slate-800 soft-shadow"
            >
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {!isLogin && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 ml-1.5 uppercase tracking-wider">
                      {language === 'bn' ? 'আপনার পূর্ণ নাম' : 'Full Name'}
                    </label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                        <LogIn size={18} />
                      </div>
                      <input
                        type="text"
                        required={!isLogin}
                        placeholder={language === 'bn' ? 'নাম লিখুন (যেমন: আরিয়ান রহমান)' : 'Enter your name'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-3.5 pl-11 pr-5 focus:border-primary focus:bg-white dark:focus:bg-slate-900 outline-none transition-all font-bn dark:text-white font-medium"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 ml-1.5 uppercase tracking-wider">
                    {language === 'bn' ? 'ইমেইল এড্রেস' : 'Email Address'}
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="example@mail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-3.5 pl-11 pr-5 focus:border-primary focus:bg-white dark:focus:bg-slate-900 outline-none transition-all font-sans dark:text-white font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 ml-1.5 uppercase tracking-wider">
                    {language === 'bn' ? 'নিরাপদ পাসওয়ার্ড' : 'Password'}
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
                      <Lock size={18} />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-3.5 pl-11 pr-12 focus:border-primary focus:bg-white dark:focus:bg-slate-900 outline-none transition-all font-sans dark:text-white font-medium"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="flex justify-end pr-1 pt-0.5">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError(null);
                      }}
                      className="text-xs text-primary font-bn font-extrabold hover:text-emerald-600 hover:underline transition-colors cursor-pointer"
                    >
                      {language === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot Password?'}
                    </button>
                  </div>
                )}

                {error && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-rose-500 text-xs font-bn text-center bg-rose-50 dark:bg-rose-950/20 py-2.5 px-3 rounded-2xl border border-rose-100 dark:border-rose-900/30"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  disabled={isLoading}
                  type="submit"
                  className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-4 rounded-2xl font-bn font-black text-lg shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:scale-100 cursor-pointer"
                >
                  {isLoading ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      <span>
                        {isLogin 
                          ? (language === 'bn' ? 'লগইন করুন' : 'Login') 
                          : (language === 'bn' ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'Sign Up')}
                      </span>
                      <ChevronRight size={18} className="stroke-[3]" />
                    </>
                  )}
                </button>
              </form>

              {/* Separator block */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100 dark:border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em]">
                  <span className="bg-white dark:bg-slate-900 px-4 text-slate-400 font-bold">
                    {language === 'bn' ? 'অথবা' : 'OR CONTINUE WITH'}
                  </span>
                </div>
              </div>

              {/* Social Authentication */}
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 py-4 rounded-2xl font-bn font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <img 
                  src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" 
                  width={20} 
                  height={20} 
                  alt="Google"
                  referrerPolicy="no-referrer"
                />
                <span>{language === 'bn' ? 'গুগল অ্যাকাউন্ট দিয়ে লগইন করুন' : 'Continue with Google'}</span>
              </button>

              {/* Toggle Screen Option */}
              <div className="text-center pt-4">
                <p className="text-sm font-bn text-slate-500 dark:text-slate-400">
                  {isLogin 
                    ? (language === 'bn' ? 'আপনার কোনো অ্যাকাউন্ট নেই?' : "Don't have an account?")
                    : (language === 'bn' ? 'ইতিমধ্যে একটি অ্যাকাউন্ট আছে?' : "Already have an account?")}
                  {' '}
                  <button 
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError(null);
                    }}
                    className="text-primary font-black hover:underline ml-1"
                  >
                    {isLogin 
                      ? (language === 'bn' ? 'রেজিস্ট্রেশন করুন' : 'Create One')
                      : (language === 'bn' ? 'লগইন করুন' : 'Sign In')}
                  </button>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Humble Footer Legal Notes */}
      <div className="pt-4">
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-bn px-10 leading-relaxed tracking-wide">
          {language === 'bn' ? (
            <>লগইন বা সাইন আপ করার মাধ্যমে আপনি আমাদের <span className="text-slate-600 dark:text-slate-350 font-bold hover:underline cursor-pointer">সেবার শর্তাবলী</span> ও <span className="text-slate-600 dark:text-slate-350 font-bold hover:underline cursor-pointer">গোপনীয়তা নীতি</span> মেনে নিচ্ছেন।</>
          ) : (
            <>By signing in, you agree to our <span className="text-slate-600 dark:text-slate-350 font-bold hover:underline cursor-pointer">Terms</span> and <span className="text-slate-600 dark:text-slate-350 font-bold hover:underline cursor-pointer">Privacy Policy</span>.</>
          )}
        </p>
      </div>
    </div>
  );
}
