import { 
  Phone, 
  Search, 
  AlertTriangle, 
  ShieldCheck, 
  Flame, 
  Ambulance, 
  ChevronRight,
  X,
  Heart,
  MapPin,
  Calendar,
  Plus,
  Clock,
  ExternalLink,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { Screen } from '../types';
import { Language, translations } from '../translations';
import { cn } from '../lib/utils';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';


// Static databases for Sreepur Blood Banks & groups
const initialBloodBanks = [
  {
    name_bn: "শ্রীপুর ব্লাড ব্যাংক (স্বেচ্ছাসেবী ফাউন্ডেশন)",
    name_en: "Sreepur Blood Bank (Voluntary)",
    phone: "01712-345678",
    fb_link: "https://www.facebook.com/share/g/1Bx2m8QjBQ/?mibextid=wwXIfr",
    address_bn: "শ্রীপুর চৌরাস্তা, শ্রীপুর, গাজীপুর",
    address_en: "Sreepur Chowrasta, Sreepur, Gazipur",
    type_bn: "স্বেচ্ছাসেবী সংগঠন",
    type_en: "Voluntary Organization",
    active_bn: "২৪ ঘন্টা খোলা",
    active_en: "Open 24/7"
  },
  {
    name_bn: "মাওনা ব্লাড ডোনারস ক্লাব",
    name_en: "Maona Blood Donors Club",
    phone: "01823-456789",
    fb_link: "https://www.facebook.com/share/g/1GyBoafcgw/?mibextid=wwXIfr",
    address_bn: "মাওনা চৌরাস্তা, শ্রীপুর, গাজীপুর",
    address_en: "Maona Chowrasta, Sreepur, Gazipur",
    type_bn: "স্বেচ্ছাসেবী প্ল্যাটফর্ম",
    type_en: "Voluntary Platform",
    active_bn: "জরুরী সেবা উপলব্ধ",
    active_en: "Emergency Support Available"
  },
  {
    name_bn: "সন্ধানী রক্তদান কেন্দ্র (গাজীপুর শাখা)",
    name_en: "Sandhani Blood Center (Gazipur)",
    phone: "01511-789012",
    fb_link: "https://www.facebook.com/share/1BdCFovfnn/?mibextid=wwXIfr",
    address_bn: "শ্রীপুর উপজেলা স্বাস্থ্য কমপ্লেক্স রোড, শ্রীপুর",
    address_en: "Sreepur Upazila Health Complex Road, Sreepur",
    type_bn: "মেডিকেল ব্লাড ব্যাংক",
    type_en: "Medical Blood Bank",
    active_bn: "সকাল ৯:০০ - রাত ৮:০০",
    active_en: "9:00 AM - 8:00 PM"
  },
  {
    name_bn: "রেড ক্রিসেন্ট ব্লাড সেন্টার, গাজীপুর",
    name_en: "Red Crescent Blood Center, Gazipur",
    phone: "01934-567890",
    fb_link: "https://www.facebook.com/share/g/18eojBUd2Q/?mibextid=wwXIfr",
    address_bn: "গাজীপুর সদর, গাজীপুর (শ্রীপুরের জন্য সংযোগ উপলব্ধ)",
    address_en: "Gazipur Sadar, Gazipur (Direct Support to Sreepur)",
    type_bn: "অফিসিয়াল ব্লাড ব্যাংক",
    type_en: "Official Blood Bank",
    active_bn: "জরুরী প্রয়োজনে ফোন করুন",
    active_en: "Call for Emergencies"
  }
];

const initialBloodDonors = [
  { name_bn: "ইমরান আহমেদ", name_en: "Imran Ahmed", group: "O+", location_bn: "মাওনা চৌরাস্তা", location_en: "Maona Chowrasta", phone: "01711-223344", last_donation_bn: "৩ মাস পূর্বে", last_donation_en: "3 months ago", available: true },
  { name_bn: "তামান্না সুলতানা", name_en: "Tamanna Sultana", group: "A+", location_bn: "শ্রীপুর পৌরসভা", location_en: "Sreepur Municipality", phone: "01822-334455", last_donation_bn: "৪ মাস পূর্বে", last_donation_en: "4 months ago", available: true },
  { name_bn: "মো: রফিকুল ইসলাম", name_en: "Md. Rafiqul Islam", group: "B+", location_bn: "কাওরাইদ বাজার", location_en: "Kaoraid Bazar", phone: "01933-445566", last_donation_bn: "১ মাস পূর্বে (অনুপযুক্ত)", last_donation_en: "1 month ago (Unavailable)", available: false },
  { name_bn: "আরিফ বিল্লাহ", name_en: "Arif Billah", group: "AB+", location_bn: "রাজাবাড়ী বাজার", location_en: "Rajabari Bazar", phone: "01544-556677", last_donation_bn: "৫ মাস পূর্বে", last_donation_en: "5 months ago", available: true },
  { name_bn: "নুসরাত জাহান", name_en: "Nusrat Jahan", group: "O-", location_bn: "এম সি বাজার", location_en: "M.C. Bazar", phone: "01655-667788", last_donation_bn: "৬ মাস পূর্বে", last_donation_en: "6 months ago", available: true },
  { name_bn: "সাকিব আল হাসান", name_en: "Sakib Al Hasan", group: "A-", location_bn: "মাওনা চৌরাস্তা", location_en: "Maona Chowrasta", phone: "01788-990011", last_donation_bn: "২ মাস পূর্বে (অনুপযুক্ত)", last_donation_en: "2 months ago (Unavailable)", available: false },
  { name_bn: "তাহমিদা আক্তার", name_en: "Tahmida Akhter", group: "B-", location_bn: "গাজীপুর ইউনিয়ন", location_en: "Gazipur Union", phone: "01855-443322", last_donation_bn: "৮ মাস পূর্বে", last_donation_en: "8 months ago", available: true },
  { name_bn: "ফাহাদ চৌধুরী", name_en: "Fahad Chowdhury", group: "O+", location_bn: "শ্রীপুর রেল স্টেশন", location_en: "Sreepur Rail Station", phone: "01311-224455", last_donation_bn: "১০ দিন পূর্বে (অনুপযুক্ত)", last_donation_en: "10 days ago (Unavailable)", available: false },
];

export default function EmergencyScreen({ onNavigate, language = 'bn' }: { onNavigate: (s: Screen) => void, language?: Language }) {
  const t = translations[language] || translations['bn'];
  const [searchQuery, setSearchQuery] = useState('');

  // Sreepur Blood Support state managers
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [bloodTab, setBloodTab] = useState<'banks' | 'donors' | 'request'>('banks');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('All');
  
  const [bloodBanks] = useState(initialBloodBanks);
  const [donors, setDonors] = useState<any[]>(initialBloodDonors);
  const [requests, setRequests] = useState<any[]>([
    { name_bn: "মো: কামরুল ইসলাম", name_en: "Md. Kamrul Islam", group: "AB-", hospital_bn: "শ্রীপুর উপজেলা স্বাস্থ্য কমপ্লেক্স", hospital_en: "Sreepur Upazila Health Complex", phone: "01723-998877", date_bn: "আজকে প্রয়োজন", date_en: "Needed Today", b_count_bn: "২ ব্যাগ", b_count_en: "2 Bags" },
    { name_bn: "হাবিবা বেগম", name_en: "Habiba Begum", group: "O+", hospital_bn: "মাওনা আল-হেরা হাসপাতাল", hospital_en: "Maona Al-Hera Hospital", phone: "01844-332211", date_bn: "আগামীকাল সকাল", date_en: "Tomorrow Morning", b_count_bn: "১ ব্যাগ", b_count_en: "1 Bag" }
  ]);

  // Real-time synchronization
  useEffect(() => {
    const unsubDonors = onSnapshot(collection(db, 'blood_donors'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length > 0) {
        setDonors(data);
      } else {
        setDonors(initialBloodDonors);
      }
    }, (error) => {
      console.warn("Firestore access error:", error);
    });

    const unsubRequests = onSnapshot(collection(db, 'blood_requests'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length > 0) {
        setRequests(data);
      } else {
        setRequests([
          { name_bn: "মো: কামরুল ইসলাম", name_en: "Md. Kamrul Islam", group: "AB-", hospital_bn: "শ্রীপুর উপজেলা স্বাস্থ্য কমপ্লেক্স", hospital_en: "Sreepur Upazila Health Complex", phone: "01723-998877", date_bn: "আজকে প্রয়োজন", date_en: "Needed Today", b_count_bn: "২ ব্যাগ", b_count_en: "2 Bags" },
          { name_bn: "হাবিবা বেগম", name_en: "Habiba Begum", group: "O+", hospital_bn: "মাওনা আল-হেরা হাসপাতাল", hospital_en: "Maona Al-Hera Hospital", phone: "01844-332211", date_bn: "আগামীকাল সকাল", date_en: "Tomorrow Morning", b_count_bn: "১ ব্যাগ", b_count_en: "1 Bag" }
        ]);
      }
    }, (error) => {
      console.warn("Firestore access error:", error);
    });

    return () => {
      unsubDonors();
      unsubRequests();
    };
  }, []);

  // Form states
  const [reqForm, setReqForm] = useState({ name: '', phone: '', group: 'A+', count: '১ ব্যাগ', hospital: '', date: '' });
  const [donorForm, setDonorForm] = useState({ name: '', phone: '', group: 'A+', location: '', lastDonation: '' });
  const [formSuccessMsg, setFormSuccessMsg] = useState<string | null>(null);

  const bnToEn = (str: string) => {
    if (!str) return '';
    const digits: any = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return str.replace(/[০-৯]/g, (w) => digits[w]);
  };

  const getNum = (num: string) => language === 'bn' ? num : bnToEn(num);

  const handleAddRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqForm.name || !reqForm.phone || !reqForm.hospital) return;
    
    const newReq = {
      name_bn: reqForm.name,
      name_en: reqForm.name,
      group: reqForm.group,
      hospital_bn: reqForm.hospital,
      hospital_en: reqForm.hospital,
      phone: reqForm.phone,
      date_bn: reqForm.date || (language === 'bn' ? "জরুরী" : "Urgent"),
      date_en: reqForm.date || (language === 'bn' ? "জরুরী" : "Urgent"),
      b_count_bn: reqForm.count || "১ ব্যাগ",
      b_count_en: reqForm.count || "1 Bag",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'blood_requests'), newReq);
      setReqForm({ name: '', phone: '', group: 'A+', count: '১ ব্যাগ', hospital: '', date: '' });
      setFormSuccessMsg(language === 'bn' ? "রক্তের অনুরোধটি সফলভাবে পোস্ট করা হয়েছে!" : "Blood request posted successfully!");
      setTimeout(() => setFormSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Error: database write failed');
    }
  };

  const handleRegisterDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorForm.name || !donorForm.phone || !donorForm.location) return;

    const newDonor = {
      name_bn: donorForm.name,
      name_en: donorForm.name,
      group: donorForm.group,
      location_bn: donorForm.location,
      location_en: donorForm.location,
      phone: donorForm.phone,
      last_donation_bn: donorForm.lastDonation || (language === 'bn' ? "এখনই প্রস্তুত" : "Ready now"),
      last_donation_en: donorForm.lastDonation || (language === 'bn' ? "Ready now" : "Ready now"),
      available: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'blood_donors'), newDonor);
      setDonorForm({ name: '', phone: '', group: 'A+', location: '', lastDonation: '' });
      setFormSuccessMsg(language === 'bn' ? "রক্তদাতা হিসেবে আপনার নাম সফলভাবে নিবন্ধিত হয়েছে!" : "Successfully registered as a blood donor!");
      setTimeout(() => setFormSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Error: database write failed');
    }
  };

  const contacts = [
    { title: t.emergencyContacts.national, number: getNum('৯৯৯'), icon: ShieldCheck, color: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20', border: 'border-rose-100 dark:border-rose-900/35' },
    { title: t.emergencyContacts.police, number: getNum('০১৩২০-০৯২৩৫৬'), icon: ShieldCheck, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-100 dark:border-blue-900/35' },
    { title: t.emergencyContacts.fire, number: getNum('১০২'), icon: Flame, color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-100 dark:border-orange-900/35' },
    { title: t.emergencyContacts.hospital, number: getNum('০১৬০৪-৪৯৪৬৬৬'), icon: Ambulance, color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-100 dark:border-emerald-900/35' },
    { title: t.emergencyContacts.uno, number: getNum('০১৭৮৩-৮৬৫৮৮৬'), icon: ShieldCheck, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200/50 dark:border-slate-700/50' },
    { title: t.emergencyContacts.acLand, number: getNum('০১৭৮৩-৮৬৫৮৯৩'), icon: ShieldCheck, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200/50 dark:border-slate-705/50' },
    { title: t.emergencyContacts.gov, number: getNum('৩৩৩'), icon: Phone, color: 'text-indigo-500 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-indigo-100 dark:border-indigo-900/35' },
    { title: t.emergencyContacts.womanChild, number: getNum('১০৯'), icon: AlertTriangle, color: 'text-pink-500 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/20', border: 'border-pink-100 dark:border-pink-900/35' },
    { title: t.emergencyContacts.pbs, number: getNum('১৬৬৯৯'), icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-450', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-100 dark:border-amber-900/35' },
    { title: t.emergencyContacts.consumer, number: getNum('১৬১২১'), icon: ShieldCheck, color: 'text-teal-500 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/20', border: 'border-teal-100 dark:border-teal-900/35' },
  ];

  const filteredContacts = contacts.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-6 pb-24">
      {/* Title & Description Block */}
      <div className="mt-4 mb-8">
        <span className="text-[10px] font-bn font-black text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-4 py-1.5 rounded-full inline-block border border-rose-100 dark:border-rose-900/40 shadow-sm leading-none uppercase tracking-widest mb-3">
          Instant Help Line
        </span>
        <h2 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">{t.titles.emergencyHelp}</h2>
        <p className="text-slate-500 dark:text-slate-400 font-bn mt-1.5 text-sm leading-relaxed tracking-wide italic">{t.titles.emergencySubtitle}</p>
      </div>

      {/* Modern Search Bar */}
      <div className="relative mb-8 group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-500 transition-colors pointer-events-none">
          <Search size={18} />
        </div>
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.titles.searchPlaceholder} 
          className="w-full bg-white dark:bg-slate-900 rounded-[2rem] py-4 pl-12 pr-6 border-2 border-slate-100 dark:border-slate-800 focus:border-red-500 outline-none transition-all font-bn dark:text-white text-base soft-shadow"
        />
        {searchQuery && (
          <button 
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bn font-bold"
          >
            মুছে ফেলুন
          </button>
        )}
      </div>

      {/* Grid of Contact Elements */}
      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="wait">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((item, idx) => (
              <motion.div 
                key={`contact-${item.title}-${idx}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
                className={cn(
                  "bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-850 flex items-center justify-between group soft-shadow"
                )}
              >
                <div className="flex items-center gap-4 flex-1 pr-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border", item.bg, item.border)}>
                    <item.icon size={24} className={item.color} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h4 className="text-base font-bn font-bold text-slate-850 dark:text-slate-100 leading-tight truncate">{item.title}</h4>
                    <p className="text-slate-600 dark:text-slate-400 font-display font-black text-sm mt-1">{item.number}</p>
                  </div>
                </div>
                
                {/* Dial Trigger Phone Call */}
                <button 
                  type="button"
                  onClick={() => window.open(`tel:${item.number === '১০২' ? '102' : item.number}`, '_self')}
                  className="w-12 h-12 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/10 active:scale-90 transition-all cursor-pointer shrink-0"
                  aria-label={`Call ${item.title}`}
                >
                  <Phone size={18} className="stroke-[2.5]" />
                </button>
              </motion.div>
            ))
          ) : (
            /* Search Empty State Design */
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 px-6 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 soft-shadow"
            >
              <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                <Search size={24} />
              </div>
              <h4 className="font-bn font-bold text-slate-700 dark:text-slate-300 text-lg">কোনো নাম্বার পাওয়া যায়নি</h4>
              <p className="text-slate-400 dark:text-slate-500 font-bn text-xs mt-1.5 max-w-xs mx-auto">সার্চ কুয়েরির সাথে মিল রয়েছে এমন সঠিক নাম্বার পাওয়া যায়নি।</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Premium Blood Emergency Card */}
      <div className="mt-12 bg-rose-50/50 dark:bg-rose-950/10 p-8 rounded-[3.5rem] border border-rose-100 dark:border-rose-900/35 flex flex-col items-center text-center relative overflow-hidden group">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
        
        {/* Blood Icon container with animated pulse */}
        <div className="w-20 h-20 rounded-full bg-rose-105 dark:bg-rose-950 flex items-center justify-center mb-6 border-4 border-white dark:border-slate-900 shadow-sm relative">
          <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-15 scale-105" />
          <Heart size={36} className="text-rose-500 relative z-10 fill-rose-500 animate-pulse" />
        </div>
        
        <h3 className="text-2xl font-bn font-black text-rose-600 dark:text-rose-400 mb-2 leading-tight">{t.titles.bloodEmergency}</h3>
        <p className="text-slate-500 dark:text-slate-455 font-bn text-sm leading-relaxed mb-6 font-medium max-w-xs">{t.titles.bloodSubtitle}</p>
        
        <button 
          type="button"
          onClick={() => {
            setShowBloodModal(true);
            setBloodTab('banks');
          }}
          className="w-full bg-rose-550 hover:bg-rose-600 text-white py-4 px-6 rounded-[2rem] font-bn font-black text-base shadow-xl shadow-rose-500/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <Heart size={18} className="fill-white" />
          <span>{t.titles.findDonor}</span>
        </button>
      </div>

      {/* Lodge Complaint Link Button */}
      <div className="mt-6 bg-slate-100/50 dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between group soft-shadow">
        <div className="flex items-center gap-4 pr-3 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-955/30 text-amber-500 flex items-center justify-center shrink-0 border border-amber-100/40 dark:border-amber-900/35">
             <AlertTriangle size={24} className="stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bn font-bold text-slate-850 dark:text-white truncate">অভিযোগ জমা দিন</h4>
            <p className="text-xs font-bn text-slate-400 mt-1 truncate">এলাকার যেকোনো সমস্যা ডিজিটাল ম্যাপে জানাতে</p>
          </div>
        </div>
        
        <button 
          type="button"
          onClick={() => onNavigate('REPORT')}
          className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 text-slate-400 hover:text-amber-550 group-hover:scale-105 shadow-sm border border-slate-150 dark:border-slate-700/60 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          aria-label="Submit a citizenship report"
        >
          <ChevronRight size={20} className="stroke-[3]" />
        </button>
      </div>

      {/* Blood Bank / Donors Interactive Pop-up Modal */}
      <AnimatePresence>
        {showBloodModal && (
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header Box */}
              <div className="bg-gradient-to-br from-rose-500 to-red-650 p-6 text-white relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowBloodModal(false);
                    setFormSuccessMsg(null);
                  }}
                  className="absolute right-4 top-4 w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all cursor-pointer text-white border-0"
                >
                  <X size={18} />
                </button>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Heart size={24} className="fill-white animate-pulse text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bn font-black">
                      {language === 'bn' ? 'জরুরী রক্তসেবা হাব' : 'Blood Emergency Hub'}
                    </h3>
                    <p className="text-white/80 font-bn text-xs mt-0.5">
                      {language === 'bn' ? 'শ্রীপুর ডিজিটাল রক্তের পোর্টালে স্বাগতম' : 'Welcome to Sreepur Digital Blood Support Portal'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 p-2 gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setBloodTab('banks')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-center text-xs font-bn font-black transition-all cursor-pointer border-0",
                    bloodTab === 'banks' 
                      ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-455 shadow-sm border border-slate-100/50 dark:border-slate-800/50" 
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/40 bg-transparent"
                  )}
                >
                  {language === 'bn' ? 'ব্লাড ব্যাংকসমূহ' : 'Blood Banks'}
                </button>
                <button
                  type="button"
                  onClick={() => setBloodTab('donors')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-center text-xs font-bn font-black transition-all cursor-pointer border-0",
                    bloodTab === 'donors'
                      ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-455 shadow-sm border border-slate-100/50 dark:border-slate-800/50" 
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/40 bg-transparent"
                  )}
                >
                  {language === 'bn' ? 'রক্তদাতার তালিকা' : 'Blood Donors'}
                </button>
                <button
                  type="button"
                  onClick={() => setBloodTab('request')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-center text-xs font-bn font-black transition-all cursor-pointer border-0",
                    bloodTab === 'request'
                      ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-455 shadow-sm border border-slate-100/50 dark:border-slate-800/50" 
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/40 bg-transparent"
                  )}
                >
                  {language === 'bn' ? 'অনুরোধ / যুক্ত হোন' : 'Request / Join'}
                </button>
              </div>

              {/* Scrollable Container Content */}
              <div className="flex-1 overflow-y-auto p-5 scrollbar-hide space-y-4">
                {formSuccessMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 text-xs font-bn font-black text-center"
                  >
                    {formSuccessMsg}
                  </motion.div>
                )}

                {/* 1. Blood Banks List Tab */}
                {bloodTab === 'banks' && (
                  <div className="space-y-4">
                    <p className="text-slate-405 dark:text-slate-500 font-bn text-[11px] text-center leading-relaxed">
                      {language === 'bn' 
                        ? 'শ্রীপুর ও গাজীপুর অঞ্চলের প্রধান প্রধান রক্তদাতা ফেসবুক লিংক ও ব্লাড ব্যাংক তথ্য।'
                        : 'Key Facebook links and blood bank contact files for Sreepur & Gazipur area.'}
                    </p>

                    {bloodBanks.map((bank, index) => (
                      <div 
                        key={`bank-${index}`}
                        className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-[2rem] border border-slate-100 dark:border-slate-800/60 shadow-sm relative group hover:border-rose-100 dark:hover:border-rose-900/20 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[10px] font-bn font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-100 dark:border-rose-950/30 inline-block mb-1.5 leading-none">
                              {language === 'bn' ? bank.type_bn : bank.type_en}
                            </span>
                            <h4 className="font-bn font-black text-slate-850 dark:text-white text-base leading-tight">
                              {language === 'bn' ? bank.name_bn : bank.name_en}
                            </h4>
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs font-bn font-medium mt-1.5 min-w-0">
                              <MapPin size={12} className="shrink-0 text-slate-400" />
                              <span className="truncate">{language === 'bn' ? bank.address_bn : bank.address_en}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs font-bn font-medium mt-1 leading-none">
                              <Clock size={12} className="shrink-0 text-slate-400" />
                              <span>{language === 'bn' ? bank.active_bn : bank.active_en}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions block inside card */}
                        <div className="flex gap-2.5 mt-4">
                          {/* Call Button */}
                          <button
                            type="button"
                            onClick={() => window.open(`tel:${bank.phone.replace(/[^0-9]/g, '')}`, '_self')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bn font-black text-xs py-2.5 px-3 border-0 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 active:scale-95 transition-all cursor-pointer"
                          >
                            <Phone size={13} className="stroke-[2.5]" />
                            <span>{language === 'bn' ? 'সরাসরি কল' : 'Call Now'}</span>
                          </button>

                          {/* Facebook page button */}
                          <button
                            type="button"
                            onClick={() => window.open(bank.fb_link, '_blank')}
                            className="flex-1 bg-[#1877F2] hover:bg-[#166FE5] text-white font-bn font-black text-xs py-2.5 px-3 border-0 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer"
                          >
                            <ExternalLink size={13} className="stroke-[2.5]" />
                            <span>{language === 'bn' ? 'ফেসবুক পেজ' : 'Facebook Page'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Blood Donors List Tab */}
                {bloodTab === 'donors' && (
                  <div className="space-y-4">
                    {/* Groups filters */}
                    <div className="flex flex-wrap gap-1.5 justify-center py-1">
                      {['All', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((grp) => (
                        <button
                          key={`group-filter-${grp}`}
                          type="button"
                          onClick={() => setSelectedGroupFilter(grp)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-display font-black border transition-all cursor-pointer",
                            selectedGroupFilter === grp
                              ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/15"
                              : "bg-slate-50 dark:bg-slate-950 text-slate-650 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 bg-transparent"
                          )}
                        >
                          {grp === 'All' ? (language === 'bn' ? 'সব গ্রুপ' : 'All') : grp}
                        </button>
                      ))}
                    </div>

                    {/* Donors Lists */}
                    <div className="space-y-3.5">
                      {donors
                        .filter(d => selectedGroupFilter === 'All' || d.group === selectedGroupFilter)
                        .map((donor, idx) => (
                          <div
                            key={`donor-${idx}`}
                            className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-[1.8rem] border border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-4 shadow-sm"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              {/* Blood group icon badge */}
                              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 rounded-full border border-rose-100 dark:border-rose-905/30 flex items-center justify-center shrink-0">
                                <span className="font-display font-black text-rose-500 dark:text-rose-455 text-lg">
                                  {donor.group}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <h4 className="font-bn font-black text-slate-850 dark:text-white text-sm leading-tight truncate">
                                  {language === 'bn' ? donor.name_bn : donor.name_en}
                                </h4>
                                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[11px] font-bn font-medium mt-1">
                                  <MapPin size={10} className="shrink-0" />
                                  <span className="truncate">{language === 'bn' ? donor.location_bn : donor.location_en}</span>
                                </div>
                                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[11px] font-bn font-medium mt-0.5">
                                  <Calendar size={10} className="shrink-0" />
                                  <span className="truncate">
                                    {language === 'bn' ? 'সংগ্রহ: ' : 'Last: '}
                                    <span className={cn("font-bold", donor.available ? "text-emerald-500" : "text-amber-500")}>
                                      {language === 'bn' ? donor.last_donation_bn : donor.last_donation_en}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action block */}
                            <button
                              type="button"
                              onClick={() => window.open(`tel:${donor.phone.replace(/[^0-9]/g, '')}`, '_self')}
                              className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white border-0 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/10 shrink-0 cursor-pointer active:scale-90 transition-all"
                              title={`Call ${donor.name_bn}`}
                            >
                              <Phone size={14} className="stroke-[3]" />
                            </button>
                          </div>
                      ))}

                      {donors.filter(d => selectedGroupFilter === 'All' || d.group === selectedGroupFilter).length === 0 && (
                        <div className="text-center py-6 text-slate-405 dark:text-slate-500 font-bn text-xs">
                          {language === 'bn' ? 'এই ব্লাড গ্রুপের জন্য কোনো রক্তদাতা পাওয়া যায়নি।' : 'No donor registered for this blood group.'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Post request or join as donor */}
                {bloodTab === 'request' && (
                  <div className="space-y-6">
                    {/* Active requests view */}
                    <div className="space-y-3">
                      <h4 className="font-bn font-black text-slate-805 dark:text-slate-205 text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <Users size={16} className="text-rose-500" />
                        <span>{language === 'bn' ? 'চলমান রক্তের অনুরোধসমূহ' : 'Latest Blood Requests'}</span>
                      </h4>

                      <div className="space-y-3">
                        {requests.map((req, rIdx) => (
                          <div 
                            key={`req-${rIdx}`}
                            className="bg-rose-50/20 dark:bg-rose-950/10 p-4 rounded-[1.8rem] border border-rose-100/30 dark:border-rose-900/15"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className="bg-red-500 text-white font-display font-black px-2 py-0.5 rounded text-[10px] leading-none select-none">
                                    {req.group}
                                  </span>
                                  <span className="font-bn font-bold text-xs text-rose-600">
                                    {language === 'bn' ? req.b_count_bn : req.b_count_en}
                                  </span>
                                </div>
                                <h5 className="font-bn font-black text-slate-800 dark:text-white text-sm mt-2 truncate">
                                  {language === 'bn' ? req.name_bn : req.name_en}
                                </h5>
                                <p className="font-bn text-xs text-slate-500 dark:text-slate-400 mt-1 min-w-0 flex items-center gap-1.5">
                                  <MapPin size={11} className="text-slate-400 shrink-0" />
                                  <span className="truncate text-slate-700 dark:text-slate-350">{language === 'bn' ? req.hospital_bn : req.hospital_en}</span>
                                </p>
                                <p className="font-bn text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                                  <Clock size={11} className="text-slate-400 shrink-0" />
                                  <span className="font-bold">{language === 'bn' ? req.date_bn : req.date_en}</span>
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => window.open(`tel:${req.phone.replace(/[^0-9]/g, '')}`, '_self')}
                                className="w-10 h-10 bg-rose-500 hover:bg-rose-600 text-white border-0 rounded-xl flex items-center justify-center shadow-md shadow-rose-500/10 shrink-0 cursor-pointer active:scale-90 transition-all"
                              >
                                <Phone size={14} className="stroke-[2.5]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Submit blood request form */}
                    <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-[2.2rem] border border-slate-100 dark:border-slate-850 space-y-4">
                      <h4 className="font-bn font-black text-slate-800 dark:text-slate-205 text-sm flex items-center gap-1.5">
                        <Plus size={16} className="text-emerald-500" />
                        <span>{language === 'bn' ? 'রক্তের জন্য নতুন অনুরোধ' : 'Post Blood Request'}</span>
                      </h4>

                      <form onSubmit={handleAddRequest} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রোগী/আবেদনকারীর নাম' : 'Applicant Name'}</label>
                            <input
                              type="text"
                              value={reqForm.name}
                              onChange={e => setReqForm({...reqForm, name: e.target.value})}
                              placeholder="যেমন: আমিনুল ইসলাম"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'মোবাইল নাম্বার' : 'Contact Phone'}</label>
                            <input
                              type="tel"
                              value={reqForm.phone}
                              onChange={e => setReqForm({...reqForm, phone: e.target.value})}
                              placeholder="017xxxxxxxx"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Group'}</label>
                            <select
                              value={reqForm.group}
                              onChange={e => setReqForm({...reqForm, group: e.target.value})}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-2.5 text-xs font-display font-black outline-none focus:border-rose-45o text-slate-800 dark:text-white"
                            >
                              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(grp => (
                                <option key={grp} value={grp}>{grp}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তের পরিমাণ' : 'Bags Needed'}</label>
                            <input
                              type="text"
                              value={reqForm.count}
                              onChange={e => setReqForm({...reqForm, count: e.target.value})}
                              placeholder="যেমন: ১ ব্যাগ"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-202 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'হাসপাতালের নাম ও ঠিকানা' : 'Hospital Address'}</label>
                          <input
                            type="text"
                            value={reqForm.hospital}
                            onChange={e => setReqForm({...reqForm, hospital: e.target.value})}
                            placeholder="যেমন: শ্রীপুর উপজেলা স্বাস্থ্য কমপ্লেক্স"
                            required
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'কবে প্রয়োজন? (তারিখ/জরুরী)' : 'Date Required'}</label>
                          <input
                            type="text"
                            value={reqForm.date}
                            onChange={e => setReqForm({...reqForm, date: e.target.value})}
                            placeholder="যেমন: আজ রাতে / আগামীকাল দুপুর"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bn font-black border-0 py-3 rounded-xl text-xs shadow-lg shadow-rose-500/15 active:scale-[0.98] transition-all cursor-pointer text-center"
                        >
                          {language === 'bn' ? 'অনুরোধ পোস্ট করুন' : 'Post Urgent Request'}
                        </button>
                      </form>
                    </div>

                    {/* Join as Donor Form */}
                    <div className="bg-slate-50 dark:bg-slate-950/60 p-5 rounded-[2.2rem] border border-slate-100 dark:border-slate-850 space-y-4">
                      <h4 className="font-bn font-black text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                        <Heart size={15} className="text-emerald-500 fill-emerald-500" />
                        <span>{language === 'bn' ? 'রক্তদাতা হিসেবে যুক্ত হোন' : 'Register as Blood Donor'}</span>
                      </h4>

                      <form onSubmit={handleRegisterDonor} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-405 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'আপনার নাম' : 'Full Name'}</label>
                            <input
                              type="text"
                              value={donorForm.name}
                              onChange={e => setDonorForm({...donorForm, name: e.target.value})}
                              placeholder="যেমন: সায়েম রহমান"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-220 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-405 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'মোবাইল নাম্বার' : 'Mobile Phone'}</label>
                            <input
                              type="tel"
                              value={donorForm.phone}
                              onChange={e => setDonorForm({...donorForm, phone: e.target.value})}
                              placeholder="017xxxxxxxx"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-220 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-405 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}</label>
                            <select
                              value={donorForm.group}
                              onChange={e => setDonorForm({...donorForm, group: e.target.value})}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-220 dark:border-slate-800 rounded-xl py-2.5 px-2.5 text-xs font-display font-black outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            >
                              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(grp => (
                                <option key={grp} value={grp}>{grp}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bn text-slate-405 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'শ্রীপুরে আপনার ঠিকানা' : 'Location inside Sreepur'}</label>
                            <input
                              type="text"
                              value={donorForm.location}
                              onChange={e => setDonorForm({...donorForm, location: e.target.value})}
                              placeholder="যেমন: মাওনা বাজার"
                              required
                              className="w-full bg-white dark:bg-slate-900 border border-slate-220 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bn text-slate-405 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'সর্বশেষ রক্তদানের সময় (ঐচ্ছিক)' : 'Last Donation date (Optional)'}</label>
                          <input
                            type="text"
                            value={donorForm.lastDonation}
                            onChange={e => setDonorForm({...donorForm, lastDonation: e.target.value})}
                            placeholder="যেমন: ৪ মাস পূর্বে / কখনই নয়"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-220 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none focus:border-rose-450 text-slate-800 dark:text-white"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bn font-black border-0 py-3 rounded-xl text-xs shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition-all cursor-pointer text-center"
                        >
                          {language === 'bn' ? 'নিবন্ধিত হোন' : 'Join Donor Network'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-101 dark:border-slate-800 shrink-0 text-center text-[10px] text-slate-400 font-bn">
                {language === 'bn' 
                  ? 'রক্তদান একটি মহৎ কাজ। সবার রক্তদান জীবন বাঁচায়।' 
                  : 'Blood donation is a noble act. Your donation saves lives.'}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
