import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Check, Loader2 } from 'lucide-react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Language } from '../translations';

interface AbuseReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportedId: string;
  reportedType: 'user' | 'news' | 'review';
  reportedTitle?: string;
  reportedDetails?: string;
  language: Language;
}

const REASONS_BN = [
  'স্প্যাম বা ভিত্তিহীন প্রচার',
  'অশালীন বা অশ্লীল ছবি/শব্দ ব্যবহার',
  'ভুল তথ্য বা বিভ্রান্তিকর বিষয়বস্তু',
  'হয়ানি বা ব্যক্তিগত আক্রমণ',
  'আইন পরিপন্থী বা সহিংসতা উস্কানি',
  'অন্যান্য আপত্তিজনক আচরণ'
];

const REASONS_EN = [
  'Spam or fake promotion',
  'Inappropriate or adult imagery/language',
  'Misinformation or fake news',
  'Harassment or personal attack',
  'Illegal activity or violence provocation',
  'Other objectionable behavior'
];

export default function AbuseReportModal({
  isOpen,
  onClose,
  reportedId,
  reportedType,
  reportedTitle = '',
  reportedDetails = '',
  language
  }: AbuseReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customDetails, setCustomDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reasonsList = language === 'bn' ? REASONS_BN : REASONS_EN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setErrorMessage(language === 'bn' ? 'দয়া করে রিপোর্টের একটি কারণ নির্বাচন করুন।' : 'Please select a reason for the report.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMessage(language === 'bn' ? 'রিপোর্ট করতে আপনাকে অবশ্যই লগইন করতে হবে।' : 'You must be logged in to submit a report.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      // Create a reference with auto ID
      const importRef = doc(collection(db, 'abuseReports'));
      const reportData = {
        reporterId: currentUser.uid,
        reportedId,
        reportedType,
        reportedTitle: reportedTitle.slice(0, 500),
        reportedDetails: reportedDetails.slice(0, 1000),
        reason: selectedReason,
        details: customDetails.slice(0, 2000),
        status: 'pending',
        createdAt: serverTimestamp() // Must match rule-side request.time
      };

      // Set success immediately (non-blocking) so user transitions instantly to success state!
      setIsSuccess(true);

      // Perform write in background
      (async () => {
        try {
          await setDoc(importRef, reportData);
        } catch (err: any) {
          console.error("Background Firestore save queued/offline:", err);
        }
      })();

      setTimeout(() => {
        setIsSuccess(false);
        setSelectedReason('');
        setCustomDetails('');
        setIsSubmitting(false);
        onClose();
      }, 2500);

    } catch (err: any) {
      console.error("Failed to post abuse report", err);
      setErrorMessage(language === 'bn' ? 'রিপোর্ট জমা দিতে ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।' : 'Failed to submit report. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;
  if (typeof window === 'undefined' || !window.document || !window.document.body) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal container */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 font-bn z-10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-500">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-lg font-black text-rose-600 dark:text-rose-400 leading-tight">
                  {language === 'bn' ? 'আপত্তিজনক কন্টেন্ট রিপোর্ট' : 'Report Abuse & Behavior'}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold mt-0.5">
                  ID: {auth.currentUser?.uid ? `${auth.currentUser.uid.substring(0, 8)}...` : 'Unknown'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {isSuccess ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-4">
                <Check size={32} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                {language === 'bn' ? 'রিপোর্ট সফলভাবে জমা হয়েছে' : 'Report Submitted'}
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[80%]">
                {language === 'bn' 
                  ? 'আপনার রিপোর্টটি আমাদের মডারেটর দলের কাছে পাঠানো হয়েছে। আমরা এটি খতিয়ে দেখব।' 
                  : 'Your report has been sent to our moderators for verification.'}
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {reportedTitle && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {language === 'bn' ? 'রিপোর্ট করা বিষয়বস্তু' : 'Reported Item'}
                  </span>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                    {reportedTitle}
                  </p>
                </div>
              )}

              {/* Predefined violates reasons list */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  {language === 'bn' ? 'অভিযোগের ধরণ নির্বাচন করুন *' : 'Select Reason *'}
                </label>
                <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {reasonsList.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedReason(reason)}
                      className={`text-left p-3 rounded-xl border text-xs sm:text-xs font-medium transition-all flex items-center justify-between ${
                        selectedReason === reason
                          ? 'border-rose-500 bg-rose-500/5 text-rose-600 dark:text-rose-400 font-bold'
                          : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span>{reason}</span>
                      {selectedReason === reason && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Area for details */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  {language === 'bn' ? 'বিস্তারিত বর্ণনা (ঐচ্ছিক)' : 'Additional description (Optional)'}
                </label>
                <textarea
                  value={customDetails}
                  onChange={(e) => setCustomDetails(e.target.value)}
                  placeholder={language === 'bn' ? 'আপত্তিজনক বিষয়বস্তু সম্পর্কে বিস্তারিত লিখুন...' : 'Give details of what you found objectionable...'}
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 focus:border-rose-500/30 rounded-2xl p-4.5 outline-none font-bn text-sm leading-relaxed text-slate-700 dark:text-slate-200 resize-none transition-colors"
                />
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs text-center font-bold">
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold text-sm transition-transform active:scale-95"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-rose-600/10 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{language === 'bn' ? 'জমা হচ্ছে...' : 'Submitting...'}</span>
                    </>
                  ) : (
                    language === 'bn' ? 'রিপোর্ট জমা দিন' : 'Submit Report'
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
