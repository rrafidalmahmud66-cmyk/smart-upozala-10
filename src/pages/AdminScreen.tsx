import { 
  LayoutDashboard, Users, HeartPulse, FileWarning, Settings, Plus, Bell, 
  TrendingUp, ShieldCheck, PieChart as PieChartIcon, BarChart3, ArrowLeft, 
  ChevronRight, Activity, Clock, Search, Filter, ArrowUpDown, CheckCircle2,
  Trash2, Video, Image as ImageIcon, Newspaper, FileText, AlertTriangle, AlertCircle, 
  ChevronDown, ExternalLink, RefreshCw, Loader2, Star, LayoutGrid, Edit2, Pencil, Share2,
  Megaphone, Sparkles, Info, Send, ArrowRight, Compass, Eye, EyeOff, Phone, MapPin, X, ShieldAlert, Sun, Moon,
  Coins, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from '../types';
import { cn, handleShare, getCoordinates } from '../lib/utils';
import { Language, translations } from '../translations';
import { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line, Legend
} from 'recharts';
import { collection, onSnapshot, doc, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, Timestamp, getDocs, where, limit, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, storage } from '../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getDirectImageUrl, getCleanImageUrl, compressAndConvertToBase64 } from '../lib/image-utils';
import NewsCard from '../components/NewsCard';
import MapModal from '../components/MapModal';
import { EXPLORE_CATEGORIES, PROVIDER_CATEGORIES } from '../constants';

export default function AdminScreen({ 
  onNavigate, 
  language = 'bn',
  isDarkMode = false,
  onToggleDarkMode
}: { 
  onNavigate: (s: Screen) => void, 
  language?: Language,
  isDarkMode?: boolean,
  onToggleDarkMode?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MANAGEMENT' | 'NOTIFICATIONS' | 'SETTINGS'>('DASHBOARD');
  const t = translations[language] || translations['bn'];

  const bnToEn = (str: string) => {
    if (!str) return '';
    const digits: any = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return str.replace(/[০-৯]/g, (w) => digits[w]);
  };

  const getNum = (num: string) => language === 'bn' ? num : bnToEn(num);

  const getUnsplashImageByDetails = (category: string, title: string, desc: string) => {
    const textToSearch = `${category} ${title} ${desc}`.toLowerCase();
    
    // Garbage / Waste / Cleanliness
    if (textToSearch.includes('বর্জ্য') || textToSearch.includes('garbage') || textToSearch.includes('waste') || textToSearch.includes('আবর্জনা') || textToSearch.includes('ময়লা')) {
      return 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&w=600&q=80';
    }
    // Roads / Potholes / Drains / Infrastructure
    if (textToSearch.includes('রাস্তা') || textToSearch.includes('road') || textToSearch.includes('pothole') || textToSearch.includes('ড্রেন') || textToSearch.includes('drain') || textToSearch.includes('কাদা') || textToSearch.includes('পানির লাইন')) {
      return 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&w=600&q=80';
    }
    // Water / Supply / Flood / Leaks
    if (textToSearch.includes('পানি') || textToSearch.includes('water') || textToSearch.includes('কল') || textToSearch.includes('সরবরাহ')) {
      return 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?auto=format&fit=crop&w=600&q=80';
    }
    // Electricity / Load shedding / Transformer / Wire
    if (textToSearch.includes('বিদ্যুৎ') || textToSearch.includes('electricity') || textToSearch.includes('তার') || textToSearch.includes('কারেন্ট') || textToSearch.includes('লোডশেডিং') || textToSearch.includes('trans') || textToSearch.includes('খুঁটি')) {
      return 'https://images.unsplash.com/photo-1509395062183-67c5ad6faff9?auto=format&fit=crop&w=600&q=80';
    }
    // Traffic / Jam / Vehicle
    if (textToSearch.includes('যানজট') || textToSearch.includes('traffic') || textToSearch.includes('জ্যাম') || textToSearch.includes('গাড়ি')) {
      return 'https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=600&q=80';
    }
    
    // Default civic / office desk / municipal default
    return 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80';
  };
  const [managementMode, setManagementMode] = useState<'OVERVIEW' | 'USERS' | 'REPORTS' | 'NEWS' | 'SERVICE_HUB' | 'EXPLORE' | 'ABUSE_REPORTS' | 'BLOOD' | 'VERIFICATIONS' | 'WITHDRAWALS'>('OVERVIEW');
  
  // Blood management states
  const [allDonors, setAllDonors] = useState<any[]>([]);
  const [allBloodRequests, setAllBloodRequests] = useState<any[]>([]);
  const [bloodTabMode, setBloodTabMode] = useState<'donors' | 'requests'>('donors');
  const [isAddingBloodDonor, setIsAddingBloodDonor] = useState(false);
  const [editingBloodDonor, setEditingBloodDonor] = useState<any | null>(null);
  const [donorForm, setDonorForm] = useState({
    name_bn: '',
    name_en: '',
    group: 'A+',
    location_bn: '',
    location_en: '',
    phone: '',
    last_donation_bn: '',
    last_donation_en: '',
    available: true
  });

  const [isAddingBloodRequest, setIsAddingBloodRequest] = useState(false);
  const [editingBloodRequest, setEditingBloodRequest] = useState<any | null>(null);
  const [requestForm, setRequestForm] = useState({
    name_bn: '',
    name_en: '',
    group: 'A+',
    hospital_bn: '',
    hospital_en: '',
    phone: '',
    date_bn: '',
    date_en: '',
    b_count_bn: '১ ব্যাগ',
    b_count_en: '1 Bag'
  });
  const [bloodSearchQuery, setBloodSearchQuery] = useState('');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('All');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'emergency' | 'notice' | 'update'>('notice');
  const [isSending, setIsSending] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [allAbuseReports, setAllAbuseReports] = useState<any[]>([]);
  const [allNews, setAllNews] = useState<any[]>([]);
  const [allProviders, setAllProviders] = useState<any[]>([]);
  const [allReviews, setAllReviews] = useState<any[]>([]);
  const [allExploreServices, setAllExploreServices] = useState<any[]>([]);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [allVerifications, setAllVerifications] = useState<any[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<any[]>([]);
  const [allRecharges, setAllRecharges] = useState<any[]>([]);
  const [viewingReviewsFor, setViewingReviewsFor] = useState<string | null>(null);
  const [viewingLocation, setViewingLocation] = useState<{ lat: number, lng: number, address: string, title?: string, subtitle?: string } | null>(null);
  const [isActing, setIsActing] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [appSettings, setAppSettings] = useState<{
    maintenanceMode: boolean;
    appBanner: string;
    systemAlert: string;
    contactEmail: string;
    supportPhone: string;
  }>({
    maintenanceMode: false,
    appBanner: '',
    systemAlert: '',
    contactEmail: 'admin@sreepur.gov.bd',
    supportPhone: '01733373043'
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data() as any);
      }
    });

    return () => unsubSettings();
  }, []);

  const handleUpdateSetting = async (key: string, value: any) => {
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...appSettings,
        [key]: value,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSeedExploreData = async () => {
    if (!window.confirm('আপনি কি হার্ডকোড করা ৬০+টি সেবা ডাটাবেসে মাইগ্রেট করতে চান? এটি একবারই করা উচিত।')) return;
    setIsSeeding(true);
    try {
      const { EXPLORE_DATA } = await import('../data/exploreData');
      let count = 0;
      for (const s of EXPLORE_DATA) {
        await addDoc(collection(db, 'explore_services'), {
          ...s,
          createdAt: serverTimestamp()
        });
        count++;
      }
      alert(`${count}টি সেবা সফলভাবে মাইগ্রেট করা হয়েছে!`);
    } catch (error) {
      console.error(error);
      alert('মাইগ্রেশন এরর হয়েছে');
    } finally {
      setIsSeeding(false);
    }
  };
  
  // Explore Management Controls
  const [exploreSearchQuery, setExploreSearchQuery] = useState('');
  const [exploreCategoryFilter, setExploreCategoryFilter] = useState('ALL');
  const [isAddingExplore, setIsAddingExplore] = useState(false);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [showingMapPickerFor, setShowingMapPickerFor] = useState<'explore' | 'report' | 'provider' | null>(null);
  const [editingExplore, setEditingExplore] = useState<any | null>(null);
  const [exploreFormData, setExploreFormData] = useState({
    title: '',
    bengaliTitle: '',
    category: 'gov',
    subCategory: '',
    shortDescription: '',
    fullDescription: '',
    contactNumber: '',
    hotline: '',
    address: '',
    openingHours: '',
    mapLink: '',
    latitude: 24.2000,
    longitude: 90.4667,
    website: '',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800',
    tags: [] as string[],
    featured: false,
    emergency: false,
    isVisible: true
  });
  const [exploreErrors, setExploreErrors] = useState<Record<string, string>>({});
  const [isUploadingServiceImage, setIsUploadingServiceImage] = useState(false);
  const [serviceImageProgress, setServiceImageProgress] = useState(0);
  const [docInput, setDocInput] = useState('');
  
  // User Management Controls
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  // Report Management Controls
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'pending' | 'resolved' | 'cancelled'>('all');
  const [reportPriorityFilter, setReportPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  // News Management Controls
  const [newsTitle, setNewsTitle] = useState('');
  const [newsDesc, setNewsDesc] = useState('');
  const [newsCategory, setNewsCategory] = useState('সাধারণ');
  const [newsImage, setNewsImage] = useState('');
  const [newsVideoUrl, setNewsVideoUrl] = useState('');
  const [isAddingNews, setIsAddingNews] = useState(false);

  // Provider Management
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [providerFormData, setProviderFormData] = useState({
    name: '',
    category: '',
    subCategory: '',
    phone: '',
    email: '',
    whatsapp: '',
    facebook: '',
    website: '',
    address: '',
    description: '',
    status: 'pending' as 'pending' | 'approved' | 'rejected',
    isVerified: false,
    experience: '',
    serviceCharge: '',
    availableTime: '',
    image: '',
    businessImage: '',
    providerVerification: '',
    location: { lat: 24.2000, lng: 90.4667 } as { lat: number, lng: number } | undefined
  });
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  
  // Real Data State
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    newReports: 0,
    totalReports: 0,
    totalNews: 0,
    totalProviders: 0,
    totalExplore: 0,
    recentActivity: [] as any[]
  });
  const [chartsData, setChartsData] = useState({
    userGrowth: [] as any[],
    serviceUsage: [] as any[],
    reportStatus: [] as any[],
    reportCategories: [] as any[]
  });
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userStats, setUserStats] = useState({
    activeToday: 0,
    newThisWeek: 0,
    adminsCount: 0,
    verifiedCount: 0
  });

  useEffect(() => {
    // Calculate user stats whenever allUsers changes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const activeToday = allUsers.filter(u => {
      const lastLogin = u.lastLoginAt instanceof Timestamp ? u.lastLoginAt.toDate() : new Date(u.lastLoginAt || 0);
      return lastLogin >= today;
    }).length;

    const newThisWeek = allUsers.filter(u => {
      const created = u.createdAt instanceof Timestamp ? u.createdAt.toDate() : new Date(u.createdAt || 0);
      return created >= oneWeekAgo;
    }).length;

    const adminsCount = allUsers.filter(u => u.role === 'admin').length;
    const verifiedCount = allUsers.filter(u => u.emailVerified || u.phoneVerified).length;

    setUserStats({ activeToday, newThisWeek, adminsCount, verifiedCount });
  }, [allUsers]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      onNavigate('AUTH');
      return;
    }

    const isHardcoded = currentUser.email === 'admin@sreepur.gov.bd' || currentUser.email === 'rrafidalmahmud66@gmail.com';
    let active = true;
    let unsubNews: (() => void) | null = null;
    let unsubProviders: (() => void) | null = null;
    let unsubReports: (() => void) | null = null;
    let unsubAbuseReports: (() => void) | null = null;
    let unsubReviews: (() => void) | null = null;
    let unsubExplore: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;
    let unsubNotifications: (() => void) | null = null;
    let unsubDonors: (() => void) | null = null;
    let unsubBloodRequests: (() => void) | null = null;
    let unsubVerifications: (() => void) | null = null;
    let unsubWithdrawals: (() => void) | null = null;
    let unsubRecharges: (() => void) | null = null;

    const initListeners = () => {
      // Initialize real-time synchronization listeners only for authenticated and verified administrators
      unsubDonors = onSnapshot(query(collection(db, 'blood_donors'), orderBy('createdAt', 'desc')), (snap) => {
        setAllDonors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'blood_donors');
      });

      unsubBloodRequests = onSnapshot(query(collection(db, 'blood_requests'), orderBy('createdAt', 'desc')), (snap) => {
        setAllBloodRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'blood_requests');
      });

      unsubNews = onSnapshot(query(collection(db, 'news'), orderBy('createdAt', 'desc')), (snap) => {
        const news = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllNews(news);
        setStats(prev => ({ ...prev, totalNews: news.length }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'news');
      });

      unsubProviders = onSnapshot(query(collection(db, 'providers'), orderBy('createdAt', 'desc')), (snap) => {
        const providers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllProviders(providers);
        setStats(prev => ({ ...prev, totalProviders: providers.length }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'providers');
      });

      unsubReports = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), (snap) => {
        const reports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllReports(reports);
        const pendingCount = reports.filter(r => (r.status || 'pending') === 'pending').length;
        setStats(prev => ({ ...prev, totalReports: reports.length, newReports: pendingCount }));

        // Update charts for report status
        const statusCounts = {
          resolved: reports.filter(r => r.status === 'resolved').length,
          pending: reports.filter(r => (r.status || 'pending') === 'pending').length,
          cancelled: reports.filter(r => r.status === 'cancelled').length
        };

        setChartsData(prev => ({
          ...prev,
          reportStatus: [
            { name: language === 'bn' ? 'সমাধানকৃত' : 'Resolved', value: statusCounts.resolved, color: '#10B981' },
            { name: language === 'bn' ? 'পেন্ডিং' : 'Pending', value: statusCounts.pending, color: '#F59E0B' },
            { name: language === 'bn' ? 'বাতিল' : 'Cancelled', value: statusCounts.cancelled, color: '#EF4444' }
          ]
        }));

        // Update charts for categories
        const categories: Record<string, number> = {};
        reports.forEach(r => {
          const cat = r.category || 'অন্যান্য';
          categories[cat] = (categories[cat] || 0) + 1;
        });
        setChartsData(prev => ({
          ...prev,
          reportCategories: Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 7)
        }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'reports');
      });

      unsubAbuseReports = onSnapshot(query(collection(db, 'abuseReports'), orderBy('createdAt', 'desc')), (snap) => {
        const abuseReports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllAbuseReports(abuseReports);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'abuseReports');
      });

      unsubReviews = onSnapshot(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')), (snap) => {
        setAllReviews(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'reviews');
      });

      unsubExplore = onSnapshot(query(collection(db, 'explore_services'), orderBy('createdAt', 'desc')), (snap) => {
        const explore = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllExploreServices(explore);
        setStats(prev => ({ ...prev, totalExplore: explore.length }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'explore_services');
      });

      unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
        const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setAllUsers(users);
        setStats(prev => ({ ...prev, totalUsers: users.length }));

        // Simple user growth
        const growth = users.slice(0, 10).reverse().map((u, i) => ({
          name: `Day ${i + 1}`,
          count: (i + 1) * 3 + Math.floor(Math.random() * 5)
        }));
        setChartsData(prev => ({ ...prev, userGrowth: growth }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });

      unsubNotifications = onSnapshot(query(collection(db, 'notifications'), orderBy('createdAt', 'desc')), (snap) => {
        setAllNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'notifications');
      });

      unsubVerifications = onSnapshot(query(collection(db, 'verificationRequests'), orderBy('createdAt', 'desc')), (snap) => {
        setAllVerifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        console.warn("Verification requests subscription error:", error);
      });

      unsubWithdrawals = onSnapshot(query(collection(db, 'withdrawalRequests'), orderBy('createdAt', 'desc')), (snap) => {
        setAllWithdrawals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        console.warn("Withdrawal requests subscription error:", error);
      });

      unsubRecharges = onSnapshot(query(collection(db, 'rechargeRequests'), orderBy('createdAt', 'desc')), (snap) => {
        setAllRecharges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]);
      }, (error) => {
        console.warn("Recharge requests subscription error:", error);
      });

      setLoading(false);
    };

    const userRef = doc(db, 'users', currentUser.uid);
    getDoc(userRef).then((snap) => {
      if (!active) return;
      const dbRole = snap.exists() ? snap.data().role : 'user';
      const isUserAdmin = isHardcoded || dbRole === 'admin';

      if (!isUserAdmin) {
        console.error("Permission Denied: User is not an admin.");
        onNavigate('HOME');
        return;
      }

      // Auto-set role to admin in Firestore for hardcoded admins to ensure security rules work
      if (isHardcoded && dbRole !== 'admin') {
        updateDoc(userRef, { role: 'admin' }).catch(err => console.warn("Failed to update admin role in Firestore:", err));
      }

      initListeners();
    }).catch(err => {
      if (!active) return;
      console.warn("Firestore admin document retrieval failed, checking fallback privileges:", err);
      // Fallback: If email is hardcoded, allow immediate admin access even if network/offline issues blockFirestore reads
      if (isHardcoded) {
        console.log("Offline bypass: allowing hardcoded admin to proceed.");
        initListeners();
      } else {
        console.error("Failed to authenticate admin session doc", err);
        onNavigate('HOME');
      }
    });

    return () => {
      active = false;
      if (unsubNews) unsubNews();
      if (unsubProviders) unsubProviders();
      if (unsubReports) unsubReports();
      if (unsubAbuseReports) unsubAbuseReports();
      if (unsubReviews) unsubReviews();
      if (unsubExplore) unsubExplore();
      if (unsubUsers) unsubUsers();
      if (unsubNotifications) unsubNotifications();
      if (unsubDonors) unsubDonors();
      if (unsubBloodRequests) unsubBloodRequests();
      if (unsubVerifications) unsubVerifications();
      if (unsubWithdrawals) unsubWithdrawals();
      if (unsubRecharges) unsubRecharges();
    };
  }, [language]);

  // Derive recent activity from aggregated data
  useEffect(() => {
    const activity: any[] = [];
    
    // Last 3 reports
    allReports.slice(0, 3).forEach((r, idx) => {
      activity.push({
        id: `report-${r.id}-${idx}`,
        user: r.userName || 'গোপন ইউজার',
        time: r.createdAt instanceof Timestamp ? r.createdAt.toDate() : new Date(),
        action: language === 'bn' ? 'একটি নতুন রিপোর্ট করেছেন' : 'submitted a new report',
        icon: FileWarning,
        color: 'text-orange-500'
      });
    });

    // Last 3 new users
    allUsers.slice(0, 3).forEach((u, idx) => {
      activity.push({
        id: `user-${u.id}-${idx}`,
        user: u.name || 'নতুন মেম্বার',
        time: u.createdAt instanceof Timestamp ? u.createdAt.toDate() : new Date(),
        action: language === 'bn' ? 'সিস্টেমে জয়েন করেছেন' : 'joined the system',
        icon: Users,
        color: 'text-blue-500'
      });
    });

    // Sort by time
    const sortedActivity = activity.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6);
    setStats(prev => ({ ...prev, recentActivity: sortedActivity }));
  }, [allReports, allUsers, language]);

  const handleSendNotification = async () => {
    if (!notifTitle || !notifMessage) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title: notifTitle,
        message: notifMessage,
        type: notifType,
        createdAt: serverTimestamp(),
        sentBy: auth.currentUser?.uid,
        important: notifType === 'emergency'
      });
      alert(language === 'bn' ? 'সফলভাবে ঘোষণা পাঠানো হয়েছে!' : 'Announcement sent successfully!');
      setNotifTitle('');
      setNotifMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'notifications');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'NOTIFICATIONS') {
      setIsLoadingNotifs(true);
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(10));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setRecentNotifs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setIsLoadingNotifs(false);
      }, (err) => {
        console.error("Error fetching recent notifications:", err);
        setIsLoadingNotifs(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleUpdateRole = async (userId: string, newRole: 'user' | 'admin') => {
    setIsActing(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setIsActing(null);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = (currentStatus || 'active') === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive' && !window.confirm('আপনি কি নিশ্চিত যে এই ইউজারকে ডিঅ্যাক্টিভেট করতে চান?')) return;
    
    setIsActing(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই ইউজারকে স্থায়ীভাবে মুছে ফেলতে চান? এটি আর ফিরিয়ে আনা যাবে না। সংশ্লিষ্ট সকল সার্ভিস প্রোভাইডার তথ্যও মুছে যাবে।')) return;
    setIsActing(userId);
    try {
      // Cascade delete providers
      const providersQuery = query(collection(db, 'providers'), where('userId', '==', userId));
      const providersSnap = await getDocs(providersQuery);
      for (const pDoc of providersSnap.docs) {
        await deleteDoc(doc(db, 'providers', pDoc.id));
      }

      await deleteDoc(doc(db, 'users', userId));
      setSelectedUser(null);
      alert('ইউজার এবং তার সকল সংশ্লিষ্ট সার্ভিস সফলভাবে মুছে ফেলা হয়েছে!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, newStatus: 'resolved' | 'pending' | 'cancelled') => {
    setIsActing(reportId);
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: newStatus, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateAbuseReportStatus = async (reportId: string, newStatus: 'pending' | 'reviewed' | 'resolved') => {
    setIsActing(reportId);
    try {
      const reportRef = doc(db, 'abuseReports', reportId);
      await updateDoc(reportRef, { status: newStatus, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `abuseReports/${reportId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteAbuseReport = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে এই রিপোর্টটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this abuse report?')) return;
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'abuseReports', id));
      alert(language === 'bn' ? 'রিপোর্টটি সফলভাবে মুছে ফেলা হয়েছে!' : 'Abuse report deleted successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `abuseReports/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateReportPriority = async (reportId: string, newPriority: string) => {
    setIsActing(reportId);
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { priority: newPriority, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে এই অভিযোগটি স্থায়ীভাবে মুছে ফেলতে চান?' : 'Are you sure you want to delete this report permanently?')) return;
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'reports', id));
      alert(language === 'bn' ? 'অভিযোগটি সফলভাবে মুছে ফেলা হয়েছে!' : 'Report deleted successfully!');
    } catch (error) {
      console.error("Delete error:", error);
      handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleClearAllReports = async () => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে সকল অভিযোগ মুছে ফেলতে চান? এটি আর ফিরিয়ে আনা যাবে না!' : 'Are you sure you want to clear ALL reports? This cannot be undone!')) return;
    
    setIsActing('clearing_all');
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const batch: any[] = [];
      snap.forEach(d => {
        batch.push(deleteDoc(doc(db, 'reports', d.id)));
      });
      await Promise.all(batch);
      alert(language === 'bn' ? 'সকল অভিযোগ সফলভাবে পরিষ্কার করা হয়েছে!' : 'All reports cleared successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'reports/all');
    } finally {
      setIsActing(null);
    }
  };

  const extractYoutubeId = (url: string) => {
    const regExp = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
    const match = url?.match(regExp);
    return (match && match[1]) ? match[1] : null;
  };

  const handleAddNews = async () => {
    if (!newsTitle || !newsDesc) return;
    setIsAddingNews(true);
    try {
      let finalThumbnail = '';
      const youtubeId = extractYoutubeId(newsVideoUrl);
      
      if (youtubeId) {
        finalThumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
      }

      await addDoc(collection(db, 'news'), {
        title: newsTitle,
        description: newsDesc,
        category: newsCategory,
        image: newsImage || 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&q=80&w=800',
        thumbnail: finalThumbnail,
        videoUrl: newsVideoUrl,
        createdAt: serverTimestamp(),
        authorId: auth.currentUser?.uid || 'system'
      });

      setNewsTitle('');
      setNewsDesc('');
      setNewsCategory('সাধারণ');
      setNewsImage('');
      setNewsVideoUrl('');
      alert('খবর সফলভাবে যোগ করা হয়েছে!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'news');
    } finally {
      setIsAddingNews(false);
    }
  };

  const handleDeleteNews = async (id: string) => {
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'news', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `news/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateProviderStatus = async (id: string, newStatus: 'approved' | 'rejected' | 'pending', isVerified?: boolean) => {
    setIsActing(id);
    try {
      const providerRef = doc(db, 'providers', id);
      const updates: any = { status: newStatus };
      if (isVerified !== undefined) updates.isVerified = isVerified;
      await updateDoc(providerRef, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `providers/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই প্রোভাইডারকে স্থায়ীভাবে মুছে ফেলতে চান?')) return;
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'providers', id));
      alert('সফলভাবে মুছে ফেলা হয়েছে!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `providers/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleEditProvider = (provider: any) => {
    setEditingProvider(provider);
    setProviderFormData({
      name: provider.name || '',
      category: provider.category || '',
      subCategory: provider.subCategory || '',
      phone: provider.phone || '',
      address: provider.address || '',
      description: provider.description || '',
      status: provider.status || 'pending',
      isVerified: provider.isVerified || false,
      email: provider.email || '',
      whatsapp: provider.whatsapp || '',
      facebook: provider.facebook || '',
      website: provider.website || '',
      experience: provider.experience || '',
      serviceCharge: provider.serviceCharge || '',
      availableTime: provider.availableTime || '',
      image: provider.image || '',
      businessImage: provider.businessImage || '',
      providerVerification: provider.providerVerification || '',
      location: getCoordinates(provider.location) || { lat: 24.2000, lng: 90.4667 }
    });
  };

  const handleSaveProvider = async () => {
    if (!editingProvider && !isAddingProvider) return;
    setIsActing('saving_provider');
    try {
      if (editingProvider) {
        await updateDoc(doc(db, 'providers', editingProvider.id), {
          ...providerFormData,
          updatedAt: serverTimestamp()
        });
        alert('প্রোভাইডার তথ্য সফলভাবে আপডেট করা হয়েছে!');
      } else {
        await addDoc(collection(db, 'providers'), {
          ...providerFormData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          userId: auth.currentUser?.uid || 'admin',
          rating: 5,
          reviewCount: 0
        });
        alert('নতুন প্রোভাইডার সফলভাবে যোগ করা হয়েছে!');
      }
      setEditingProvider(null);
      setIsAddingProvider(false);
      setProviderFormData({
        name: '',
        category: '',
        subCategory: '',
        phone: '',
        email: '',
        whatsapp: '',
        facebook: '',
        website: '',
        address: '',
        description: '',
        status: 'approved',
        isVerified: false,
        experience: '',
        serviceCharge: '',
        availableTime: '',
        image: '',
        businessImage: '',
        providerVerification: '',
        location: { lat: 24.2000, lng: 90.4667 }
      });
    } catch (error) {
      if (editingProvider) {
        handleFirestoreError(error, OperationType.UPDATE, `providers/${editingProvider.id}`);
      } else {
        handleFirestoreError(error, OperationType.CREATE, 'providers');
      }
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই রিভিউটি মুছে ফেলতে চান?')) return;
    setIsActing(reviewId);
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      setAllReviews(prev => prev.filter(r => r.id !== reviewId));
      alert('রিভিউ সফলভাবে মুছে ফেলা হয়েছে!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reviews/${reviewId}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateExploreVisibility = async (id: string, isVisible: boolean) => {
    setIsActing('updating_visibility');
    try {
      await updateDoc(doc(db, 'explore_services', id), { isVisible: !isVisible });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `explore_services/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteExplore = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই সেবাটি স্থায়ীভাবে মুছে ফেলতে চান?')) return;
    
    setIsActing('deleting_explore');
    try {
      await deleteDoc(doc(db, 'explore_services', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `explore_services/${id}`);
    } finally {
      setIsActing(null);
    }
  };

  const handleUploadServiceImage = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(language === 'bn' ? 'দয়া করে একটি ছবি নির্বাচন করুন' : 'Please select an image file');
      return;
    }

    setIsUploadingServiceImage(true);
    setServiceImageProgress(0);

    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `explore_services/${fileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      const storagePromise = new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setServiceImageProgress(Math.round(progress));
          },
          (error) => reject(error),
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      const withTimeout = (promise: Promise<string>, timeoutMs: number): Promise<string> => {
        return Promise.race([
          promise,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
        ]);
      };

      // Set a 6 second timeout for Firebase Storage, otherwise fall back to highly compressed Base64
      const downloadURL = await withTimeout(storagePromise, 6000);
      setExploreFormData(prev => ({ ...prev, image: downloadURL }));
      setIsUploadingServiceImage(false);
    } catch (error) {
      console.warn("Storage upload failed or timed out for service image, falling back to compressed base64:", error);
      try {
        setServiceImageProgress(50);
        // Compress to 600px max width and 0.55 quality to ensure it is very small (~30-50KB) and saves perfectly in Firestore
        const base64Url = await compressAndConvertToBase64(file, 600, 0.55);
        setServiceImageProgress(100);
        setExploreFormData(prev => ({ ...prev, image: base64Url }));
      } catch (err) {
        console.error("Base64 fallback failed:", err);
        alert(language === 'bn' ? 'ছবি প্রসেস করতে ব্যর্থ হয়েছে!' : 'Failed to process image!');
      } finally {
        setIsUploadingServiceImage(false);
      }
    }
  };

  const handleSaveExplore = async () => {
    const errors: Record<string, string> = {};
    if (!exploreFormData.title.trim()) errors.title = 'English title is required';
    if (!exploreFormData.bengaliTitle.trim()) errors.bengaliTitle = 'Bengali title is required';
    
    if (Object.keys(errors).length > 0) {
      setExploreErrors(errors);
      return;
    }

    setExploreErrors({});
    setIsActing('saving_explore');
    try {
      if (editingExplore) {
        await updateDoc(doc(db, 'explore_services', editingExplore.id), {
          ...exploreFormData,
          updatedAt: serverTimestamp()
        });
        alert('সেবা সফলভাবে আপডেট করা হয়েছে!');
      } else {
        await addDoc(collection(db, 'explore_services'), {
          ...exploreFormData,
          createdAt: serverTimestamp()
        });
        alert('নতুন সেবা সফলভাবে যোগ করা হয়েছে!');
      }
      setIsAddingExplore(false);
      setEditingExplore(null);
      setExploreErrors({});
      setExploreFormData({
        title: '',
        bengaliTitle: '',
        category: 'gov',
        subCategory: '',
        shortDescription: '',
        fullDescription: '',
        contactNumber: '',
        hotline: '',
        address: '',
        openingHours: '',
        mapLink: '',
        latitude: 24.2000,
        longitude: 90.4667,
        website: '',
        image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800',
        tags: [],
        featured: false,
        emergency: false,
        isVisible: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'explore_services');
    } finally {
      setIsActing(null);
    }
  };

  const handleSaveBloodDonor = async () => {
    if (!donorForm.name_bn || !donorForm.phone || !donorForm.location_bn) {
      alert(language === 'bn' ? 'দয়া করে সব প্রয়োজনীয় তথ্য পূরণ করুন' : 'Please fill all required fields');
      return;
    }
    setIsActing('saving_donor');
    try {
      if (editingBloodDonor) {
        await updateDoc(doc(db, 'blood_donors', editingBloodDonor.id), {
          ...donorForm,
          updatedAt: serverTimestamp()
        });
        alert(language === 'bn' ? 'রক্তদাতার তথ্য সফলভাবে আপডেট করা হয়েছে!' : 'Donor info updated successfully!');
      } else {
        await addDoc(collection(db, 'blood_donors'), {
          ...donorForm,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          available: true
        });
        alert(language === 'bn' ? 'নতুন রক্তদাতা সফলভাবে যোগ করা হয়েছে!' : 'New donor added successfully!');
      }
      setIsAddingBloodDonor(false);
      setEditingBloodDonor(null);
      setDonorForm({
        name_bn: '',
        name_en: '',
        group: 'A+',
        location_bn: '',
        location_en: '',
        phone: '',
        last_donation_bn: '',
        last_donation_en: '',
        available: true
      });
    } catch (error) {
      console.error(error);
      alert('Error saving donor');
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteBloodDonor = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে এই রক্তদাতাকে তালিকা থেকে বাদ দিতে চান?' : 'Are you sure you want to delete this donor?')) return;
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'blood_donors', id));
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(null);
    }
  };

  const handleUpdateDonorAvailability = async (id: string, currentAvailable: boolean) => {
    try {
      await updateDoc(doc(db, 'blood_donors', id), {
        available: !currentAvailable,
        last_donation_bn: !currentAvailable ? (language === 'bn' ? 'এখনই প্রস্তুত' : 'Ready now') : (language === 'bn' ? 'অনুপযুক্ত' : 'Unavailable'),
        last_donation_en: !currentAvailable ? 'Ready now' : 'Unavailable'
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveBloodRequest = async () => {
    if (!requestForm.name_bn || !requestForm.phone || !requestForm.hospital_bn) {
      alert(language === 'bn' ? 'দয়া করে সব প্রয়োজনীয় তথ্য পূরণ করুন' : 'Please fill all required fields');
      return;
    }
    setIsActing('saving_request');
    try {
      if (editingBloodRequest) {
        await updateDoc(doc(db, 'blood_requests', editingBloodRequest.id), {
          ...requestForm,
          updatedAt: serverTimestamp()
        });
        alert(language === 'bn' ? 'অনুরোধটি সফলভাবে আপডেট করা হয়েছে!' : 'Request updated successfully!');
      } else {
        await addDoc(collection(db, 'blood_requests'), {
          ...requestForm,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        alert(language === 'bn' ? 'নতুন অনুরোধ সফলভাবে যোগ করা হয়েছে!' : 'New request submitted successfully!');
      }
      setIsAddingBloodRequest(false);
      setEditingBloodRequest(null);
      setRequestForm({
        name_bn: '',
        name_en: '',
        group: 'A+',
        hospital_bn: '',
        hospital_en: '',
        phone: '',
        date_bn: '',
        date_en: '',
        b_count_bn: '১ ব্যাগ',
        b_count_en: '1 Bag'
      });
    } catch (error) {
      console.error(error);
      alert('Error saving request');
    } finally {
      setIsActing(null);
    }
  };

  const handleDeleteBloodRequest = async (id: string) => {
    if (!window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে এই অনুরোধটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this request?')) return;
    setIsActing(id);
    try {
      await deleteDoc(doc(db, 'blood_requests', id));
    } catch (error) {
      console.error(error);
    } finally {
      setIsActing(null);
    }
  };

  const sortedAndFilteredUsers = allUsers
    .filter(user => {
      const matchesSearch = 
        (user.name?.toLowerCase() || '').includes(userSearchQuery.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(userSearchQuery.toLowerCase()) ||
        (user.id?.toLowerCase() || '').includes(userSearchQuery.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || (user.status || 'active') === statusFilter;
      
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      const key = sortConfig.key;
      let valA: any = a[key];
      let valB: any = b[key];

      if (key === 'createdAt') {
        valA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        valB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      } else if (key === 'status') {
        valA = a.status || 'active';
        valB = b.status || 'active';
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const toggleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleApproveVerification = async (req: any) => {
    try {
      await updateDoc(doc(db, 'verificationRequests', req.id), { status: 'approved' });
      const userRef = doc(db, 'users', req.userId);
      const vLat = Number(req.details?.lat || req.lat || 0);
      const vLng = Number(req.details?.lng || req.lng || 0);
      const vAddress = req.details?.address || req.address || '';
      const vPhone = req.details?.phone || req.phone || '';
      const vNid = req.details?.nid || req.nid || '';

      if (req.type === 'seller') {
        const vBusinessName = req.details?.businessName || req.businessName || '';
        await setDoc(userRef, { 
          isSeller: 'approved', 
          sellerBalance: 0,
          lat: vLat,
          lng: vLng,
          address: vAddress,
          phone: vPhone,
          nid: vNid,
          businessName: vBusinessName,
          updatedAt: new Date()
        }, { merge: true });
      } else {
        const vVehicleType = req.details?.vehicleType || req.vehicleType || 'Bicycle';
        await setDoc(userRef, { 
          isRider: 'approved', 
          riderBalance: 0,
          lat: vLat,
          lng: vLng,
          address: vAddress,
          phone: vPhone,
          nid: vNid,
          vehicleType: vVehicleType,
          updatedAt: new Date()
        }, { merge: true });
      }
      alert(language === 'bn' ? 'আবেদনটি সফলভাবে অনুমোদন করা হয়েছে!' : 'Application successfully approved!');
    } catch (e) {
      console.error(e);
      alert('Error updating application');
    }
  };

  const handleRejectVerification = async (req: any) => {
    try {
      await updateDoc(doc(db, 'verificationRequests', req.id), { status: 'rejected' });
      const userRef = doc(db, 'users', req.userId);
      if (req.type === 'seller') {
        await updateDoc(userRef, { isSeller: 'none' });
      } else {
        await updateDoc(userRef, { isRider: 'none' });
      }
      alert(language === 'bn' ? 'আবেদনটি প্রত্যাখ্যান করা হয়েছে।' : 'Application rejected.');
    } catch (e) {
      console.error(e);
      alert('Error updating application');
    }
  };

  const handleApproveRecharge = async (req: any) => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new Error(language === 'bn' ? "রিচার্জ আবেদনে কোনো ইউজার আইডি পাওয়া যায়নি।" : "No userId in recharge request");
      }
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const amountToAdd = Number(req.amount || 0);

      if (userSnap.exists()) {
        const currentBalance = Number(userSnap.data().walletBalance || 0);
        await updateDoc(userRef, { walletBalance: currentBalance + amountToAdd });
      } else {
        await setDoc(userRef, {
          uid: userId,
          walletBalance: amountToAdd,
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date()
        }, { merge: true });
      }

      await updateDoc(doc(db, 'rechargeRequests', req.id), { status: 'approved' });
      alert(language === 'bn' ? 'রিচার্জ অনুমোদন করা হয়েছে এবং ওয়ালেট ব্যালেন্স যোগ করা হয়েছে!' : 'Recharge approved and wallet balance updated!');
    } catch (e: any) {
      console.error(e);
      alert(language === 'bn' ? `রিচার্জ অনুমোদন করতে ব্যর্থ হয়েছে: ${e.message || e}` : `Error approving recharge: ${e.message || e}`);
    }
  };

  const handleRejectRecharge = async (req: any) => {
    try {
      await updateDoc(doc(db, 'rechargeRequests', req.id), { status: 'rejected' });
      alert(language === 'bn' ? 'রিচার্জ আবেদন বাতিল করা হয়েছে।' : 'Recharge application rejected.');
    } catch (e) {
      console.error(e);
      alert('Error rejecting recharge');
    }
  };

  const handleApproveWithdrawal = async (req: any) => {
    try {
      await updateDoc(doc(db, 'withdrawalRequests', req.id), { status: 'approved' });
      
      // If NOT pre-deducted, deduct it now (backwards compatibility for legacy requests)
      if (!req.isDeducted) {
        const userId = req.userId;
        if (userId) {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          const withdrawAmt = Number(req.amount || 0);
          
          if (userSnap.exists()) {
            if (req.userType === 'seller') {
              const currentBal = Number(userSnap.data().sellerBalance || 0);
              await updateDoc(userRef, { sellerBalance: Math.max(0, currentBal - withdrawAmt) });
            } else {
              const currentBal = Number(userSnap.data().riderBalance || 0);
              await updateDoc(userRef, { riderBalance: Math.max(0, currentBal - withdrawAmt) });
            }
          }
        }
      }
      
      alert(language === 'bn' ? 'উত্তোলন অনুমোদন করা হয়েছে!' : 'Withdrawal approved!');
    } catch (e) {
      console.error(e);
      alert('Error approving withdrawal');
    }
  };

  const handleRejectWithdrawal = async (req: any) => {
    try {
      await updateDoc(doc(db, 'withdrawalRequests', req.id), { status: 'rejected' });
      
      // If it WAS pre-deducted, we must refund (add back) the amount to the user's balance!
      if (req.isDeducted) {
        const userId = req.userId;
        if (userId) {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          const refundAmt = Number(req.amount || 0);
          
          if (userSnap.exists()) {
            if (req.userType === 'seller') {
              const currentBal = Number(userSnap.data().sellerBalance || 0);
              await updateDoc(userRef, { sellerBalance: currentBal + refundAmt });
            } else {
              const currentBal = Number(userSnap.data().riderBalance || 0);
              await updateDoc(userRef, { riderBalance: currentBal + refundAmt });
            }
          }
        }
      }
      
      alert(language === 'bn' ? 'উত্তোলন বাতিল করা হয়েছে এবং ব্যালেন্স ফেরত দেওয়া হয়েছে।' : 'Withdrawal rejected and balance refunded.');
    } catch (e) {
      console.error(e);
      alert('Error rejecting withdrawal');
    }
  };

  return (
    <div className="px-6 pb-24 h-full overflow-y-auto scrollbar-hide max-w-[1600px] mx-auto w-full pt-4">
      <div className="mt-4 mb-8">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            {activeTab !== 'MANAGEMENT' ? (
              <button 
                onClick={() => setActiveTab('MANAGEMENT')}
                className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                title={language === 'bn' ? 'ম্যানেজমেন্টে ফিরে যান' : 'Back to Management'}
              >
                <ArrowLeft size={18} />
              </button>
            ) : managementMode !== 'OVERVIEW' ? (
              <button 
                onClick={() => setManagementMode('OVERVIEW')}
                className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                title={language === 'bn' ? 'ওভারভিউতে ফিরে যান' : 'Back to Overview'}
              >
                <ArrowLeft size={18} />
              </button>
            ) : null}
            <div>
              <h2 className="text-3xl font-display font-bold text-slate-800 dark:text-white tracking-tight">
                {activeTab === 'DASHBOARD' ? t.titles.adminDashboard : 
                 activeTab === 'NOTIFICATIONS' ? t.titles.sendNotification : 
                 activeTab === 'SETTINGS' ? (language === 'bn' ? 'সেটিংস' : 'Settings') : 
                 t.titles.managementPanel}
              </h2>
              <p className="text-muted font-bn mt-1 italic">
                {activeTab === 'DASHBOARD' ? t.titles.analyticsSummary : 
                 activeTab === 'NOTIFICATIONS' ? t.titles.notificationSubtitle : 
                 activeTab === 'SETTINGS' ? (language === 'bn' ? 'অ্যাডমিন প্যানেল সেটিংস ও কনফিগারেশন' : 'Admin panel settings and configuration') :
                 t.titles.managementSubtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('HOME')}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl font-bn font-black text-xs transition-all flex items-center gap-2 border border-rose-200/50 dark:border-rose-900/35 hover:-translate-y-0.5 active:translate-y-0"
              title={language === 'bn' ? 'ইউজার অ্যাপে ফিরে যান' : 'View User App'}
            >
              <ArrowLeft size={14} className="stroke-[3]" />
              <span>{language === 'bn' ? 'ইউজার অ্যাপ' : 'User App'}</span>
            </button>
            {onToggleDarkMode && (
              <button 
                onClick={onToggleDarkMode}
                className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-750 soft-shadow flex items-center justify-center transition-all active:scale-95 hover:bg-slate-50 dark:hover:bg-slate-700"
                title={language === 'bn' ? 'ডার্ক মোড টগল করুন' : 'Toggle Dark Mode'}
              >
                {isDarkMode ? <Sun size={20} className="text-amber-500" /> : <Moon size={20} className="text-slate-600" />}
              </button>
            )}
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className={cn(
                "w-12 h-12 rounded-2xl soft-shadow flex items-center justify-center transition-all border",
                activeTab === 'SETTINGS' 
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/30" 
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              )}
              title={language === 'bn' ? 'সেটিংস' : 'Settings'}
            >
              <Settings size={22} />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 mb-8 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[2rem] w-full border border-slate-200 dark:border-slate-700/50 soft-shadow">
        {[
          { id: 'DASHBOARD', label: t.titles.dashboard, icon: LayoutDashboard },
          { id: 'MANAGEMENT', label: t.titles.management, icon: ShieldCheck },
          { id: 'NOTIFICATIONS', label: t.titles.notificationTab, icon: Bell },
          { id: 'SETTINGS', label: language === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex-1 py-3 px-2 rounded-2xl font-bn font-bold text-sm transition-all flex items-center justify-center gap-2 text-center",
              activeTab === tab.id 
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-md shadow-slate-200/50 dark:shadow-none" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'MANAGEMENT' ? (
          <motion.div
            key="management"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8 pb-10"
          >
            {managementMode === 'OVERVIEW' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AdminActionItem
                  icon={Users}
                  title={t.admin.manageUsers}
                  desc={t.admin.manageUsersDesc}
                  onClick={() => setManagementMode('USERS')}
                  color="bg-blue-500"
                />
                <AdminActionItem
                  icon={FileWarning}
                  title={t.admin.manageReports}
                  desc={t.admin.manageReportsDesc}
                  onClick={() => setManagementMode('REPORTS')}
                  color="bg-orange-500"
                />
                <AdminActionItem
                  icon={Newspaper}
                  title={t.admin.manageNews}
                  desc={t.admin.manageNewsDesc}
                  onClick={() => setManagementMode('NEWS')}
                  color="bg-emerald-500"
                />
                <AdminActionItem
                  icon={HeartPulse}
                  title={t.admin.manageProviders}
                  desc={t.admin.manageProvidersDesc}
                  onClick={() => setManagementMode('SERVICE_HUB')}
                  color="bg-pink-500"
                />
                <AdminActionItem
                  icon={LayoutGrid}
                  title={language === 'bn' ? 'ডিরেক্টরি ও সেবা ম্যানেজমেন্ট' : 'Explore & Directory Management'}
                  desc={language === 'bn' ? 'তথ্য ও সেবা গাইডবুক ডিরেক্টরি পরিচালনা করুন' : 'Manage informational service directory catalog'}
                  onClick={() => setManagementMode('EXPLORE')}
                  color="bg-violet-500"
                />
                <AdminActionItem
                  icon={ShieldAlert}
                  title={language === 'bn' ? 'আপত্তিজনক কন্টেন্ট ও আচরণ' : 'Abuse & Content Reports'}
                  desc={language === 'bn' ? 'নাগরিকদের পাঠানো রিপোর্ট মডারেশন করুন' : 'Moderate abuse reports submitted by citizens'}
                  onClick={() => setManagementMode('ABUSE_REPORTS')}
                  color="bg-rose-500"
                />
                <AdminActionItem
                  icon={HeartPulse}
                  title={language === 'bn' ? 'ব্লাড ম্যানেজমেন্ট' : 'Blood Management'}
                  desc={language === 'bn' ? 'জরুরী রক্তদাতা এবং রক্তের অনুরোধসমূহ পরিচালনা করুন' : 'Manage emergency blood donors and request listings'}
                  onClick={() => setManagementMode('BLOOD')}
                  color="bg-red-500"
                />
                <AdminActionItem
                  icon={ShieldCheck}
                  title={language === 'bn' ? 'মার্কেটপ্লেস যাচাইকরণ' : 'Marketplace Verifications'}
                  desc={language === 'bn' ? 'উদ্যোক্তা ও রাইডার আবেদনসমূহ যাচাই করুন' : 'Review and approve seller and rider applications'}
                  onClick={() => setManagementMode('VERIFICATIONS')}
                  color="bg-amber-500"
                />
                <AdminActionItem
                  icon={Coins}
                  title={language === 'bn' ? 'উত্তোলন ও রিচার্জ অনুরোধ' : 'Withdrawals & Recharges'}
                  desc={language === 'bn' ? 'উদ্যোক্তা ও রাইডারদের পেমেন্ট ও রিচার্জ অনুরোধ সম্পন্ন করুন' : 'Manage withdrawal and wallet recharge requests'}
                  onClick={() => setManagementMode('WITHDRAWALS')}
                  color="bg-emerald-500"
                />
              </div>
            ) : managementMode === 'USERS' ? (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">ইউজার এডমিনিস্ট্রেশন</h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">নিবন্ধিত নাগরিক ও মডারেটর</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="flex -space-x-3 mr-2">
                       {allUsers.slice(0, 4).map((u, i) => (
                         <div key={i} className="w-10 h-10 rounded-full border-[3px] border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-black overflow-hidden shadow-sm relative z-[10]">
                            {u.name ? <span className="text-primary">{u.name[0]}</span> : <Users size={12} />}
                         </div>
                       ))}
                       {allUsers.length > 4 && (
                         <div className="w-10 h-10 rounded-full border-[3px] border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-600 shadow-sm relative z-[0]">
                           +{getNum(String(allUsers.length - 4))}
                         </div>
                       )}
                     </div>
                     <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest border border-primary/20">
                        মোট {getNum(allUsers.length.toString())} সদস্য
                     </div>
                  </div>
                </div>

                {/* User Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50 soft-shadow hover:border-blue-500/20 transition-all group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:rotate-12 transition-transform shrink-0">
                          <Activity size={20} />
                        </div>
                        <span className="text-[11px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">আজ অ্যাক্টিভ</span>
                      </div>
                      <p className="text-3xl font-display font-black text-slate-900 dark:text-white leading-none">{getNum(userStats.activeToday.toString())}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50 soft-shadow hover:border-primary/20 transition-all group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:rotate-12 transition-transform shrink-0">
                          <Plus size={20} />
                        </div>
                        <span className="text-[11px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">নতুন (সপ্তাহ)</span>
                      </div>
                      <p className="text-3xl font-display font-black text-slate-900 dark:text-white leading-none">{getNum(userStats.newThisWeek.toString())}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50 soft-shadow hover:border-amber-500/20 transition-all group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:rotate-12 transition-transform shrink-0">
                          <ShieldCheck size={20} />
                        </div>
                        <span className="text-[11px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">মোট অ্যাডমিন</span>
                      </div>
                      <p className="text-3xl font-display font-black text-slate-900 dark:text-white leading-none">{getNum(userStats.adminsCount.toString())}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50 soft-shadow hover:border-emerald-500/20 transition-all group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:rotate-12 transition-transform shrink-0">
                          <CheckCircle2 size={20} />
                        </div>
                        <span className="text-[11px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">ভেরিফাইড</span>
                      </div>
                      <p className="text-3xl font-display font-black text-slate-900 dark:text-white leading-none">{getNum(userStats.verifiedCount.toString())}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 soft-shadow overflow-hidden p-6 md:p-8">
                  {/* Search & Filters */}
                  <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                      <input 
                        type="text"
                        placeholder={t.admin.userSearchPlaceholder}
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-14 pr-12 outline-none focus:border-primary/20 transition-all font-bn text-sm font-black shadow-inner"
                      />
                      {userSearchQuery && (
                        <button 
                          onClick={() => setUserSearchQuery('')}
                          className="absolute right-5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <div className="relative group/sel flex-1 md:flex-initial">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within/sel:text-primary transition-colors">
                          <Filter size={16} />
                        </div>
                        <select 
                          value={roleFilter}
                          onChange={(e) => setRoleFilter(e.target.value as any)}
                          className="w-full md:min-w-[140px] bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-12 pr-10 outline-none font-bn text-sm font-black cursor-pointer appearance-none focus:border-primary/20 transition-all shadow-inner"
                        >
                          {t.admin.roleFilters.map((role: any) => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                           <ChevronDown size={14} />
                        </div>
                      </div>
                      <div className="relative group/sel flex-1 md:flex-initial">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within/sel:text-primary transition-colors">
                          <Activity size={16} />
                        </div>
                        <select 
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as any)}
                          className="w-full md:min-w-[150px] bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-12 pr-10 outline-none font-bn text-sm font-black cursor-pointer appearance-none focus:border-primary/20 transition-all shadow-inner"
                        >
                          {t.admin.statusFilters.map((status: any) => (
                            <option key={status.value} value={status.value}>{status.label}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                           <ChevronDown size={14} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto scrollbar-hide -mx-8 px-8">
                    <div className="min-w-[1000px]">
                      <div className="grid grid-cols-12 gap-6 pb-6 px-4 text-[10px] font-bn font-black text-slate-400 uppercase tracking-[0.2em] items-center border-b border-slate-50 dark:border-slate-700/50">
                        <div className={cn(
                          "col-span-1 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors",
                          sortConfig.key === 'id' && "text-primary"
                        )} onClick={() => toggleSort('id')}>
                          ID <ArrowUpDown size={12} className={cn(sortConfig.key === 'id' ? "opacity-100" : "opacity-30")} />
                        </div>
                        <div className={cn(
                          "col-span-4 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors",
                          sortConfig.key === 'name' && "text-primary"
                        )} onClick={() => toggleSort('name')}>
                          {t.admin.tableHeaderUser} <ArrowUpDown size={12} className={cn(sortConfig.key === 'name' ? "opacity-100" : "opacity-30")} />
                        </div>
                        <div className={cn(
                          "col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors",
                          sortConfig.key === 'role' && "text-primary"
                        )} onClick={() => toggleSort('role')}>
                          {t.admin.tableHeaderRole} <ArrowUpDown size={12} className={cn(sortConfig.key === 'role' ? "opacity-100" : "opacity-30")} />
                        </div>
                        <div className={cn(
                          "col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors",
                          sortConfig.key === 'status' && "text-primary"
                        )} onClick={() => toggleSort('status')}>
                          {t.admin.tableHeaderStatus} <ArrowUpDown size={12} className={cn(sortConfig.key === 'status' ? "opacity-100" : "opacity-30")} />
                        </div>
                        <div className={cn(
                          "col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors",
                          sortConfig.key === 'createdAt' && "text-primary"
                        )} onClick={() => toggleSort('createdAt')}>
                          {t.admin.tableHeaderJoined} <ArrowUpDown size={12} className={cn(sortConfig.key === 'createdAt' ? "opacity-100" : "opacity-30")} />
                        </div>
                        <div className="col-span-1 text-right">ম্যানেজ</div>
                      </div>

                      <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {sortedAndFilteredUsers.length > 0 ? (
                          sortedAndFilteredUsers.map((user, idx) => (
                            <motion.div 
                              layout
                              key={`${user.id}-${idx}`} 
                              className="px-4 py-6 grid grid-cols-12 gap-6 items-center hover:bg-slate-50/50 dark:hover:bg-slate-700/10 transition-all group rounded-2xl"
                            >
                              <div className="col-span-1 text-[11px] text-slate-300 font-mono font-bold opacity-50 group-hover:opacity-100 transition-opacity">
                                #{user.id.slice(0, 4).toUpperCase()}
                              </div>
                              <div className="col-span-4 flex items-center gap-4 min-w-0">
                                {user.photoURL ? (
                                  <img 
                                    src={user.photoURL} 
                                    alt="Avatar" 
                                    className="w-14 h-14 rounded-[1.25rem] object-cover shrink-0 border border-white dark:border-slate-600 shadow-sm transition-transform group-hover:scale-110 group-hover:rotate-6"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-14 h-14 rounded-[1.25rem] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-900 flex items-center justify-center text-slate-400 shrink-0 border border-white dark:border-slate-600 shadow-sm transition-transform group-hover:scale-110 group-hover:rotate-6">
                                     <Users size={24} />
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                   <div className="flex items-center gap-2 min-w-0">
                                     <span className="font-bn font-black text-slate-800 dark:text-white truncate text-base group-hover:text-primary transition-colors leading-tight">{user.displayName || user.name || 'নামহীন ইউজার'}</span>
                                     {(user.emailVerified || user.phoneVerified) && (
                                       <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20" title="ভেরিফাইড ইউজার">
                                         <CheckCircle2 size={10} className="text-emerald-500" />
                                       </div>
                                     )}
                                   </div>
                                   <span className="text-[11px] text-slate-400 truncate font-mono uppercase tracking-tight opacity-70 group-hover:opacity-100 transition-opacity mt-0.5">{user.email || 'কোনো ইমেইল নেই'}</span>
                                </div>
                              </div>
                              <div className="col-span-2">
                                 <div className={cn(
                                   "inline-flex items-center gap-2 text-[10px] font-bn font-black px-4 py-2 rounded-xl border-2 transition-all uppercase tracking-widest",
                                   user.role === 'admin' 
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20" 
                                    : "bg-slate-100 dark:bg-slate-700/50 text-slate-500 border-transparent"
                                 )}>
                                   {user.role === 'admin' ? <ShieldCheck size={12} /> : <Users size={12} />}
                                   {user.role === 'admin' ? (language === 'bn' ? 'অ্যাডমিন' : 'Admin') : (language === 'bn' ? 'ইউজার' : 'Member')}
                                 </div>
                              </div>
                              <div className="col-span-2">
                                 <div className={cn(
                                   "flex items-center gap-2 font-bn text-[11px] font-black uppercase tracking-widest",
                                   user.status === 'inactive' ? "text-rose-500" : "text-emerald-500"
                                 )}>
                                   <div className={cn(
                                     "w-2.5 h-2.5 rounded-full", 
                                     user.status === 'inactive' ? "bg-rose-500" : "bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse"
                                   )} />
                                   {user.status === 'inactive' ? (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive') : (language === 'bn' ? 'সক্রিয়' : 'Active')}
                                 </div>
                              </div>
                              <div className="col-span-2">
                                <div className="flex flex-col">
                                  <span className="text-xs text-slate-700 dark:text-slate-300 font-bn font-black">
                                    {user.createdAt instanceof Timestamp 
                                      ? user.createdAt.toDate().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) 
                                      : new Date(user.createdAt || Date.now()).toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-bn opacity-60 mt-0.5">
                                    {user.createdAt instanceof Timestamp 
                                      ? user.createdAt.toDate().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }) 
                                      : 'অজানা সময়'}
                                  </span>
                                </div>
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-2">
                                 <button 
                                   onClick={() => setSelectedUser(user)}
                                   className="w-12 h-12 rounded-[1.25rem] bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all transform hover:rotate-6 active:scale-90 shadow-sm flex items-center justify-center group/btn"
                                   title="বিস্তারিত দেখুন"
                                 >
                                    <ChevronRight size={22} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                 </button>
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="p-32 flex flex-col items-center justify-center text-center">
                            <div className="w-28 h-28 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-200 mb-8 transition-transform group-hover:scale-110">
                              <Users size={60} />
                            </div>
                            <h5 className="font-bn font-black text-2xl text-slate-800 dark:text-slate-200 tracking-tight">{t.admin.noUsers}</h5>
                            <p className="text-sm font-bn text-muted mt-3 max-w-sm mx-auto leading-relaxed italic opacity-70">{language === 'bn' ? "আপনার সার্চ কুয়েরি বা ফিল্টারগুলো পরিবর্তন করে পুনরায় চেষ্টা করুন।" : "Try adjusting your search criteria or filters to find what you're looking for."}</p>
                            {(userSearchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
                              <button 
                                onClick={() => { setUserSearchQuery(''); setRoleFilter('all'); setStatusFilter('all'); }}
                                className="mt-8 px-12 py-4 bg-primary text-white rounded-[2rem] text-sm font-bn font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                              >
                                {language === 'bn' ? "ফিল্টার মুছুন" : "Clear All Filters"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {sortedAndFilteredUsers.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-slate-50 dark:border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-4">
                       <p className="text-[10px] font-bn font-black text-slate-400 uppercase tracking-[0.3em] opacity-60">ইউজার ডাটা রিয়েল-টাইম সিঙ্ক হচ্ছে</p>
                       <div className="flex items-center gap-6">
                         <div className="flex items-center gap-2">
                           <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                           <span className="text-[10px] font-bn font-black text-slate-500 uppercase tracking-widest">{getNum(allUsers.filter(u => !u.status || u.status === 'active').length.toString())} সক্রিয় ইউজার</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50" />
                           <span className="text-[10px] font-bn font-black text-slate-500 uppercase tracking-widest">{getNum(allUsers.filter(u => u.status === 'inactive').length.toString())} নিষ্ক্রিয় ইউজার</span>
                         </div>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            ) : managementMode === 'ABUSE_REPORTS' ? (
              <div className="space-y-8">
                {/* Header block */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">
                        {language === 'bn' ? 'আপত্তিজনক কন্টেন্ট ও আচরণ মডারেশন' : 'Abuse & Content Moderation'}
                      </h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">
                        {language === 'bn' ? 'ব্যবহারকারীদের ফ্ল্যাগ করা বিষয়বস্তু ও পর্যালোচনা' : 'Flagged complaints and content review dashboard'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-rose-500/10 text-rose-600 px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest border border-rose-500/20 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>{getNum(allAbuseReports.filter(r => (r.status || 'pending') === 'pending').length.toString())} {language === 'bn' ? 'নতুন আপত্তি' : 'New Flags'}</span>
                    </div>
                  </div>
                </div>

                {/* Abuse Reports List Card Panel */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 shadow-xl shadow-slate-100 dark:shadow-none">
                  <div className="space-y-6">
                    {allAbuseReports.length > 0 ? (
                      allAbuseReports.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className="p-6 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center group hover:border-rose-500/20 transition-all">
                          <div className="space-y-3 flex-1 min-w-0 font-bn">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className={`text-[9px] font-bn font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${
                                item.reportedType === 'user'
                                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                  : item.reportedType === 'news'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                              }`}>
                                {item.reportedType === 'user' ? (language === 'bn' ? 'ইউজার প্রোফাইল' : 'Profile') : item.reportedType === 'news' ? (language === 'bn' ? 'খবর ও আপডেট' : 'News') : (language === 'bn' ? 'সার্ভিস রিভিউ' : 'Review')}
                              </span>

                              <span className={`text-[9px] font-bn font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${
                                item.status === 'resolved'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : item.status === 'reviewed'
                                  ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                                  : 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                              }`}>
                                {item.status === 'resolved' ? (language === 'bn' ? 'মীমাংসিত' : 'Resolved') : item.status === 'reviewed' ? (language === 'bn' ? 'পর্যালোচিত' : 'Reviewed') : (language === 'bn' ? 'নতুন / পেন্ডিং' : 'Pending')}
                              </span>

                              <span className="text-[10px] text-slate-400 font-bn opacity-85">
                                {language === 'bn' ? 'তারিখ: ' : 'Date: '} 
                                {item.createdAt?.toDate().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
                              </span>
                            </div>

                            <div className="space-y-1">
                              {item.reportedTitle && (
                                <p className="text-[10px] uppercase font-bold text-slate-404">
                                  {language === 'bn' ? 'রিপোর্টকৃত আইটেম শিরোনাম:' : 'Reported Item Title:'} <span className="text-slate-705 dark:text-slate-300 font-black">{item.reportedTitle}</span>
                                </p>
                              )}
                              <h4 className="text-base font-bn font-black text-rose-600 dark:text-rose-400">
                                {language === 'bn' ? 'উত্থাপিত অভিযোগ: ' : 'Reported Reason: '} {item.reason}
                              </h4>
                              {item.details && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 font-bn bg-slate-100 dark:bg-slate-800/80 p-4 rounded-2xl whitespace-pre-line leading-relaxed">
                                  {item.details}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold font-mono">
                              <span>{language === 'bn' ? 'রিপোর্টার আইডি:' : 'Reporter ID:'} <span className="text-primary font-mono select-all font-black">{item.reporterId}</span></span>
                              <span>•</span>
                              <span>{language === 'bn' ? 'অভিযুক্ত কন্টেন্ট আইডি:' : 'Subject ID:'} <span className="text-secondary font-mono select-all font-black">{item.reportedId}</span></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-stretch md:self-auto justify-end border-t md:border-none pt-4 md:pt-0 border-slate-100 dark:border-slate-800">
                            {item.status !== 'reviewed' && item.status !== 'resolved' && (
                              <button
                                onClick={() => handleUpdateAbuseReportStatus(item.id, 'reviewed')}
                                className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500 hover:text-white text-yellow-600 rounded-xl text-xs font-bn font-bold border border-yellow-500/20 active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                {language === 'bn' ? 'চিহ্নিত করুন' : 'Reviewed'}
                              </button>
                            )}
                            {item.status !== 'resolved' && (
                              <button
                                onClick={() => handleUpdateAbuseReportStatus(item.id, 'resolved')}
                                className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-600 rounded-xl text-xs font-bn font-bold border border-emerald-500/20 active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                {language === 'bn' ? 'সমাধান করুন' : 'Resolved'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAbuseReport(item.id)}
                              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl text-xs font-bn font-bold border border-rose-500/20 active:scale-95 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-24 text-center">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-6 border border-slate-100 dark:border-slate-700">
                          <ShieldAlert size={44} />
                        </div>
                        <h4 className="text-xl font-bn font-black text-slate-700 dark:text-slate-300">
                          {language === 'bn' ? 'কোন আপত্তিজনক রিপোর্ট নেই!' : 'No abuse reports flags found!'}
                        </h4>
                        <p className="text-xs font-bn text-slate-400 mt-2">
                          {language === 'bn' ? 'ব্যবহারকারীদের জমা দেওয়া বিষয়বস্তু বা প্রোফাইল ফ্ল্যাগ একদম পরিষ্কার।' : 'All user content flags, behavioral reviews, and systems are currently pristine.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : managementMode === 'REPORTS' ? (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">অভিযোগ ও তদন্ত কেন্দ্র</h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">নাগরিক সমস্যা ও সমাধান ট্র্যাকিং</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="bg-orange-500/10 text-orange-600 px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest border border-orange-500/20 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                        {getNum(allReports.filter(r => (r.status || 'pending') === 'pending').length.toString())} পেন্ডিং অভিযোগ
                     </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 soft-shadow overflow-hidden p-6 md:p-8">
                  {/* Search & Filters */}
                  <div className="flex flex-col md:flex-row gap-4 mb-10 items-stretch md:items-center">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors pointer-events-none" size={20} />
                      <input 
                        type="text"
                        placeholder="অভিযোগের শিরোনাম বা আইডি দিয়ে খুঁজুন..."
                        value={reportSearchQuery}
                        onChange={(e) => setReportSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-14 pr-12 outline-none focus:border-primary/20 transition-all font-bn text-sm font-black shadow-inner"
                      />
                    </div>
                    <div className="flex flex-row gap-3 items-center w-full md:w-auto">
                      <div className="relative group/sel flex-1 md:flex-initial min-w-[124px] md:min-w-[150px]">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within/sel:text-primary transition-colors">
                          <Activity size={16} />
                        </div>
                        <select 
                          value={reportStatusFilter}
                          onChange={(e) => setReportStatusFilter(e.target.value as any)}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-12 pr-10 outline-none font-bn text-sm font-black cursor-pointer appearance-none focus:border-primary/20 transition-all shadow-inner"
                        >
                          {t.admin.reportStatusFilters.map((s: any) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                           <ChevronDown size={14} />
                        </div>
                      </div>

                      <div className="relative group/sel flex-1 md:flex-initial min-w-[124px] md:min-w-[150px]">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within/sel:text-primary transition-colors">
                          <TrendingUp size={16} />
                        </div>
                        <select 
                          value={reportPriorityFilter}
                          onChange={(e) => setReportPriorityFilter(e.target.value as any)}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl py-3.5 pl-12 pr-10 outline-none font-bn text-sm font-black cursor-pointer appearance-none focus:border-primary/20 transition-all shadow-inner"
                        >
                          {t.admin.priorityFilters.map((p: any) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                           <ChevronDown size={14} />
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => { setReportSearchQuery(''); setReportStatusFilter('all'); setReportPriorityFilter('all'); }}
                        className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-rose-500 transition-all active:scale-90"
                        title="সব রিসেট করুন"
                      >
                         <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {allReports
                      .filter(r => {
                        const matchesSearch = (r.category || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) || 
                                             (r.title || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) ||
                                             (r.id || '').toLowerCase().includes(reportSearchQuery.toLowerCase());
                        const matchesStatus = reportStatusFilter === 'all' || (r.status || 'pending') === reportStatusFilter;
                        const matchesPriority = reportPriorityFilter === 'all' || (r.priority || 'medium') === reportPriorityFilter;
                        return matchesSearch && matchesStatus && matchesPriority;
                      })
                      .sort((a, b) => {
                        // High priority first, then newest
                        const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
                        const vA = priorityWeight[a.priority || 'medium'] || 0;
                        const vB = priorityWeight[b.priority || 'medium'] || 0;
                        if (vA !== vB) return vB - vA;
                        
                        const getMillis = (val: any) => {
                          if (!val) return Date.now();
                          if (val instanceof Timestamp) return val.toMillis();
                          return new Date(val).getTime();
                        };
                        return getMillis(b.createdAt) - getMillis(a.createdAt);
                      })
                      .map((report, idx) => (
                        <motion.div 
                          layout
                          key={`${report.id}-${idx}`} 
                          className="bg-slate-50 dark:bg-slate-900/40 rounded-3xl border border-slate-100/90 dark:border-slate-800/80 p-5 sm:p-6 hover:border-primary/20 transition-all group overflow-hidden"
                        >
                          <div className="flex flex-col gap-4">
                             {/* Left Info Column */}
                             <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-3 mb-4">
                                   <div className={cn(
                                     "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-transform group-hover:rotate-6 shadow-sm",
                                     (report.status || 'pending') === 'resolved' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                     (report.status || 'pending') === 'cancelled' ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
                                     "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                   )}>
                                      <FileWarning size={20} />
                                   </div>
                                   <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2.5">
                                        <h4 className="text-base font-bn font-black text-slate-800 dark:text-white leading-tight line-clamp-2">{report.title || 'শিরোনাম নেই'}</h4>
                                        <div className={cn(
                                          "px-2.5 py-0.5 rounded-lg text-[9px] font-bn font-black uppercase tracking-widest shrink-0 border",
                                          (report.priority || 'medium') === 'high' ? "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 border-rose-100 dark:border-rose-900/30" :
                                          (report.priority || 'medium') === 'medium' ? "bg-amber-50 dark:bg-amber-950/20 text-amber-605 dark:text-amber-450 border-amber-100 dark:border-amber-900/30" :
                                          "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-450 border-blue-100 dark:border-blue-900/30"
                                        )}>
                                          {(report.priority || 'medium') === 'high' ? t.admin.priorityHigh : 
                                           (report.priority || 'medium') === 'medium' ? t.admin.priorityMedium : t.admin.priorityLow}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[10px] font-bn font-black text-slate-400">
                                         <span className="uppercase tracking-widest text-[9px] bg-slate-200/50 dark:bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-450 font-mono font-bold">#{report.id.slice(0, 8).toUpperCase()}</span>
                                         <span className="text-primary flex items-center gap-1">
                                            <Users size={11} className="text-slate-450" /> {report.userName || 'বেনামী ইউজার'}
                                         </span>
                                         <span className="flex items-center gap-1">
                                            <Clock size={11} /> 
                                            {report.createdAt instanceof Timestamp 
                                              ? report.createdAt.toDate().toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }) + ' ' + report.createdAt.toDate().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
                                              : 'অজানা তারিখ'}
                                         </span>
                                      </div>
                                   </div>
                                </div>
                                
                                <blockquote className="text-sm font-bn font-black text-slate-600 dark:text-slate-405 bg-white dark:bg-slate-800/40 px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 leading-relaxed mb-4 italic whitespace-pre-wrap">
                                   "{report.description || 'বিবরণ নেই'}"
                                </blockquote>

                                <div className="flex flex-col gap-2 mt-2 mb-4">
                                   <div className="flex items-center gap-1.5 self-start px-3 py-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl text-slate-500 dark:text-slate-450 font-bn font-black text-[10px] uppercase tracking-widest border border-slate-200/20 dark:border-slate-700/30">
                                      <LayoutGrid size={13} className="shrink-0 text-slate-400" /> 
                                      <span>{report.category || 'অন্যান্য'}</span>
                                   </div>
                                   <button 
                                     onClick={() => {
                                       const coords = getCoordinates(report.location) || getCoordinates(report);
                                       if (coords) setViewingLocation({ 
                                          lat: coords.lat, 
                                          lng: coords.lng, 
                                          address: report.address || 'শ্রীপুর',
                                          title: language === 'bn' ? 'রিপোর্ট লোকেশন' : 'Report Location',
                                          subtitle: language === 'bn' ? 'রিপোর্টের সঠিক অবস্থান ম্যাপে' : 'Report exact location on map'
                                        });
                                     }}
                                     className="flex items-start gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-xl font-bn font-black text-[10px] uppercase tracking-widest transition-all text-left border border-blue-500/10 active:scale-[0.98] w-full"
                                   >
                                      <MapPin size={13} className="shrink-0 mt-0.5 text-blue-500" /> 
                                      <span className="break-words leading-normal flex-1 line-clamp-2">{report.address || 'লোকেশন অজানা'}</span>
                                   </button>
                                </div>
                             </div>

                             {/* Right Media/Actions Column */}
                             <div className="flex flex-col gap-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800/70">
                                {report.imageUrl && (
                                  <div className="flex flex-col gap-1.5 mb-1">
                                    <p className="text-[10px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                      {language === 'bn' ? 'ব্যবহারকারীর আপলোডকৃত ছবি' : 'User Uploaded Photo'}
                                    </p>
                                    <div className="relative group/img aspect-video rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-850 shadow-sm">
                                       <img 
                                        src={getDirectImageUrl(report.imageUrl)} 
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105" 
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                       />
                                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                          <button className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center translate-y-2 group-hover/img:translate-y-0 transition-transform">
                                            <Search size={15} />
                                          </button>
                                       </div>
                                    </div>
                                  </div>
                                )}

                                {/* Illustrative Unsplash image based on civic details */}
                                <div className="hidden flex flex-col gap-1.5 mb-1">
                                  <p className="text-[10px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                    {language === 'bn' ? 'প্রতিনিধিত্বমূলক ছবি (Unsplash)' : 'Representative Image (Unsplash)'}
                                  </p>
                                  <div className="relative group/img aspect-video rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-850 shadow-sm">
                                     <img 
                                      src={getUnsplashImageByDetails(report.category || '', report.title || '', report.description || '')} 
                                      className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105" 
                                      referrerPolicy="no-referrer"
                                      loading="lazy"
                                     />
                                  </div>
                                </div>
                                
                                <div className="flex flex-col gap-2.5">
                                   <p className="text-[9px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">অ্যাকশন সেন্টার</p>
                                   <div className="grid grid-cols-2 gap-2.5">
                                      {report.status !== 'resolved' ? (
                                        <button 
                                          onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                                          className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white py-3 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest transition-all active:scale-[0.97] shadow-sm shadow-emerald-500/15"
                                        >
                                          সমাধান করুন
                                        </button>
                                      ) : (
                                        <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-455 py-3 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest text-center border border-emerald-100/80 dark:border-emerald-900/40">
                                           সমাধানকৃত
                                        </div>
                                      )}
                                      
                                      <button 
                                        onClick={() => handleUpdateReportStatus(report.id, report.status === 'cancelled' ? 'pending' : 'cancelled')}
                                        className={cn(
                                          "py-3 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest transition-all active:scale-[0.97] border",
                                          report.status === 'cancelled' ? "bg-slate-805 border-slate-850 dark:bg-slate-700 dark:border-slate-700 text-white" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750"
                                        )}
                                      >
                                        {report.status === 'cancelled' ? 'রিস্টোর করুন' : 'বাতিল করুন'}
                                      </button>
                                   </div>
                                   <button 
                                      onClick={() => handleDeleteReport(report.id)}
                                      className="w-full py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[10px] font-bn font-black uppercase tracking-widest transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 border border-rose-500/10 mt-0.5"
                                   >
                                      <Trash2 size={14} /> ডাটাবেজ থেকে মুছুন
                                   </button>
                                </div>
                             </div>
                          </div>
                        </motion.div>
                      ))}
                    
                    {allReports.filter(r => {
                      const matchesSearch = (r.category || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) || 
                                           (r.title || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) ||
                                           (r.id || '').toLowerCase().includes(reportSearchQuery.toLowerCase());
                      const matchesStatus = reportStatusFilter === 'all' || (r.status || 'pending') === reportStatusFilter;
                      const matchesPriority = reportPriorityFilter === 'all' || (r.priority || 'medium') === reportPriorityFilter;
                      return matchesSearch && matchesStatus && matchesPriority;
                    }).length === 0 && (
                      <div className="py-24 text-center">
                        <div className="w-24 h-24 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-6">
                          <FileWarning size={48} />
                        </div>
                        <h4 className="text-xl font-bn font-black text-slate-800 dark:text-white">{t.admin.noReports || 'কোনো অভিযোগ পাওয়া যায়নি'}</h4>
                        <p className="text-sm font-bn text-muted mt-2">অন্য কোনো ফিল্টার ট্রাই করুন।</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : managementMode === 'NEWS' ? (
              <div className="space-y-8">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setManagementMode('OVERVIEW')} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500">
                    <ArrowLeft size={16} />
                  </button>
                  <h3 className="text-xl font-bn font-bold text-slate-800 dark:text-white">{language === 'bn' ? "নিউজ ম্যানেজমেন্ট" : "News Management"}</h3>
                </div>

                {/* Add News Form */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl soft-shadow border border-slate-100 dark:border-slate-700">
                  <h4 className="font-bn font-bold text-lg mb-6 flex items-center gap-2 text-primary">
                    <Plus size={20} /> {t.admin.addNewsTitle}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 md:col-span-2">
                       <label className="text-xs font-bn font-bold text-slate-500 ml-2">{language === 'bn' ? "খবরের শিরোনাম" : "News Title"}</label>
                       <input 
                         value={newsTitle}
                         onChange={(e) => setNewsTitle(e.target.value)}
                         placeholder={t.admin.newsPlaceholder}
                         className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 px-6 outline-none focus:border-primary transition-all font-bn"
                       />
                    </div>
                    <div className="space-y-4 md:col-span-2">
                       <label className="text-xs font-bn font-bold text-slate-500 ml-2">{language === 'bn' ? "বিস্তারিত বিবরণ" : "Detail Description"}</label>
                       <textarea 
                         value={newsDesc}
                         onChange={(e) => setNewsDesc(e.target.value)}
                         placeholder={t.admin.newsDescPlaceholder}
                         rows={4}
                         className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 px-6 outline-none focus:border-primary transition-all font-bn"
                       />
                    </div>
                    <div className="space-y-4">
                       <label className="text-xs font-bn font-bold text-slate-500 ml-2">{language === 'bn' ? "ক্যাটাগরি" : "Category"}</label>
                       <select 
                         value={newsCategory}
                         onChange={(e) => setNewsCategory(e.target.value)}
                         className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 px-6 outline-none focus:border-primary transition-all font-bn"
                       >
                         {(language === 'bn' ? ['সাধারণ', 'প্রযুক্তি', 'কৃষি', 'স্বাস্থ্য', 'জরুরি'] : ['General', 'Tech', 'Agri', 'Health', 'Emergency']).map((cat: string) => (
                           <option key={cat} value={cat}>{cat}</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-4">
                       <label className="text-xs font-bn font-bold text-slate-500 ml-2">{language === 'bn' ? "ছবি ইউআরএল (ঐচ্ছিক)" : "Image URL (Optional)"}</label>
                       <div className="relative">
                          <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input 
                            value={newsImage}
                            onChange={(e) => setNewsImage(e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-6 outline-none focus:border-primary transition-all font-bn"
                          />
                       </div>
                    </div>
                    <div className="space-y-4 md:col-span-2">
                       <label className="text-xs font-bn font-bold text-slate-500 ml-2">{language === 'bn' ? "ভিডিও লিংক (ঐচ্ছিক - YouTube/Video URL)" : "Video Link (Optional - YouTube/Video URL)"}</label>
                       <div className="relative">
                          <Video className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input 
                            value={newsVideoUrl}
                            onChange={(e) => setNewsVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-6 outline-none focus:border-primary transition-all font-bn"
                          />
                       </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleAddNews}
                    disabled={isAddingNews || !newsTitle || !newsDesc}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bn font-bold py-4 rounded-2xl shadow-xl shadow-primary/30 transition-all active:scale-95 disabled:opacity-50 mt-8 flex items-center justify-center gap-2"
                  >
                    {isAddingNews ? <Activity size={20} className="animate-spin" /> : <><Plus size={20} /> {t.admin.publishNewsButton}</>}
                  </button>
                </div>

                {/* News List */}
                <div className="space-y-6">
                  <h4 className="font-bn font-bold text-lg mb-4">{language === 'bn' ? "প্রকাশিত খবরসমূহ" : "Published News"}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {allNews.map((n, idx) => (
                      <NewsCard 
                        key={`${n.id}-${idx}`} 
                        news={n} 
                        isAdmin={true} 
                        onDelete={handleDeleteNews} 
                        isDeleting={isActing === n.id}
                      />
                    ))}
                  </div>
                  {allNews.length === 0 && (
                    <div className="p-20 text-center bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                      <Newspaper className="mx-auto text-slate-300 mb-2" size={48} />
                      <p className="text-slate-500 font-bn">{language === 'bn' ? "এখনো কোনো খবর যোগ করা হয়নি" : "No news added yet"}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : managementMode === 'SERVICE_HUB' ? (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">সার্ভিস হাব ম্যানেজমেন্ট</h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">প্রোভাইডার ও সেবা তথ্য ব্যবস্থাপনা</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingProvider(null);
                      setProviderFormData({
                        name: '',
                        category: '',
                        subCategory: '',
                        phone: '',
                        email: '',
                        whatsapp: '',
                        facebook: '',
                        website: '',
                        address: '',
                        description: '',
                        status: 'approved',
                        isVerified: false,
                        experience: '',
                        serviceCharge: '',
                        availableTime: '',
                        image: '',
                        businessImage: '',
                        providerVerification: '',
                        location: { lat: 24.2000, lng: 90.4667 }
                      });
                      setIsAddingProvider(true);
                    }}
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-[2rem] font-bn font-black text-base shadow-xl shadow-primary/20 hover:scale-[1.03] active:scale-95 transition-all text-shadow-sm"
                  >
                    <Plus size={20} />
                    <span>নতুন প্রোভাইডার যোগ করুন</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {allProviders.map((p, idx) => (
                    <div key={`${p.id}-${idx}`} className="bg-white dark:bg-slate-800 p-6 rounded-3xl soft-shadow border border-slate-100 dark:border-slate-700">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                          <img 
                            src={getCleanImageUrl(p.businessImage || p.image, { id: p.id, title: p.name, category: p.category, subCategory: p.subCategory })} 
                            className="w-full h-full object-cover" 
                            alt="" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bn font-bold uppercase">
                                    {p.category} • {p.subCategory}
                                  </span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-lg text-[10px] font-bn font-bold uppercase",
                                    p.status === 'approved' ? "bg-green-100 text-green-600" : 
                                    p.status === 'rejected' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                                  )}>
                                    {p.status}
                                  </span>
                               </div>
                               <h4 className="text-xl font-bn font-bold text-slate-800 dark:text-white mt-1">{p.name}</h4>
                            </div>
                            <div className="text-right">
                               <p className="text-xs font-bn text-muted">{p.createdAt instanceof Timestamp ? p.createdAt.toDate().toLocaleDateString('bn-BD') : 'তারিখ নেই'}</p>
                               <p className="text-xs font-mono text-slate-400">#{p.id.slice(0, 8)}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 my-4">
                             <div className="flex flex-col">
                                <span className="text-[10px] font-bn font-bold text-muted uppercase tracking-wider">Phone</span>
                                <span className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300">{p.phone}</span>
                             </div>
                             <div className="flex flex-col">
                                <span className="text-[10px] font-bn font-bold text-muted uppercase tracking-wider">Address</span>
                                <button 
                                  onClick={() => {
                                    if (p.location || p.lat || p.latitude) {
                                      const coords = getCoordinates(p.location) || getCoordinates(p);
                                      if (coords) {
                                        setViewingLocation({ 
                                           lat: coords.lat, 
                                           lng: coords.lng, 
                                           address: p.address || 'শ্রীপুর, গাজীপুর',
                                           title: language === 'bn' ? 'প্রোভাইডার লোকেশন' : 'Provider Location',
                                           subtitle: language === 'bn' ? 'উদ্যোক্তার সঠিক অবস্থান ম্যাপে' : 'Entrepreneur exact location on map'
                                         });
                                      } else {
                                        alert(language === 'bn' ? 'ইউজার কোনো কোঅর্ডিনেট প্রদান করেনি' : 'User did not provide coordinates');
                                      }
                                    } else {
                                      alert(language === 'bn' ? 'ইউজার কোনো কোঅর্ডিনেট প্রদান করেনি' : 'User did not provide coordinates');
                                    }
                                  }}
                                  className="text-sm font-bn font-bold text-primary hover:underline flex items-center gap-1 group"
                                >
                                   <MapPin size={12} className="group-hover:scale-110 transition-transform" />
                                   <span className="truncate max-w-[150px]">{p.address || (language === 'bn' ? 'ম্যাপ লোকেশন দেখুন' : 'View map location')}</span>
                                </button>
                             </div>
                             <div className="flex flex-col">
                                <span className="text-[10px] font-bn font-bold text-muted uppercase tracking-wider">{language === 'bn' ? 'রেটিং' : 'Rating'}</span>
                                <div className="flex items-center gap-1.5 pt-1">
                                  <Star size={12} className="text-amber-500" fill="currentColor" />
                                  <span className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300">
                                    {p.rating || '0.0'} ({p.reviewCount || 0})
                                  </span>
                                </div>
                             </div>
                          </div>

                          <p className="text-sm font-bn text-slate-600 dark:text-slate-400 line-clamp-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                             {p.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-3 mt-6">
                             {p.status !== 'approved' && (
                               <button 
                                onClick={() => handleUpdateProviderStatus(p.id, 'approved', true)}
                                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bn font-bold text-xs transition-all shadow-lg shadow-green-500/20 active:scale-95 flex items-center gap-2"
                               >
                                 <CheckCircle2 size={14} /> অনুমোদন দিন
                               </button>
                             )}
                             {p.status === 'approved' && !p.isVerified && (
                                <button 
                                 onClick={() => handleUpdateProviderStatus(p.id, 'approved', true)}
                                 className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bn font-bold text-xs transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2"
                                >
                                  <ShieldCheck size={14} /> ভেরিফাই করুন
                                </button>
                             )}
                             {p.status === 'approved' && p.isVerified && (
                                <button 
                                 onClick={() => handleUpdateProviderStatus(p.id, 'approved', false)}
                                 className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-bn font-bold text-xs transition-all active:scale-95"
                                >
                                  ভেরিফিকেশন সরান
                                </button>
                             )}
                             {p.status !== 'rejected' && (
                               <button 
                                onClick={() => handleUpdateProviderStatus(p.id, 'rejected')}
                                className="px-6 py-2.5 bg-red-100 text-red-500 hover:bg-red-200 rounded-xl font-bn font-bold text-xs transition-all active:scale-95"
                               >
                                 বাতিল করুন
                               </button>
                             )}
                             <button
                               onClick={() => setViewingReviewsFor(p.id)}
                               className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 rounded-xl font-bn font-bold text-xs transition-all active:scale-95 flex items-center gap-2"
                             >
                               <Star size={14} className="text-amber-500" fill="currentColor" /> {language === 'bn' ? 'রিভিউ দেখুন' : 'View Reviews'}
                             </button>
                             <button
                               onClick={() => handleEditProvider(p)}
                               className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-500 hover:text-white rounded-xl font-bn font-bold text-xs transition-all active:scale-95 flex items-center gap-2"
                             >
                               <Pencil size={14} /> এডিট
                             </button>
                             <button
                               onClick={() => handleDeleteProvider(p.id)}
                               className="px-6 py-2.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl font-bn font-bold text-xs transition-all active:scale-95 flex items-center gap-2"
                             >
                               <Trash2 size={14} /> ডিলিট
                             </button>
                             {isActing === p.id && <Loader2 size={14} className="animate-spin text-primary" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {allProviders.length === 0 && (
                    <div className="p-20 text-center bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                      <Users className="mx-auto text-slate-300 mb-2" size={48} />
                      <p className="text-slate-500 font-bn">এখনো কোনো সার্ভিস প্রোভাইডার আবেদন করেনি</p>
                    </div>
                  )}
                </div>
              </div>
            ) : managementMode === 'EXPLORE' ? (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">এক্সপ্লোর ডিরেক্টরি</h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">সেবা ও তথ্য ব্যবস্থাপনা</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleSeedExploreData}
                      disabled={isSeeding}
                      className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-bn font-black text-xs hover:bg-slate-200 disabled:opacity-50 transition-all"
                    >
                      {isSeeding ? 'মাইগ্রেট হচ্ছে...' : 'সেবা মাইগ্রেট করুন'}
                    </button>
                    <button 
                      onClick={() => {
                        setEditingExplore(null);
                        setExploreFormData({
                          title: '',
                          bengaliTitle: '',
                          category: 'gov',
                          subCategory: '',
                          shortDescription: '',
                          fullDescription: '',
                          contactNumber: '',
                          hotline: '',
                          address: '',
                          openingHours: '',
                          mapLink: '',
                          latitude: 24.2000,
                          longitude: 90.4667,
                          website: '',
                          image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800',
                          tags: [],
                          featured: false,
                          emergency: false,
                          isVisible: true
                        });
                        setIsAddingExplore(true);
                      }}
                      className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-[2rem] font-bn font-black text-base shadow-xl shadow-primary/20 hover:scale-[1.03] active:scale-95 transition-all text-shadow-sm"
                    >
                      <Plus size={20} />
                      <span>নতুন সেবা যোগ করুন</span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                   <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <CheckCircle2 size={24} className="opacity-40" />
                        <span className="text-[10px] font-bn font-black uppercase tracking-widest">লাইভ সেবা</span>
                      </div>
                      <p className="text-3xl font-display font-black leading-none">{getNum(String(allExploreServices.filter(s => s.isVisible).length))}</p>
                   </div>
                   <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-6 rounded-3xl text-white shadow-lg shadow-slate-900/20">
                      <div className="flex items-center justify-between mb-2">
                        <EyeOff size={24} className="opacity-40" />
                        <span className="text-[10px] font-bn font-black uppercase tracking-widest">নিষ্ক্রিয়</span>
                      </div>
                      <p className="text-3xl font-display font-black leading-none">{getNum(String(allExploreServices.filter(s => !s.isVisible).length))}</p>
                   </div>
                   <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 soft-shadow col-span-2 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bn font-black text-slate-400 uppercase tracking-widest">মোট ভলিউম</span>
                        <p className="text-3xl font-display font-black text-slate-900 dark:text-white leading-none">{getNum(String(allExploreServices.length))}</p>
                      </div>
                      <div className="flex gap-2">
                         {Array.from(new Set(allExploreServices.map(s => s.icon || '📌'))).slice(0, 4).map((icon, i) => (
                           <div key={i} className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-xl shadow-inner">{icon}</div>
                         ))}
                      </div>
                   </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                    <input 
                      type="text"
                      placeholder="সেবার নাম বা বিবরণ দিয়ে খুঁজুন..."
                      value={exploreSearchQuery}
                      onChange={(e) => setExploreSearchQuery(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border-[3px] border-slate-50 dark:border-slate-800 rounded-2xl py-3 pl-14 pr-6 outline-none focus:border-primary/30 transition-all font-bn text-sm soft-shadow font-bold"
                    />
                  </div>
                  <div className="relative min-w-[200px]">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <Filter size={16} />
                    </div>
                    <select 
                      value={exploreCategoryFilter}
                      onChange={(e) => setExploreCategoryFilter(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border-[3px] border-slate-50 dark:border-slate-800 rounded-2xl py-3 pl-12 pr-10 outline-none font-bn text-sm soft-shadow appearance-none cursor-pointer focus:border-primary/30 transition-all font-bold"
                    >
                      <option value="ALL">সব ক্যাটাগরি</option>
                      {EXPLORE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.bn}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>

                {/* Modern Service Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {allExploreServices
                    .filter(s => {
                      const title = s.title || '';
                      const desc = s.description || s.shortDescription || '';
                      const query = exploreSearchQuery.toLowerCase();
                      const matchesSearch = title.toLowerCase().includes(query) || desc.toLowerCase().includes(query);
                      const matchesCat = exploreCategoryFilter === 'ALL' || s.category === exploreCategoryFilter;
                      return matchesSearch && matchesCat;
                    })
                    .map((service, idx) => {
                      const catHexColors: Record<string, string> = {
                        health: '#10b981',
                        edu: '#3b82f6',
                        emergency: '#ef4444',
                        gov: '#64748b',
                        agri: '#22c55e',
                        transport: '#f97316',
                        tourism: '#d946ef',
                        religious: '#6366f1'
                      };
                      const catObj = EXPLORE_CATEGORIES.find(c => c.id === service.category);
                      const displayColor = service.color || catHexColors[service.category] || '#3b82f6';
                      const displayIcon = service.icon || catObj?.emoji || '📌';

                      return (
                        <motion.div 
                          layout
                          key={`explore-${service.id}-${idx}`} 
                          className={cn(
                            "bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-md border-2 transition-all group overflow-hidden relative flex flex-col justify-between min-h-[250px]",
                            service.isVisible ? "border-slate-100 dark:border-slate-700/60 hover:border-primary/30" : "border-slate-100 dark:border-slate-800 opacity-70 grayscale-[0.3]"
                          )}
                        >
                          <div>
                            {/* Top Bar with Category and Admin Controls */}
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <span className="px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[9px] font-bn font-black uppercase tracking-widest">
                                {catObj ? catObj.bn : service.category}
                              </span>
                              
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button 
                                  type="button"
                                  onClick={() => handleUpdateExploreVisibility(service.id, service.isVisible)}
                                  className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all border shadow-sm",
                                    service.isVisible 
                                      ? "bg-emerald-500/10 border-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white" 
                                      : "bg-slate-100 border-slate-200 dark:bg-slate-700 dark:border-slate-600 text-slate-400 hover:bg-primary hover:text-white"
                                  )}
                                  title={service.isVisible ? "হাইড করুন" : "শো করুন"}
                                >
                                  {service.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                                
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setEditingExplore(service);
                                    setExploreFormData({
                                      title: service.title || '',
                                      bengaliTitle: service.bengaliTitle || '',
                                      category: service.category || 'gov',
                                      subCategory: service.subCategory || '',
                                      shortDescription: service.shortDescription || '',
                                      fullDescription: service.fullDescription || '',
                                      contactNumber: service.contactNumber || service.phone || '',
                                      hotline: service.hotline || '',
                                      address: service.address || service.location || '',
                                      openingHours: service.openingHours || '',
                                      mapLink: service.mapLink || service.locationMapUrl || '',
                                      latitude: service.latitude || service.lat || 24.2, 
                                      longitude: service.longitude || service.lng || 90.4, 
                                      website: service.website || service.portalUrl || '',
                                      image: service.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800',
                                      tags: service.tags || [],
                                      featured: service.featured || false,
                                      emergency: service.emergency || false,
                                      isVisible: service.isVisible !== false
                                    });
                                    setIsAddingExplore(true);
                                  }}
                                  className="w-8 h-8 bg-blue-500/10 border border-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm"
                                  title="এডিট করুন"
                                >
                                  <Pencil size={14} />
                                </button>
                                
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteExplore(service.id)}
                                  className="w-8 h-8 bg-rose-500/10 border border-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-sm"
                                  title="মুছে ফেলুন"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                         <div className="flex gap-4 relative z-10 items-center">
                            <div 
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center text-3xl sm:text-4xl transition-transform group-hover:scale-110 group-hover:-rotate-3 shrink-0 bg-slate-50 dark:bg-slate-900 border"
                              style={{ backgroundColor: `${displayColor}10`, color: displayColor, borderColor: `${displayColor}30` }}
                            >
                               {displayIcon}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                               <div className="flex items-center gap-2 mb-1">
                                 <h4 className="font-bn font-black text-lg sm:text-xl text-slate-800 dark:text-white truncate leading-tight group-hover:text-primary transition-colors">{service.title}</h4>
                               </div>
                               <div className="flex flex-col gap-0.5 mt-0.5">
                                  {service.subCategory && (
                                    <span className="text-[10px] font-bn font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wide truncate">
                                      {service.subCategory}
                                    </span>
                                  )}
                                  {service.phone && (
                                    <span className="flex items-center gap-1 text-[10px] sm:text-xs font-mono text-slate-400 font-bold whitespace-nowrap">
                                      <Phone size={10} className="text-primary/70 shrink-0" /> {getNum(service.phone)}
                                    </span>
                                  )}
                               </div>
                            </div>
                         </div>
                         
                         <p className="mt-4 text-[11px] font-bn text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                            {service.description || 'এই সেবার কোনো বিস্তারিত বিবরণ দেওয়া হয়নি।'}
                         </p>

                         <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-700/50 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 shrink-0">
                               <div className={cn(
                                 "w-2 h-2 rounded-full",
                                 service.isVisible ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"
                                )} />
                               <span className="text-[10px] font-bn font-black uppercase tracking-widest text-slate-400">
                                 {service.isVisible ? 'লাইভ' : 'নিষ্ক্রিয়'}
                               </span>
                            </div>
                            <button 
                              onClick={() => {
                                 setViewingLocation({ 
                                    lat: (getCoordinates(service) || { lat: 24.2, lng: 90.4 }).lat, title: language === 'bn' ? 'সার্ভিস লোকেশন' : 'Service Location', subtitle: language === 'bn' ? 'সার্ভিসের সঠিক অবস্থান ম্যাপে' : 'Service exact location on map', 
                                    lng: (getCoordinates(service) || { lat: 24.2, lng: 90.4 }).lng, 
                                    address: service.location 
                                 });
                              }}
                              className="flex items-center gap-1.5 text-[10px] font-bn font-black text-primary hover:bg-primary/5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all border border-primary/10 whitespace-nowrap shrink-0"
                            >
                               <MapPin size={12} /> ম্যাপে দেখুন
                            </button>
                         </div>
                      </motion.div>
                    );
                  })}
                  
                  {allExploreServices.length === 0 && (
                    <div className="col-span-full p-28 text-center bg-white dark:bg-slate-800 rounded-3xl border-4 border-dashed border-slate-50 dark:border-slate-700 group hover:border-primary/20 transition-all">
                      <LayoutGrid className="mx-auto text-slate-200 group-hover:text-primary/20 group-hover:scale-110 transition-all duration-500" size={80} />
                      <h4 className="mt-8 font-bn font-black text-2xl text-slate-800 dark:text-slate-200 tracking-tight">কোনো সেবা পাওয়া যায়নি</h4>
                      <p className="mt-2 text-sm font-bn text-muted max-w-sm mx-auto">ডিরেক্টরি বর্তমানে শূন্য। নতুন সেবা যোগ করতে উপরের বাটনে ক্লিক করুন।</p>
                      <button 
                        onClick={() => setIsAddingExplore(true)}
                        className="mt-8 px-10 py-4 bg-primary text-white rounded-[2rem] font-bn font-black text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                      >
                         শুরু করুন
                      </button>
                    </div>
                  )}
                </div>

                {/* Add/Edit Modal */}
                <AnimatePresence>
                  {isAddingExplore && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center font-bn"
                    >
                      <motion.div 
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-8 soft-shadow max-h-[90vh] overflow-y-auto scrollbar-hide relative z-[120]"
                      >
                        <div className="flex items-center justify-between mb-8 sticky top-0 bg-white dark:bg-slate-900 z-10 pb-4 border-b border-slate-100 dark:border-slate-800">
                          <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                            {editingExplore ? 'সেবা এডিট করুন' : 'নতুন সেবা যোগ করুন'}
                          </h3>
                          <button 
                            onClick={() => {
                              setIsAddingExplore(false);
                              setEditingExplore(null);
                              setExploreErrors({});
                            }}
                            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
                          >
                            <X size={20} />
                          </button>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">সেবার নাম (En) *</h4>
                              <input 
                                type="text"
                                value={exploreFormData.title}
                                onChange={(e) => setExploreFormData({...exploreFormData, title: e.target.value})}
                                placeholder="উদা: Sreepur Sadar Hospital"
                                className={cn(
                                  "w-full bg-slate-50 dark:bg-slate-800 border-2 rounded-2xl p-4 outline-none transition-all",
                                  exploreErrors.title ? "border-rose-400 focus:border-rose-500" : "border-transparent focus:border-primary/30"
                                )}
                              />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">সেবার নাম (বাংলা) *</h4>
                              <input 
                                type="text"
                                value={exploreFormData.bengaliTitle}
                                onChange={(e) => setExploreFormData({...exploreFormData, bengaliTitle: e.target.value})}
                                placeholder="উদা: শ্রীপুর সদর হাসপাতাল"
                                className={cn(
                                  "w-full bg-slate-50 dark:bg-slate-800 border-2 rounded-2xl p-4 outline-none transition-all",
                                  exploreErrors.bengaliTitle ? "border-rose-400 focus:border-rose-500" : "border-transparent focus:border-primary/30"
                                )}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">ক্যাটাগরি *</h4>
                              <select 
                                value={exploreFormData.category}
                                onChange={(e) => setExploreFormData({...exploreFormData, category: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all appearance-none cursor-pointer font-bn"
                              >
                                {EXPLORE_CATEGORIES.map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.bn}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">সাব-ক্যাটাগরি</h4>
                              <input 
                                type="text"
                                value={exploreFormData.subCategory}
                                onChange={(e) => setExploreFormData({...exploreFormData, subCategory: e.target.value})}
                                placeholder="উদা: ডায়াগনস্টিক সেন্টার"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">সংক্ষিপ্ত বিবরণ (Short Description)</label>
                            <input 
                              type="text"
                              value={exploreFormData.shortDescription}
                              onChange={(e) => setExploreFormData({...exploreFormData, shortDescription: e.target.value})}
                              placeholder="১ লাইনের সংক্ষিপ্ত বর্ণনা"
                              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">বিস্তারিত বিবরণ (Full Description)</label>
                            <textarea 
                              rows={4}
                              value={exploreFormData.fullDescription}
                              onChange={(e) => setExploreFormData({...exploreFormData, fullDescription: e.target.value})}
                              placeholder="সেবা সম্পর্কে বিস্তারিত লিখুন..."
                              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">ফোন নম্বর</label>
                              <input 
                                type="tel"
                                value={exploreFormData.contactNumber}
                                onChange={(e) => setExploreFormData({...exploreFormData, contactNumber: e.target.value})}
                                placeholder="০১৭XXXXXXXX"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">হটলাইন (Hotline)</label>
                              <input 
                                type="tel"
                                value={exploreFormData.hotline}
                                onChange={(e) => setExploreFormData({...exploreFormData, hotline: e.target.value})}
                                placeholder="১৬২৬৭"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">ঠিকানা (Address)</label>
                            <input 
                              type="text"
                              value={exploreFormData.address}
                              onChange={(e) => setExploreFormData({...exploreFormData, address: e.target.value})}
                              placeholder="উদা: হাসপাতাল রোড, শ্রীপুর"
                              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">অফিস চলার সময় (Opening Hours)</label>
                              <input 
                                type="text"
                                value={exploreFormData.openingHours}
                                onChange={(e) => setExploreFormData({...exploreFormData, openingHours: e.target.value})}
                                placeholder="উদা: ৯০:০০ AM - ০৯:০০ PM"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">ওয়েবসাইট (Website)</label>
                              <input 
                                type="url"
                                value={exploreFormData.website}
                                onChange={(e) => setExploreFormData({...exploreFormData, website: e.target.value})}
                                placeholder="https://..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">ম্যাপ লিংক (Google Map Link)</label>
                            <input 
                              type="url"
                              value={exploreFormData.mapLink}
                              onChange={(e) => setExploreFormData({...exploreFormData, mapLink: e.target.value})}
                              placeholder="https://maps.apple.com/..."
                              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">Latitude</label>
                                <input 
                                  type="number"
                                  step="any"
                                  value={exploreFormData.latitude}
                                  onChange={(e) => setExploreFormData({...exploreFormData, latitude: parseFloat(e.target.value)})}
                                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl font-mono text-xs"
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 ml-1">Longitude</label>
                                <input 
                                  type="number"
                                  step="any"
                                  value={exploreFormData.longitude}
                                  onChange={(e) => setExploreFormData({...exploreFormData, longitude: parseFloat(e.target.value)})}
                                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl font-mono text-xs"
                                />
                             </div>
                          </div>

                          <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">সেবার ছবি (Service Image)</label>
                            
                            {/* Upload & Drag Drop Section */}
                            <div 
                              onClick={() => document.getElementById('serviceImageFileInput')?.click()}
                              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                                const file = e.dataTransfer.files?.[0];
                                if (file) handleUploadServiceImage(file);
                              }}
                              className={cn(
                                "w-full h-44 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300 relative overflow-hidden group border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                              )}
                            >
                              <input 
                                type="file" 
                                id="serviceImageFileInput" 
                                hidden 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadServiceImage(file);
                                }}
                              />
                              
                              {isUploadingServiceImage ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="animate-spin text-primary" size={24} />
                                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">আপলোড হচ্ছে... ({serviceImageProgress}%)</span>
                                </div>
                              ) : exploreFormData.image ? (
                                <div className="relative w-full h-full group">
                                  <img src={getDirectImageUrl(exploreFormData.image)} className="w-full h-full object-cover" alt="Preview" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl text-white text-xs font-bold border border-white/30">
                                      নতুন ছবি পরিবর্তন করুন
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center text-slate-400 p-4 text-center">
                                  <ImageIcon size={28} className="mb-2 text-slate-300 dark:text-slate-600" />
                                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">ছবি আপলোড করুন অথবা ড্র্যাগ করুন</p>
                                  <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, JPEG (Max 5MB)</p>
                                </div>
                              )}
                            </div>

                            {/* Manual Input Field (Useful fallback/edit) */}
                            <div className="space-y-1">
                              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 block">অথবা ছবির ইউআরএল দিন (Or Image URL):</span>
                              <input 
                                type="url"
                                value={exploreFormData.image}
                                onChange={(e) => setExploreFormData({...exploreFormData, image: e.target.value})}
                                placeholder="https://images.unsplash.com/..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all text-xs text-slate-600 dark:text-slate-300 font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent">
                                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">ফিচারড সেবা</span>
                                <button 
                                  onClick={() => setExploreFormData({...exploreFormData, featured: !exploreFormData.featured})}
                                  className={cn(
                                    "relative w-12 h-6 rounded-full transition-all duration-300 p-1 flex items-center shadow-inner",
                                    exploreFormData.featured ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300",
                                    exploreFormData.featured ? "translate-x-6" : "translate-x-0"
                                  )} />
                                </button>
                             </div>
                             <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent">
                                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">জরুরি সেবা</span>
                                <button 
                                  onClick={() => setExploreFormData({...exploreFormData, emergency: !exploreFormData.emergency})}
                                  className={cn(
                                    "relative w-12 h-6 rounded-full transition-all duration-300 p-1 flex items-center shadow-inner",
                                    exploreFormData.emergency ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300",
                                    exploreFormData.emergency ? "translate-x-6" : "translate-x-0"
                                  )} />
                                </button>
                             </div>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent">
                            <span className="font-bold text-slate-700 dark:text-slate-300">সক্রিয় করুন</span>
                            <button 
                              onClick={() => setExploreFormData({...exploreFormData, isVisible: !exploreFormData.isVisible})}
                              className={cn(
                                "relative w-14 h-7 rounded-full transition-all duration-300 p-1 flex items-center",
                                exploreFormData.isVisible ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                              )}
                            >
                              <div className={cn(
                                "w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300",
                                exploreFormData.isVisible ? "translate-x-7" : "translate-x-0"
                              )} />
                            </button>
                          </div>

                          <div className="flex gap-3 pt-4">
                            <button 
                              onClick={() => {
                                setIsAddingExplore(false);
                                setEditingExplore(null);
                                setExploreErrors({});
                              }}
                              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-bn font-bold transition-all hover:bg-slate-200"
                            >
                              বাতিল করুন
                            </button>
                            <button 
                              onClick={handleSaveExplore}
                              disabled={isActing === 'saving_explore'}
                              className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bn font-bold transition-all hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isActing === 'saving_explore' && <Loader2 size={18} className="animate-spin" />}
                              <span>{editingExplore ? 'আপডেট করুন' : 'সংরক্ষণ করুন'}</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : managementMode === 'BLOOD' ? (
              <div className="space-y-8 animate-fadeIn">
                {/* Header block */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 font-bn">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-3xl font-bn font-black text-slate-900 dark:text-white leading-tight">
                        {language === 'bn' ? 'ব্লাড ও রক্তদান ম্যানেজমেন্ট' : 'Blood & Donor Management'}
                      </h3>
                      <p className="text-xs font-bn text-muted mt-1 uppercase tracking-widest font-black opacity-60">
                        {language === 'bn' ? 'রক্তদাতা এবং জরুরি রক্তের অনুরোধ পরিচালনা করুন' : 'Real-time blood donors & emergency request center'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-red-500/10 text-red-650 px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest border border-red-500/20 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{getNum(allDonors.length.toString())} {language === 'bn' ? 'মোট রক্তদাতা' : 'Donors'}</span>
                    </div>
                    <div className="bg-orange-500/10 text-orange-650 px-4 py-2 rounded-xl text-[10px] font-bn font-black uppercase tracking-widest border border-orange-500/20 flex items-center gap-2">
                      <span>{getNum(allBloodRequests.length.toString())} {language === 'bn' ? 'রক্তের অনুরোধ' : 'Requests'}</span>
                    </div>
                  </div>
                </div>

                {/* Tab selector */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1.5 gap-1 rounded-2xl shrink-0 max-w-sm">
                  <button
                    onClick={() => { setBloodTabMode('donors'); setIsAddingBloodDonor(false); setEditingBloodDonor(null); }}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-center text-xs font-bn font-black transition-all cursor-pointer border-0",
                      bloodTabMode === 'donors'
                        ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200/40"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 bg-transparent"
                    )}
                  >
                    {language === 'bn' ? 'রক্তদাতা তালিকা' : 'Blood Donors'}
                  </button>
                  <button
                    onClick={() => { setBloodTabMode('requests'); setIsAddingBloodRequest(false); setEditingBloodRequest(null); }}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-center text-xs font-bn font-black transition-all cursor-pointer border-0",
                      bloodTabMode === 'requests'
                        ? "bg-white dark:bg-slate-900 text-rose-605 dark:text-rose-455 shadow-sm border border-slate-100/50"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 bg-transparent"
                    )}
                  >
                    {language === 'bn' ? 'জরুরি রক্তের অনুরোধসমূহ' : 'Emergency Requests'}
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {bloodTabMode === 'donors' ? (
                    <motion.div key="donors-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                      {/* Search & Add Blood Donor bar */}
                      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                        <div className="flex flex-wrap gap-2 items-center flex-1">
                          <input
                            type="text"
                            placeholder={language === 'bn' ? 'রক্তদাতা খুঁজুন (নাম, মোবাইল, এলাকা...)' : 'Search donors (name, phone, area...)'}
                            value={bloodSearchQuery}
                            onChange={(e) => setBloodSearchQuery(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bn outline-none focus:border-red-500 dark:text-white"
                          />
                          <select
                            value={bloodGroupFilter}
                            onChange={(e) => setBloodGroupFilter(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-display font-black outline-none focus:border-red-500 dark:text-white"
                          >
                            {['All', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(grp => (
                              <option key={grp} value={grp}>{grp === 'All' ? (language === 'bn' ? 'সব গ্রুপ' : 'All Groups') : grp}</option>
                            ))}
                          </select>
                        </div>
                        {!isAddingBloodDonor && !editingBloodDonor && (
                          <button
                            onClick={() => setIsAddingBloodDonor(true)}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bn font-black flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus size={14} />
                            <span>{language === 'bn' ? 'নতুন রক্তদাতা যোগ করুন' : 'Add New Donor'}</span>
                          </button>
                        )}
                      </div>

                      {/* Add/Edit Donor Form */}
                      {(isAddingBloodDonor || editingBloodDonor) && (
                        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                          <h4 className="font-bn font-black text-slate-800 dark:text-slate-100 text-sm">
                            {editingBloodDonor ? (language === 'bn' ? 'রক্তদাতার তথ্য পরিবর্তন করুন' : 'Edit Blood Donor') : (language === 'bn' ? 'নতুন রক্তদাতা যোগ করুন' : 'Add New Blood Donor')}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তদাতার নাম (বাংলা)' : 'Donor Name (Bengali)'}</label>
                              <input
                                type="text"
                                value={donorForm.name_bn}
                                onChange={e => setDonorForm({...donorForm, name_bn: e.target.value})}
                                placeholder="যেমন: আমিনুল ইসলাম"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তদাতার নাম (ইংরেজী)' : 'Donor Name (English)'}</label>
                              <input
                                type="text"
                                value={donorForm.name_en}
                                onChange={e => setDonorForm({...donorForm, name_en: e.target.value})}
                                placeholder="যেমন: Aminul Islam"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}</label>
                              <select
                                value={donorForm.group}
                                onChange={e => setDonorForm({...donorForm, group: e.target.value})}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-2.5 text-xs font-display font-black outline-none text-slate-800 dark:text-white"
                              >
                                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(grp => (
                                  <option key={grp} value={grp}>{grp}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'মোবাইল নাম্বার' : 'Mobile Phone'}</label>
                              <input
                                type="text"
                                value={donorForm.phone}
                                onChange={e => setDonorForm({...donorForm, phone: e.target.value})}
                                placeholder="01711223344"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'বর্তমান এলাকা (বাংলা)' : 'Location Area (Bengali)'}</label>
                              <input
                                type="text"
                                value={donorForm.location_bn}
                                onChange={e => setDonorForm({...donorForm, location_bn: e.target.value})}
                                placeholder="যেমন: মাওনা চৌরাস্তা"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'বর্তমান এলাকা (ইংরেজী)' : 'Location Area (English)'}</label>
                              <input
                                type="text"
                                value={donorForm.location_en}
                                onChange={e => setDonorForm({...donorForm, location_en: e.target.value})}
                                placeholder="যেমন: Maona Chowrasta"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'সর্বশেষ রক্তদানের সময় (বাংলা)' : 'Last Donation (Bengali)'}</label>
                              <input
                                type="text"
                                value={donorForm.last_donation_bn}
                                onChange={e => setDonorForm({...donorForm, last_donation_bn: e.target.value})}
                                placeholder="যেমন: ৩ মাস পূর্বে"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'সর্বশেষ রক্তদানের সময় (ইংরেজী)' : 'Last Donation (English)'}</label>
                              <input
                                type="text"
                                value={donorForm.last_donation_en}
                                onChange={e => setDonorForm({...donorForm, last_donation_en: e.target.value})}
                                placeholder="যেমন: 3 months ago"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              onClick={() => { setIsAddingBloodDonor(false); setEditingBloodDonor(null); }}
                              className="px-4 py-2 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-bn font-black"
                            >
                              {language === 'bn' ? 'বাতিল' : 'Cancel'}
                            </button>
                            <button
                              onClick={handleSaveBloodDonor}
                              disabled={isActing !== null}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bn font-black flex items-center gap-1.5"
                            >
                              {isActing === 'saving_donor' && <Loader2 size={12} className="animate-spin" />}
                              <span>{editingBloodDonor ? (language === 'bn' ? 'আপডেট করুন' : 'Update') : (language === 'bn' ? 'যোগ করুন' : 'Add')}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Donors list */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allDonors
                          .filter(d => {
                            const matchSearch = (d.name_bn || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                              (d.name_en || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                              (d.phone || '').includes(bloodSearchQuery.toLowerCase()) ||
                              (d.location_bn || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                              (d.location_en || '').toLowerCase().includes(bloodSearchQuery.toLowerCase());
                            const matchGroup = bloodGroupFilter === 'All' || d.group === bloodGroupFilter;
                            return matchSearch && matchGroup;
                          })
                          .map((donor, index) => (
                            <div key={donor.id ? `donor-${donor.id}-${index}` : `donor-fallback-${index}`} className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-red-500/30 transition-all group">
                              <div className="space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <h4 className="font-bn font-black text-slate-850 dark:text-white text-base leading-tight truncate">
                                      {language === 'bn' ? donor.name_bn : donor.name_en || donor.name_bn}
                                    </h4>
                                    <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-xs font-bn mt-1">
                                      <MapPin size={12} className="shrink-0" />
                                      <span className="truncate">{language === 'bn' ? donor.location_bn : donor.location_en || donor.location_bn}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-xs font-bn mt-1">
                                      <Phone size={12} className="shrink-0 text-emerald-555" />
                                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{donor.phone}</span>
                                    </div>
                                  </div>
                                  <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 rounded-full border border-rose-100 dark:border-rose-900/45 flex items-center justify-center shrink-0">
                                    <span className="font-display font-black text-rose-500 dark:text-rose-400 text-lg">
                                      {donor.group}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                                  <div className="space-y-0.5">
                                    <p className="text-[10px] font-bn text-slate-400 font-bold leading-none">{language === 'bn' ? 'সর্বশেষ দান' : 'Last Donation'}</p>
                                    <p className="text-xs font-bn font-extrabold text-slate-600 dark:text-slate-400 leading-normal">
                                      {language === 'bn' ? donor.last_donation_bn : donor.last_donation_en || 'Ready'}
                                    </p>
                                  </div>

                                  <button
                                    onClick={() => handleUpdateDonorAvailability(donor.id, !!donor.available)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bn font-black border uppercase tracking-wide leading-none transition-colors cursor-pointer ${
                                      donor.available
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
                                    }`}
                                  >
                                    {donor.available ? (language === 'bn' ? 'প্রস্তুত' : 'Ready') : (language === 'bn' ? 'অনুপযুক্ত' : 'Unavailable')}
                                  </button>
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end pt-3 mt-4 border-t border-slate-50 dark:border-slate-800">
                                <button
                                  onClick={() => {
                                    setEditingBloodDonor(donor);
                                    setDonorForm({
                                      name_bn: donor.name_bn || '',
                                      name_en: donor.name_en || '',
                                      group: donor.group || 'A+',
                                      location_bn: donor.location_bn || '',
                                      location_en: donor.location_en || '',
                                      phone: donor.phone || '',
                                      last_donation_bn: donor.last_donation_bn || '',
                                      last_donation_en: donor.last_donation_en || '',
                                      available: !!donor.available
                                    });
                                    setIsAddingBloodDonor(false);
                                  }}
                                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-xl transition-colors cursor-pointer"
                                  title="Edit Donor"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteBloodDonor(donor.id)}
                                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors cursor-pointer"
                                  title="Delete Donor"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                        ))}

                        {allDonors.length === 0 && (
                          <div className="col-span-full text-center py-12 text-slate-400 dark:text-slate-500 font-bn text-sm italic">
                            {language === 'bn' ? 'ডাটাবেসে কোনো রক্তদাতা পাওয়া যায়নি।' : 'No donors listed in database.'}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="requests-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                      {/* Search & Add Blood Request bar */}
                      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                        <div className="flex flex-wrap gap-2 items-center flex-1">
                          <input
                            type="text"
                            placeholder={language === 'bn' ? 'রক্তের অনুরোধ খুঁজুন (রোগীর নাম, হাসপাতাল...)' : 'Search requests (name, hospital...)'}
                            value={bloodSearchQuery}
                            onChange={(e) => setBloodSearchQuery(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bn outline-none focus:border-orange-500 dark:text-white"
                          />
                        </div>
                        {!isAddingBloodRequest && !editingBloodRequest && (
                          <button
                            onClick={() => setIsAddingBloodRequest(true)}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bn font-black flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus size={14} />
                            <span>{language === 'bn' ? 'নতুন জরুরি অনুরোধ যোগ করুন' : 'Post Emergency Request'}</span>
                          </button>
                        )}
                      </div>

                      {/* Add/Edit Requests Form */}
                      {(isAddingBloodRequest || editingBloodRequest) && (
                        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                          <h4 className="font-bn font-black text-slate-800 dark:text-slate-100 text-sm">
                            {editingBloodRequest ? (language === 'bn' ? 'অনুরোধটি সংশোধন করুন' : 'Edit Blood Request') : (language === 'bn' ? 'জরুরি রক্তের নতুন অনুরোধ পোস্ট করুন' : 'Post New Emergency Blood Request')}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রোগী/আবেদনকারীর নাম (বাংলা)' : 'Patient Name (Bengali)'}</label>
                              <input
                                type="text"
                                value={requestForm.name_bn}
                                onChange={e => setRequestForm({...requestForm, name_bn: e.target.value})}
                                placeholder="যেমন: আমিনুল ইসলাম"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রোগী/আবেদনকারীর নাম (ইংরেজী)' : 'Patient Name (English)'}</label>
                              <input
                                type="text"
                                value={requestForm.name_en}
                                onChange={e => setRequestForm({...requestForm, name_en: e.target.value})}
                                placeholder="যেমন: Aminul Islam"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}</label>
                              <select
                                value={requestForm.group}
                                onChange={e => setRequestForm({...requestForm, group: e.target.value})}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-2.5 text-xs font-display font-black outline-none text-slate-800 dark:text-white"
                              >
                                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(grp => (
                                  <option key={grp} value={grp}>{grp}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'প্রয়োজনীয় ব্যাগ' : 'Bags Needed'}</label>
                              <input
                                type="text"
                                value={requestForm.b_count_bn}
                                onChange={e => setRequestForm({...requestForm, b_count_bn: e.target.value})}
                                placeholder="যেমন: ২ ব্যাগ"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'মোবাইল নাম্বার' : 'Contact Phone'}</label>
                              <input
                                type="text"
                                value={requestForm.phone}
                                onChange={e => setRequestForm({...requestForm, phone: e.target.value})}
                                placeholder="01711223344"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'হাসপাতালের নাম ও ঠিকানা (বাংলা)' : 'Hospital Address (Bengali)'}</label>
                              <input
                                type="text"
                                value={requestForm.hospital_bn}
                                onChange={e => setRequestForm({...requestForm, hospital_bn: e.target.value})}
                                placeholder="যেমন: মাওনা আল-হেরা হাসপাতাল"
                                className="w-full bg-white dark:bg-slate-905 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'হাসপাতালের নাম ও ঠিকানা (ইংরেজী)' : 'Hospital Address (English)'}</label>
                              <input
                                type="text"
                                value={requestForm.hospital_en}
                                onChange={e => setRequestForm({...requestForm, hospital_en: e.target.value})}
                                placeholder="যেমন: Maona Al-Hera Hospital"
                                className="w-full bg-white dark:bg-slate-905 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-450 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'কবে প্রয়োজন? (বাংলা)' : 'Needed When? (Bengali)'}</label>
                              <input
                                type="text"
                                value={requestForm.date_bn}
                                onChange={e => setRequestForm({...requestForm, date_bn: e.target.value})}
                                placeholder="যেমন: আজ রাতে"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bn outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bn text-slate-455 dark:text-slate-400 font-bold ml-1">{language === 'bn' ? 'কবে প্রয়োজন? (ইংরেজী)' : 'Needed When? (English)'}</label>
                              <input
                                type="text"
                                value={requestForm.date_en}
                                onChange={e => setRequestForm({...requestForm, date_en: e.target.value})}
                                placeholder="যেমন: Tonight"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-sans outline-none text-slate-800 dark:text-white"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              onClick={() => { setIsAddingBloodRequest(false); setEditingBloodRequest(null); }}
                              className="px-4 py-2 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-bn font-black"
                            >
                              {language === 'bn' ? 'বাতিল' : 'Cancel'}
                            </button>
                            <button
                              onClick={handleSaveBloodRequest}
                              disabled={isActing !== null}
                              className="px-4 py-2 bg-red-500 hover:bg-red-650 text-white rounded-xl text-xs font-bn font-black flex items-center gap-1.5"
                            >
                              {isActing === 'saving_request' && <Loader2 size={12} className="animate-spin" />}
                              <span>{editingBloodRequest ? (language === 'bn' ? 'আপডেট করুন' : 'Update') : (language === 'bn' ? 'যোগ করুন' : 'Add')}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Requests list */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allBloodRequests
                          .filter(r => (r.name_bn || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                            (r.name_en || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                            (r.hospital_bn || '').toLowerCase().includes(bloodSearchQuery.toLowerCase()) ||
                            (r.hospital_en || '').toLowerCase().includes(bloodSearchQuery.toLowerCase())
                          )
                          .map((req, index) => (
                            <div key={req.id ? `req-${req.id}-${index}` : `req-fallback-${index}`} className="p-6 bg-rose-50/10 dark:bg-rose-955/5 rounded-2xl border border-rose-100/30 dark:border-rose-900/10 shadow-sm flex flex-col justify-between hover:border-red-500/20 transition-all group">
                              <div className="space-y-3.5">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="bg-red-500 text-white font-display font-black px-2 py-0.5 rounded text-[10px] leading-none select-none">
                                        {req.group}
                                      </span>
                                      <span className="font-bn font-bold text-xs text-rose-600">
                                        {language === 'bn' ? req.b_count_bn : req.b_count_en || req.b_count_bn}
                                      </span>
                                    </div>
                                    <h5 className="font-bn font-black text-slate-800 dark:text-white text-base mt-2.5 truncate">
                                      {language === 'bn' ? req.name_bn : req.name_en || req.name_bn}
                                    </h5>
                                    <p className="font-bn text-xs text-slate-500 dark:text-slate-400 mt-1.5 min-w-0 flex items-center gap-1.5">
                                      <MapPin size={12} className="text-slate-400 shrink-0" />
                                      <span className="truncate text-slate-700 dark:text-slate-350">{language === 'bn' ? req.hospital_bn : req.hospital_en || req.hospital_bn}</span>
                                    </p>
                                    <p className="font-bn text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                                      <Clock size={12} className="text-slate-400 shrink-0" />
                                      <span className="font-bold text-slate-600 dark:text-slate-400">{language === 'bn' ? req.date_bn : req.date_en || req.date_bn}</span>
                                    </p>
                                    <p className="font-bn text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                                      <Phone size={12} className="text-emerald-500 shrink-0" />
                                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{req.phone}</span>
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end pt-3 mt-4 border-t border-slate-100 dark:border-slate-800">
                                <button
                                  onClick={() => {
                                    setEditingBloodRequest(req);
                                    setRequestForm({
                                      name_bn: req.name_bn || '',
                                      name_en: req.name_en || '',
                                      group: req.group || 'A+',
                                      hospital_bn: req.hospital_bn || '',
                                      hospital_en: req.hospital_en || '',
                                      phone: req.phone || '',
                                      date_bn: req.date_bn || '',
                                      date_en: req.date_en || '',
                                      b_count_bn: req.b_count_bn || '১ ব্যাগ',
                                      b_count_en: req.b_count_en || '1 Bag'
                                    });
                                    setIsAddingBloodRequest(false);
                                  }}
                                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-xl transition-colors cursor-pointer"
                                  title="Edit Request"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteBloodRequest(req.id)}
                                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors cursor-pointer"
                                  title="Delete Request"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                        ))}

                        {allBloodRequests.length === 0 && (
                          <div className="col-span-full text-center py-12 text-slate-400 dark:text-slate-500 font-bn text-sm italic">
                            {language === 'bn' ? 'ডাটাবেসে কোনো সক্রিয় রক্তের অনুরোধ পাওয়া যায়নি।' : 'No active blood requests in database.'}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : managementMode === 'VERIFICATIONS' ? (
              <div className="space-y-8 animate-fadeIn font-bn">
                {/* Header block */}
                <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">মার্কেটপ্লেস যাচাইকরণ অনুরোধ</h3>
                    <p className="text-xs text-muted mt-1 uppercase tracking-widest font-black opacity-60">বিক্রেতা এবং রাইডার আবেদনসমূহ যাচাই করুন</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-6">
                  <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="text-amber-500" size={16} /> পেন্ডিং যাচাইকরণ অনুরোধসমূহ ({allVerifications.filter(v => v.status === 'pending').length})
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {allVerifications.filter(v => v.status === 'pending').map((req, idx) => {
                      const vName = req.userName || req.name || 'আবেদনকারী';
                      const vPhone = req.details?.phone || req.phone || 'N/A';
                      const vAddress = req.details?.address || req.address || 'N/A';
                      const vNid = req.details?.nid || req.nidNumber || 'N/A';
                      const vBusinessName = req.details?.businessName || req.businessName;
                      const vVehicleType = req.details?.vehicleType || req.vehicleType;
                      const vPhoto = req.details?.imageUrl || req.docPhoto;
                      const vLat = req.details?.lat;
                      const vLng = req.details?.lng;

                      return (
                        <div key={req.id ? `verification-${req.id}-${idx}` : `verification-fallback-${idx}`} className="border border-slate-100 dark:border-slate-800 rounded-[2rem] p-5 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={cn(
                                "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider",
                                req.type === 'seller' ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"
                              )}>
                                {req.type === 'seller' ? 'বিক্রেতা আবেদন' : 'রাইডার আবেদন'}
                              </span>
                              <h4 className="font-bold text-slate-800 dark:text-white text-sm mt-2">{vName}</h4>
                              <p className="text-[10px] text-slate-400 mt-1">ফোন: {vPhone}</p>
                            </div>
                            {vBusinessName && (
                              <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2.5 py-1 rounded-lg">
                                {vBusinessName}
                              </span>
                            )}
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl text-[10px] text-slate-500 space-y-1.5 border border-slate-100 dark:border-slate-900">
                            <div><strong>জাতীয় পরিচয়পত্র (NID):</strong> {vNid}</div>
                            <div><strong>ঠিকানা:</strong> {vAddress}</div>
                            {vVehicleType && <div><strong>যানবাহনের ধরণ:</strong> {vVehicleType}</div>}
                            {(vLat && vLng) && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingLocation({
                                      lat: Number(vLat),
                                      lng: Number(vLng),
                                      address: vAddress,
                                      title: req.type === 'seller' ? (language === 'bn' ? 'বিক্রেতার অবস্থান' : 'Seller Location') : (language === 'bn' ? 'রাইডারের অবস্থান' : 'Rider Location'),
                                      subtitle: language === 'bn' ? 'আবেদনকারীর সঠিক অবস্থান ম্যাপে' : 'Applicant exact location on map'
                                    });
                                  }}
                                  className="inline-flex items-center gap-1.5 text-blue-500 hover:underline font-bold"
                                >
                                  <MapPin size={12} className="text-blue-500 shrink-0" />
                                  <span>অবস্থান ম্যাপে দেখুন ({vLat?.toFixed(4)}, {vLng?.toFixed(4)})</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {vPhoto && (
                            <div className="rounded-xl overflow-hidden max-h-40 border border-slate-100 dark:border-slate-800 relative group">
                              <img referrerPolicy="no-referrer" src={vPhoto} alt="Verification Doc" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a href={vPhoto} target="_blank" rel="noreferrer" className="text-white text-[10px] bg-slate-900/80 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider">
                                  বড় করে দেখুন
                                </a>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => handleApproveVerification(req)}
                              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10"
                            >
                              অনুমোদন করুন
                            </button>
                            <button
                              onClick={() => handleRejectVerification(req)}
                              className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-500/10"
                            >
                              প্রত্যাখ্যান করুন
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {allVerifications.filter(v => v.status === 'pending').length === 0 && (
                      <div className="col-span-full text-center py-12 text-slate-400 dark:text-slate-500 italic text-xs">
                        কোনো পেন্ডিং যাচাইকরণ অনুরোধ নেই।
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : managementMode === 'WITHDRAWALS' ? (
              <div className="space-y-8 animate-fadeIn font-bn">
                {/* Header block */}
                <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => setManagementMode('OVERVIEW')} className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:text-primary transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">অর্থ উত্তোলন ও ওয়ালেট রিচার্জ অনুরোধ</h3>
                    <p className="text-xs text-muted mt-1 uppercase tracking-widest font-black opacity-60">উদ্যোক্তা ও রাইডারদের পেমেন্ট ও রিচার্জ অনুরোধ সম্পন্ন করুন</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Withdrawal requests */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <CreditCard className="text-rose-500" size={16} /> পেন্ডিং অর্থ উত্তোলন অনুরোধ ({allWithdrawals.filter(w => w.status === 'pending').length})
                    </h4>

                    <div className="space-y-4">
                      {allWithdrawals.filter(w => w.status === 'pending').map((req, idx) => (
                        <div key={req.id ? `withdraw-admin-${req.id}-${idx}` : `withdraw-admin-fallback-${idx}`} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-slate-800 dark:text-white">{req.userName || 'উদ্যোক্তা/রাইডার'}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">টাইপ: {req.userType === 'seller' ? 'বিক্রেতা' : 'রাইডার'}</p>
                            </div>
                            <span className="text-rose-500 font-black text-sm">৳{req.amount}</span>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg text-[10px] text-slate-500 flex justify-between">
                            <span><strong>বিকাশ নম্বর:</strong> {req.bkashNumber}</span>
                            <span>{req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('bn-BD') : ''}</span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveWithdrawal(req)}
                              className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-lg transition-all"
                            >
                              অনুমোদন
                            </button>
                            <button
                              onClick={() => handleRejectWithdrawal(req)}
                              className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold rounded-lg transition-all"
                            >
                              বাতিল
                            </button>
                          </div>
                        </div>
                      ))}

                      {allWithdrawals.filter(w => w.status === 'pending').length === 0 && (
                        <div className="text-center py-12 text-slate-400 dark:text-slate-500 italic">
                          কোনো পেন্ডিং অর্থ উত্তোলন অনুরোধ পাওয়া যায়নি।
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recharge requests */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-6 soft-shadow space-y-4">
                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <CreditCard className="text-emerald-500" size={16} /> পেন্ডিং ওয়ালেট রিচার্জ অনুরোধ ({allRecharges.filter(r => r.status === 'pending').length})
                    </h4>

                    <div className="space-y-4">
                      {allRecharges.filter(r => r.status === 'pending').map((req, idx) => (
                        <div key={req.id ? `recharge-admin-${req.id}-${idx}` : `recharge-admin-fallback-${idx}`} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-slate-800 dark:text-white">{req.userName || 'গ্রাহক'}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">রিসেন্ড নম্বর: {req.senderPhone || req.phone}</p>
                            </div>
                            <span className="text-emerald-500 font-black text-sm">৳{req.amount}</span>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg text-[10px] text-slate-500 space-y-1">
                            <div><strong>Transaction ID (TxID):</strong> <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{req.txid || req.txId}</span></div>
                            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                              <span>মেথড: বিকাশ</span>
                              <span>{req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('bn-BD') : ''}</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveRecharge(req)}
                              className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-lg transition-all"
                            >
                              অনুমোদন
                            </button>
                            <button
                              onClick={() => handleRejectRecharge(req)}
                              className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-bold rounded-lg transition-all"
                            >
                              বাতিল
                            </button>
                          </div>
                        </div>
                      ))}

                      {allRecharges.filter(r => r.status === 'pending').length === 0 && (
                        <div className="text-center py-12 text-slate-400 dark:text-slate-500 italic">
                          কোনো পেন্ডিং ওয়ালেট রিচার্জ অনুরোধ পাওয়া যায়নি।
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center">
                <p className="text-muted font-bn italic">এই মডিউলটি তৈরির কাজ চলছে...</p>
                <button onClick={() => setManagementMode('OVERVIEW')} className="text-primary font-bn font-bold">ফিরে যান</button>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'DASHBOARD' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8 pb-10"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <button 
                onClick={() => { setActiveTab('MANAGEMENT'); setManagementMode('USERS'); }}
                className="group transition-transform active:scale-95 text-left w-full h-full block focus:outline-none"
              >
                <AdminStat 
                  label={t.admin.statsUsers} 
                  value={loading ? "..." : getNum(stats.totalUsers.toLocaleString())} 
                  icon={Users} 
                  color="bg-indigo-500 shadow-indigo-500/30" 
                  trend="+12%"
                />
              </button>
              <button 
                onClick={() => { setActiveTab('MANAGEMENT'); setManagementMode('REPORTS'); }}
                className="group transition-transform active:scale-95 text-left w-full h-full block focus:outline-none"
              >
                <AdminStat 
                  label={t.titles.trackPending} 
                  value={loading ? "..." : getNum(stats.newReports.toString())} 
                  icon={FileWarning} 
                  color="bg-rose-500 shadow-rose-500/30" 
                  trend="High"
                />
              </button>
              <button 
                onClick={() => { setActiveTab('MANAGEMENT'); setManagementMode('EXPLORE'); }}
                className="group transition-transform active:scale-95 text-left w-full h-full block focus:outline-none"
              >
                <AdminStat 
                  label={t.admin.statsExplore} 
                  value={loading ? "..." : getNum(stats.totalExplore.toLocaleString())} 
                  icon={LayoutGrid} 
                  color="bg-violet-500 shadow-violet-500/30" 
                />
              </button>
              <button 
                onClick={() => { setActiveTab('MANAGEMENT'); setManagementMode('NEWS'); }}
                className="group transition-transform active:scale-95 text-left w-full h-full block focus:outline-none"
              >
                <AdminStat 
                  label={t.admin.statsNews} 
                  value={loading ? "..." : getNum(stats.totalNews.toString())} 
                  icon={Newspaper} 
                  color="bg-emerald-500 shadow-emerald-500/30" 
                  trend="New"
                />
              </button>
            </div>

            {/* Pending Reports Action Center */}
            {stats.newReports > 0 && !loading && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200 dark:border-amber-900/30 p-8 rounded-3xl relative overflow-hidden group shadow-sm"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                  <FileWarning size={140} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 px-3 py-1 rounded-full text-[10px] font-bn font-bold uppercase tracking-wider mb-3">
                      <Activity size={12} className="animate-pulse" /> অ্যাকশন প্রয়োজন
                    </div>
                    <h3 className="text-2xl font-bn font-bold text-slate-800 dark:text-white">পেন্ডিং অভিযোগ যাচাই করুন</h3>
                    <p className="text-xs font-bn text-slate-600 dark:text-slate-400 mt-1 max-w-md">ড্যাশবোর্ডে বর্তমানে <span className="font-bold text-orange-600 dark:text-orange-400 font-mono tracking-wide">{stats.newReports}টি</span> অভিযোগ তদন্তের অপেক্ষায় রয়েছে। নাগরিকদের সমস্যা সমাধানে দ্রুত পদক্ষেপ নিন।</p>
                  </div>
                  <button 
                    onClick={() => { setActiveTab('MANAGEMENT'); setManagementMode('REPORTS'); }}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bn font-bold px-8 py-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap self-start md:self-auto"
                  >
                    বিস্তারিত লিস্ট দেখুন <ChevronRight size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Split layout for wider screens */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Group: Big analytic charts (8-columns) */}
              <div className="lg:col-span-8 space-y-8">
                {/* User Growth */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Activity size={18} className="text-blue-500" /> ইউজার গ্রোথ
                    </h4>
                    <span className="text-[10px] font-bn font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-2 py-1 rounded-lg">সাম্প্রতিক</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartsData.userGrowth}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                          }} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#3b82f6" 
                          strokeWidth={4} 
                          dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Reports by Category */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <BarChart3 size={20} className="text-red-500" /> {language === 'bn' ? "ক্যাটাগরি ভিত্তিক অভিযোগ" : "Reports by Category"}
                    </h4>
                    <span className="text-[10px] font-bn font-bold bg-red-50 dark:bg-red-900/20 text-red-600 px-2 py-1 rounded-lg">{language === 'bn' ? "শীর্ষ ক্যাটাগরি" : "Top Categories"}</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartsData.reportCategories} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={90} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600, fontFamily: 'Inter, Hind Siliguri' }} 
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="value" fill="#EF4444" radius={[0, 10, 10, 0]} barSize={24}>
                          {chartsData.reportCategories.map((entry: any, index: number) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1'][index % 7]} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Popular Services usage */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <h4 className="font-bn font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <BarChart3 size={18} className="text-secondary" /> সর্বাধিক জনপ্রিয় সেবা
                  </h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartsData.serviceUsage} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Bar dataKey="value" fill="#E2136E" radius={[0, 10, 10, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Right Group: Feed, Announcements & Status donuts (4-columns) */}
              <div className="lg:col-span-4 space-y-8">
                {/* Recent Notifications */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Bell size={18} className="text-primary" /> সাম্প্রতিক ঘোষণা
                    </h4>
                    <button onClick={() => setActiveTab('NOTIFICATIONS')} className="text-[10px] font-bn font-bold text-primary hover:underline">নতুন পাঠান</button>
                  </div>
                  <div className="space-y-3">
                    {allNotifications.slice(0, 3).length > 0 ? (
                      allNotifications.slice(0, 3).map((notif, index) => (
                        <div key={`${notif.id}-${index}`} className={cn(
                          "p-4 rounded-2xl border flex items-center gap-3 transition-all",
                          index === 0 ? "bg-primary/5 border-primary/20" : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800"
                        )}>
                          <div className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            notif.type === 'emergency' ? "bg-red-500 animate-pulse" : "bg-primary"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bn font-bold text-slate-800 dark:text-slate-200 truncate">{notif.title}</p>
                            <p className="text-[10px] text-muted font-bn">
                              {notif.createdAt instanceof Timestamp 
                                ? notif.createdAt.toDate().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }) 
                                : 'অজানা সময়'}
                            </p>
                          </div>
                          {notif.type === 'emergency' && (
                            <AlertTriangle size={14} className="text-red-500 shrink-0" />
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-[10px] font-bn text-muted py-4">কোনো ঘোষণা পাওয়া যায়নি</p>
                    )}
                  </div>
                </div>

                {/* Report Status Distribution (PieChart) */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <PieChartIcon size={20} className="text-amber-500" /> {language === 'bn' ? "অভিযোগের অবস্থা" : "Report Status"}
                    </h4>
                  </div>
                  <div className="h-64 w-full relative">
                    <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                      <p className="text-3xl font-mono font-bold text-slate-800 dark:text-white">{stats.totalReports}</p>
                      <p className="text-[9px] font-bn text-muted uppercase font-bold">{language === 'bn' ? "মোট অভিযোগ" : "Total Reports"}</p>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartsData.reportStatus}
                          cx="50%"
                          cy="40%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          labelLine={false}
                          className="font-bn text-[10px] font-bold fill-white"
                        >
                          {chartsData.reportStatus.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            backgroundColor: '#111827', 
                            color: '#f9fafb',
                            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                            fontSize: '11px'
                          }}
                          itemStyle={{ color: '#f9fafb', fontWeight: 'bold' }}
                        />
                        <Legend 
                          layout="horizontal" 
                          verticalAlign="bottom" 
                          align="center"
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => <span className="font-bn text-[10px] font-bold text-slate-600 dark:text-slate-400">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Activities */}
                <div className="bg-slate-100 dark:bg-slate-800/50 p-6 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700/80">
                  <h5 className="text-xs font-bn font-bold text-muted uppercase mb-5 tracking-widest text-center">সাম্প্রতিক এক্টিভিটি লোগ</h5>
                  <div className="space-y-4">
                    {stats.recentActivity.length > 0 ? (
                      stats.recentActivity.map((act, idx) => (
                        <RecentActivity 
                          key={`${act.id}-${idx}`} 
                          user={act.user} 
                          time={act.time} 
                          action={act.action} 
                          icon={act.icon} 
                          color={act.color}
                        />
                      ))
                    ) : (
                      <p className="text-center text-xs font-bn text-muted py-4">কোনো সাম্প্রতিক এক্টিভিটি পাওয়া যায়নি</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : activeTab === 'NOTIFICATIONS' ? (
          <motion.div
            key="notification"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-8 pb-10"
          >
            {/* Full-width composer form container, beautifully designed & centered */}
            <div className="w-full max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 md:p-10 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3.5 mb-8 pb-4 border-b border-slate-100 dark:border-slate-700/50">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Megaphone size={22} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bn font-black text-slate-800 dark:text-white text-xl leading-none mb-1.5">ঘোষণা কম্পোজ করুন</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-bn uppercase tracking-widest leading-none">যেকোনো নোটিশ বা পুশ সতর্কতা প্রচার করুন</p>
                </div>
              </div>

              <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1 select-none">
                      {t.titles.notifType}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(['notice', 'emergency', 'update'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNotifType(type)}
                          className={cn(
                            "py-4 px-4 rounded-2xl font-bn font-black text-sm transition-all border flex items-center justify-center gap-3 shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0",
                            notifType === type 
                              ? type === 'emergency'
                                ? "bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/15"
                                : type === 'update'
                                ? "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/15"
                                : "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/15"
                              : "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                          )}
                        >
                          {type === 'emergency' ? <AlertCircle size={18} /> : type === 'update' ? <Sparkles size={18} /> : <Info size={18} />}
                          <span>{type === 'notice' ? t.titles.typeGeneral : type === 'emergency' ? t.titles.typeEmergency : t.titles.typeUpdate}</span>
                        </button>
                      ))}
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                      {t.titles.notifTitle}
                    </label>
                    <input 
                      type="text" 
                      value={notifTitle}
                      onChange={e => setNotifTitle(e.target.value)}
                      placeholder={t.titles.notifPlaceholder}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/85 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 outline-none py-3.5 px-5 rounded-2xl font-bn transition-all text-slate-800 dark:text-slate-100 font-bold placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-sm text-sm"
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-bn font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                      {t.titles.notifMessage}
                    </label>
                    <textarea 
                      rows={5}
                      value={notifMessage}
                      onChange={e => setNotifMessage(e.target.value)}
                      placeholder={t.titles.messagePlaceholder}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/85 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 outline-none py-4 px-5 rounded-3xl font-bn transition-all resize-none text-slate-800 dark:text-slate-100 leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600 min-h-[160px] shadow-sm text-sm"
                    />
                 </div>

                 <div className="flex items-start gap-3.5 p-5 bg-amber-50/40 dark:bg-amber-500/5 rounded-2xl border border-amber-200/60 dark:border-amber-500/10">
                    <AlertTriangle className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="space-y-1">
                      <h5 className="text-xs font-bn font-black text-amber-800 dark:text-amber-300">গুরুত্বপূর্ণ সতর্কতা</h5>
                      <p className="text-[11px] font-bn text-amber-700/90 dark:text-amber-400/80 leading-relaxed">নোটিফিকেশনটি সেন্ড করার পর সকল ইউজারের ফোনে সাথে সাথে পুশ অ্যালার্ট হিসেবে চলে যাবে। পুনরায় ডিলিট করার কোনো অপশন নেই।</p>
                    </div>
                 </div>

                 <button 
                  onClick={handleSendNotification}
                  disabled={isSending || !notifTitle || !notifMessage}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bn font-black text-base shadow-lg justify-center items-center gap-2.5 transition-all flex disabled:opacity-50 disabled:scale-100 cursor-pointer text-white hover:-translate-y-0.5 active:translate-y-0 shadow-sm",
                    notifType === 'emergency' 
                      ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20 hover:shadow-rose-500/30 active:scale-[0.98]" 
                      : notifType === 'update' 
                      ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-[0.98]" 
                      : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]"
                  )}
                 >
                   {isSending ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="animate-spin text-white" size={20} />
                        <span>প্রক্রিয়াকরণ হচ্ছে...</span>
                      </div>
                   ) : (
                      <>
                        <span>{t.titles.sendAnnouncement}</span>
                        <Send size={18} className="stroke-[2.5]" />
                      </>
                   )}
                 </button>
              </div>
            </div>

             {/* Recent Notifications List */}
             <div className="space-y-4">
                <h3 className="text-sm font-bn font-bold text-muted uppercase ml-2">
                  {language === 'bn' ? 'সাম্প্রতিক ঘোষণাগুলি' : 'Recently Sent Announcements'}
                </h3>
                <div className="space-y-4">
                  {isLoadingNotifs ? (
                    <div className="flex justify-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-primary" size={28} />
                        <span className="text-[10px] font-bn font-bold text-slate-400 uppercase tracking-widest">লোড হচ্ছে...</span>
                      </div>
                    </div>
                  ) : recentNotifs.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {recentNotifs.map((notif, idx) => (
                        <motion.div 
                          key={`${notif.id}-${idx}`}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.08 }}
                          className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100/90 dark:border-slate-800/85 shadow-sm hover:shadow-md transition-all group overflow-hidden relative"
                        >
                          <div className={cn(
                            "absolute top-0 left-0 w-1.5 h-full",
                            notif.type === 'emergency' ? "bg-rose-500" : 
                            notif.type === 'update' ? "bg-blue-500" : "bg-emerald-500"
                          )} />
                          
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-colors",
                              notif.type === 'emergency' ? "bg-rose-50 dark:bg-rose-950/30 text-rose-500 dark:text-rose-450" : 
                              notif.type === 'update' ? "bg-blue-50 dark:bg-blue-950/30 text-blue-500 dark:text-blue-450" : 
                              "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-450"
                            )}>
                              <Bell size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <h4 className="font-bn font-black text-slate-800 dark:text-white truncate text-lg">{notif.title}</h4>
                                <span className={cn(
                                  "text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider font-bn border shrink-0",
                                  notif.type === 'emergency' ? "bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/30" : 
                                  notif.type === 'update' ? "bg-blue-50 dark:bg-blue-950/25 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30" : 
                                  "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                                )}>
                                  {notif.type === 'emergency' ? t.titles.typeEmergency : notif.type === 'update' ? t.titles.typeUpdate : t.titles.typeGeneral}
                                </span>
                              </div>
                              <p className="text-sm font-bn text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{notif.message}</p>
                              
                              <div className="flex items-center justify-between mt-3.5">
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bn">
                                  <Clock size={12} />
                                  <span>
                                    {notif.createdAt instanceof Timestamp 
                                      ? notif.createdAt.toDate().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                                      : 'Just now'}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleShare({
                                    title: notif.title,
                                    text: notif.message,
                                    url: window.location.href
                                  })}
                                  className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all active:scale-90"
                                >
                                  <Share2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 p-16 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 text-center">
                       <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Bell className="text-slate-200" size={40} />
                       </div>
                       <p className="text-sm text-slate-400 font-bn font-bold tracking-widest">{language === 'bn' ? 'কোনো ইতিহাস নেই' : 'No history found'}</p>
                       <p className="text-[10px] text-slate-300 font-bn mt-1">{language === 'bn' ? 'নতুন ঘোষণা পাঠালে এখানে দেখা যাবে' : 'Sent announcements will appear here'}</p>
                    </div>
                  )}
                </div>
             </div>
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6 pb-10"
          >
             <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl soft-shadow border border-slate-100 dark:border-slate-700">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-bn font-bold text-slate-800 dark:text-white flex items-center gap-2">
                   <Settings className="text-primary" size={20} /> সেটিংস ও কন্ট্রোল
                 </h3>
                 {isSavingSettings && <Loader2 className="animate-spin text-primary" size={18} />}
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all hover:border-primary/30">
                    <div>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-white mb-1">
                        <ShieldCheck size={18} className={cn(appSettings.maintenanceMode ? "text-red-500" : "text-primary")} />
                        <span className="font-bn font-bold">মেইনটেন্যান্স মোড</span>
                      </div>
                      <p className="text-[10px] font-bn text-muted">অ্যাপটি সাময়িকভাবে বন্ধ রাখতে এটি ব্যবহার করুন</p>
                    </div>
                    <button 
                      onClick={() => handleUpdateSetting('maintenanceMode', !appSettings.maintenanceMode)}
                      className={cn(
                        "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                        appSettings.maintenanceMode ? "bg-red-500 justify-end" : "bg-slate-200 dark:bg-slate-800 justify-start"
                      )}
                    >
                      <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                    </button>
                  </div>
                  
                  <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all hover:border-primary/30">
                    <div>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-white mb-1">
                        <Bell size={18} className="text-emerald-500" />
                        <span className="font-bn font-bold">অ্যাপ ব্যানার</span>
                      </div>
                      <p className="text-[10px] font-bn text-muted">ইউজারদের জন্য গুরুত্বপূর্ণ মেসেজ সেট করুন</p>
                    </div>
                    <button 
                      onClick={() => {
                        const val = window.prompt('অ্যাপ ব্যানার টেক্সট দিন:', appSettings.appBanner);
                        if (val !== null) handleUpdateSetting('appBanner', val);
                      }}
                      className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-xl text-[10px] font-bn font-bold hover:bg-emerald-100 transition-colors"
                    >
                      আপডেট
                    </button>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all hover:border-primary/30">
                    <div>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-white mb-1">
                        <AlertCircle size={18} className="text-orange-500" />
                        <span className="font-bn font-bold">সিস্টেম অ্যালার্ট</span>
                      </div>
                      <p className="text-[10px] font-bn text-muted">হোম স্ক্রিনে গুরুত্বপূর্ণ অ্যালার্ট দেখান</p>
                    </div>
                    <button 
                      onClick={() => {
                        const val = window.prompt('সিস্টেম অ্যালার্ট ডেসক্রিপশন দিন:', appSettings.systemAlert);
                        if (val !== null) handleUpdateSetting('systemAlert', val);
                      }}
                      className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-xl text-[10px] font-bn font-bold hover:bg-orange-100 transition-colors"
                    >
                      আপডেট
                    </button>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all hover:border-primary/30">
                    <div>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-white mb-1">
                        <AlertTriangle size={18} className="text-red-500" />
                        <span className="font-bn font-bold">ক্লিনআপ ডাটাবেস</span>
                      </div>
                      <p className="text-[10px] font-bn text-muted">পুরাতন অভিযোগ ও অপ্রয়োজনীয় ডাটা ডিলিট করুন</p>
                    </div>
                    <button 
                      onClick={handleClearAllReports}
                      disabled={isActing === 'clearing_all'}
                      className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl text-[10px] font-bn font-bold hover:bg-red-100 transition-colors"
                    >
                      {isActing === 'clearing_all' ? <Loader2 size={14} className="animate-spin" /> : 'ক্লিন করুন'}
                    </button>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-all hover:border-primary/30">
                    <div>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-white mb-1">
                        <LayoutDashboard size={18} className="text-blue-500" />
                        <span className="font-bn font-bold">তথ্য আপডেট</span>
                      </div>
                      <p className="text-[10px] font-bn text-muted">সাপোর্ট ইমেইল ও ফোন নম্বর পরিবর্তন করুন</p>
                    </div>
                    <button 
                      onClick={() => {
                        const email = window.prompt('সাপোর্ট ইমেইল:', appSettings.contactEmail);
                        const phone = window.prompt('সাপোর্ট ফোন:', appSettings.supportPhone);
                        if (email && phone) {
                          handleUpdateSetting('contactEmail', email);
                          handleUpdateSetting('supportPhone', phone);
                        }
                      }}
                      className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-xl text-[10px] font-bn font-bold hover:bg-blue-100 transition-colors"
                    >
                      পরিবর্তন
                    </button>
                  </div>
               </div>
               
               <div className="mt-8 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                 <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bn font-bold text-sm text-slate-500 uppercase tracking-widest">ডাটা ড্যাশবোর্ড কনফিগারেশন</h4>
                    <button 
                      onClick={handleSeedExploreData}
                      disabled={isSeeding}
                      className="text-[10px] font-bn font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} সিড এক্সপ্লোর ডাটা
                    </button>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-sm font-bn font-bold text-slate-700 dark:text-slate-300">অ্যাডমিন প্যানেল থিম কালার</span>
                    <div className="flex gap-2">
                      {['#E2136E', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map(color => (
                        <button key={color} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 soft-shadow hover:scale-110 transition-transform" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                 </div>
               </div>
             </div>
             
             <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl soft-shadow border border-slate-100 dark:border-slate-700">
               <h3 className="text-xl font-bn font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                 <Loader2 className="text-blue-500" size={20} /> অ্যাডমিন এক্টিভিটি লোগ
               </h3>
               <div className="space-y-3 opacity-60">
                 {[1, 2, 3].map(i => (
                   <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0 italic">
                     <Clock size={12} className="text-slate-400" />
                     <p className="text-xs font-bn text-slate-500">অ্যাডমিন {i} সিস্টেম কনফিগারেশন পরিবর্তন করেছেন...</p>
                   </div>
                 ))}
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Location Viewing/Selecting Modal */}
      <MapModal 
        isOpen={!!viewingLocation}
        onClose={() => {
          setViewingLocation(null);
          setShowingMapPickerFor(null);
        }}
        initialPosition={viewingLocation ? { lat: viewingLocation.lat, lng: viewingLocation.lng } : undefined}
        onConfirm={(pos) => {
          if (showingMapPickerFor === 'explore') {
            setExploreFormData({
              ...exploreFormData,
              latitude: pos.lat,
              longitude: pos.lng,
              address: pos.address || ''
            });
          } else if (showingMapPickerFor === 'provider') {
            setProviderFormData({
              ...providerFormData,
              location: { lat: pos.lat, lng: pos.lng },
              address: pos.address || providerFormData.address
            });
          }
          setViewingLocation(null);
          setShowingMapPickerFor(null);
        }}
        isViewOnly={!showingMapPickerFor}
        title={viewingLocation?.title}
        subtitle={viewingLocation?.subtitle}
      />

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center font-bn"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl overflow-hidden soft-shadow flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   {selectedUser.photoURL ? (
                    <img 
                      src={selectedUser.photoURL} 
                      alt="Avatar" 
                      className="w-16 h-16 rounded-3xl object-cover border-4 border-white dark:border-slate-800 shadow-xl"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary border-4 border-white dark:border-slate-800 shadow-xl">
                       <Users size={32} />
                    </div>
                  )}
                   <div>
                     <h3 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{selectedUser.displayName || selectedUser.name || 'ইউজার প্রোফাইল'}</h3>
                     <p className="text-sm text-muted font-mono lowercase tracking-wide">{selectedUser.email || 'ইমেইল বিহীন'}</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                {/* Info Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                   <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">সদস্য হয়েছেন</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {selectedUser.createdAt instanceof Timestamp 
                          ? selectedUser.createdAt.toDate().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }) 
                          : 'অজানা'}
                      </p>
                   </div>
                   <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">রোল</p>
                      <div className="flex items-center gap-2">
                         <div className={cn("w-2 h-2 rounded-full", selectedUser.role === 'admin' ? "bg-primary" : "bg-slate-400")} />
                         <p className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">{selectedUser.role || 'user'}</p>
                      </div>
                   </div>
                   <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">অবস্থা</p>
                      <div className="flex items-center gap-2">
                         <div className={cn("w-2 h-2 rounded-full", (selectedUser.status || 'active') === 'active' ? "bg-emerald-500" : "bg-red-500")} />
                         <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedUser.status === 'inactive' ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</p>
                      </div>
                   </div>
                </div>

                {/* Additional Details */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 px-1">
                    <Activity size={18} className="text-primary" /> ইউজার এক্টিভিটি
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                     <div className="p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 flex items-center justify-between group hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-900/20 text-orange-500 flex items-center justify-center">
                              <FileWarning size={24} />
                           </div>
                           <div>
                              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                {getNum(allReports.filter(r => r.userId === selectedUser.id).length.toString())} টি অভিযোগ
                              </p>
                              <p className="text-xs text-muted">মোট জমা দেওয়া অভিযোগের সংখ্যা</p>
                           </div>
                        </div>
                        <button 
                          onClick={() => {
                            setReportSearchQuery(selectedUser.name || '');
                            setManagementMode('REPORTS');
                            setSelectedUser(null);
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shadow-sm"
                        >
                           <ChevronRight size={20} />
                        </button>
                     </div>

                     <div className="p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 flex items-center justify-between group hover:border-blue-500/30 transition-all">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center">
                              <Star size={24} />
                           </div>
                           <div>
                              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                {getNum(allReviews.filter(r => r.userId === selectedUser.id).length.toString())} টি রিভিউ
                              </p>
                              <p className="text-xs text-muted">সার্ভিস হাব এ দেওয়া ফিডব্যাক</p>
                           </div>
                        </div>
                        <button className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm">
                           <ChevronRight size={20} />
                        </button>
                     </div>
                  </div>
                </div>

                {/* Account Actions */}
                <div className="pt-4 border-t border-slate-50 dark:border-slate-800">
                   <div className="flex flex-col sm:flex-row gap-3">
                      <button 
                        onClick={() => handleUpdateRole(selectedUser.id, selectedUser.role === 'admin' ? 'user' : 'admin')}
                        className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                      >
                         <ShieldCheck size={18} />
                         {selectedUser.role === 'admin' ? 'অ্যাডমিন থেকে সরান' : 'অ্যাডমিন এক্সেস দিন'}
                      </button>
                      <button 
                        onClick={() => toggleUserStatus(selectedUser.id, selectedUser.status)}
                        className={cn(
                          "flex-1 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
                          (selectedUser.status || 'active') === 'active'
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40"
                            : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        )}
                      >
                         {selectedUser.status === 'inactive' ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
                         {selectedUser.status === 'inactive' ? 'একাউন্ট সচল করুন' : 'একাউন্ট ব্লক করুন'}
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(selectedUser.id)}
                        disabled={isActing === selectedUser.id}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                      >
                         {isActing === selectedUser.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                         ইউজার মুছুন
                      </button>
                   </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review List Modal */}
      <AnimatePresence>
        {viewingReviewsFor && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center font-bn"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-8 soft-shadow max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                 <div>
                   <h3 className="text-xl font-bold text-slate-800 dark:text-white">রিভিউসমূহ</h3>
                   <p className="text-xs text-muted mt-1">{allProviders.find(p => p.id === viewingReviewsFor)?.name}</p>
                 </div>
                 <button 
                   onClick={() => setViewingReviewsFor(null)}
                   className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
                 >
                   <X size={20} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
                 {allReviews.filter(r => r.providerId === viewingReviewsFor).length > 0 ? (
                   allReviews.filter(r => r.providerId === viewingReviewsFor).map((rev, idx) => (
                     <div key={`${rev.id}-${idx}`} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-2 relative group">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                {rev.userName ? rev.userName[0].toUpperCase() : 'U'}
                              </div>
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{rev.userName || 'ইউজার'}</span>
                           </div>
                           <button 
                             onClick={() => handleDeleteReview(rev.id)}
                             className="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                           >
                              <Trash2 size={14} />
                           </button>
                        </div>
                        <div className="flex items-center gap-1">
                           {[1, 2, 3, 4, 5].map((s) => (
                             <Star 
                               key={s} 
                               size={10} 
                               className={s <= rev.rating ? "text-amber-500" : "text-slate-300"} 
                               fill={s <= rev.rating ? "currentColor" : "none"} 
                             />
                           ))}
                           <span className="text-[10px] text-muted ml-2">
                             {rev.createdAt instanceof Timestamp ? rev.createdAt.toDate().toLocaleDateString('bn-BD') : 'তারিখ নেই'}
                           </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-bn leading-relaxed">{rev.comment || 'কোনো মন্তব্য নেই'}</p>
                     </div>
                   ))
                 ) : (
                   <div className="py-10 text-center text-slate-400">
                      <p>কোনো রিভিউ পাওয়া যায়নি</p>
                   </div>
                 )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Details Edit Modal */}
      <AnimatePresence>
        {(editingProvider || isAddingProvider) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center font-bn"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl overflow-hidden soft-shadow flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border-4 border-white dark:border-slate-800 shadow-xl">
                      {editingProvider ? <Edit2 size={24} /> : <Plus size={24} />}
                   </div>
                   <div>
                     <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">{editingProvider ? 'প্রোভাইডার এডিট' : 'নতুন প্রোভাইডার'}</h3>
                     <p className="text-xs text-muted">{editingProvider ? 'তথ্য পরিবর্তন বা সংশোধন করুন' : 'নতুন প্রোভাইডার প্রোফাইল তৈরি করুন'}</p>
                   </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingProvider(null);
                    setIsAddingProvider(false);
                  }}
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">নাম</label>
                  <input 
                    type="text"
                    value={providerFormData.name}
                    onChange={(e) => setProviderFormData({...providerFormData, name: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-2 bg-transparent">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">ক্যাটাগরি</label>
                    <select 
                      value={providerFormData.category}
                      onChange={(e) => setProviderFormData({...providerFormData, category: e.target.value, subCategory: ''})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all font-bn"
                    >
                      <option value="">সিলেক্ট করুন</option>
                      {PROVIDER_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.bn}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">সাব-ক্যাটাগরি</label>
                    <select 
                      value={providerFormData.subCategory}
                      onChange={(e) => setProviderFormData({...providerFormData, subCategory: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all font-bn"
                    >
                      <option value="">সিলেক্ট করুন</option>
                      {(PROVIDER_CATEGORIES
                        .find(c => c.id === providerFormData.category)?.sub || [])
                        .map((s, idx) => (
                          <option key={`${s}-${idx}`} value={s}>{s}</option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">ফোন</label>
                    <input 
                      type="text"
                      value={providerFormData.phone}
                      onChange={(e) => setProviderFormData({...providerFormData, phone: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">ইমেইল</label>
                    <input 
                      type="email"
                      value={providerFormData.email}
                      onChange={(e) => setProviderFormData({...providerFormData, email: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">হোয়াটসঅ্যাপ</label>
                    <input 
                      type="text"
                      value={providerFormData.whatsapp}
                      onChange={(e) => setProviderFormData({...providerFormData, whatsapp: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">ফেসবুক লিংক</label>
                    <input 
                      type="text"
                      value={providerFormData.facebook}
                      onChange={(e) => setProviderFormData({...providerFormData, facebook: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">ঠিকানা ও ম্যাপ লোকেশন (Address & Map Location)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={providerFormData.address}
                      onChange={(e) => setProviderFormData({...providerFormData, address: e.target.value})}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all font-bn"
                      placeholder="ঠিকানা লিখুন"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowingMapPickerFor('provider');
                        setViewingLocation(providerFormData.location ? { 
                          ...providerFormData.location, 
                          address: providerFormData.address,
                          title: language === 'bn' ? 'লোকেশন নির্বাচন করুন' : 'Select Location',
                          subtitle: language === 'bn' ? 'সঠিক অবস্থান চিহ্নিত করুন' : 'Pin exact location on map'
                        } : { 
                          lat: 24.2000, 
                          lng: 90.4667, 
                          address: providerFormData.address,
                          title: language === 'bn' ? 'লোকেশন নির্বাচন করুন' : 'Select Location',
                          subtitle: language === 'bn' ? 'সঠিক অবস্থান চিহ্নিত করুন' : 'Pin exact location on map'
                        });
                      }}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex items-center justify-center transition-all shrink-0 hover:scale-[1.02] active:scale-95 duration-200",
                        providerFormData.location 
                          ? "bg-green-500/10 border-green-500/20 text-green-500" 
                          : "bg-primary/5 border-primary/10 text-primary"
                      )}
                      title="ম্যাপ থেকে পিন করুন"
                    >
                      <MapPin size={20} className={providerFormData.location ? "fill-current animate-pulse" : ""} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">বিবরণ</label>
                  <textarea 
                    value={providerFormData.description}
                    onChange={(e) => setProviderFormData({...providerFormData, description: e.target.value})}
                    rows={3}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all resize-none"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-primary shrink-0" />
                    <p className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider font-display">provider verification</p>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bn leading-normal">
                    NID / driving license /trade license /certificate or employee document
                  </p>
                  {providerFormData.providerVerification ? (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-xs font-mono truncate max-w-[200px] text-slate-600 dark:text-slate-300">
                        Uploaded Document
                      </span>
                      <a 
                        href={providerFormData.providerVerification} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-xl transition-all"
                      >
                        <ExternalLink size={14} /> ভিউ করুন (View Document)
                      </a>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-xs text-red-500 font-bold font-bn">কোন ভেরিফিকেশন ফাইল আপলোড করা হয়নি (No Document Uploaded)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                   <div>
                     <p className="text-sm font-bold text-slate-800 dark:text-white">ভেরিফাইড স্ট্যাটাস</p>
                     <p className="text-[10px] text-muted tracking-tight">সার্ভিস কি নীল টিক পাবে?</p>
                   </div>
                   <button 
                    onClick={() => setProviderFormData({...providerFormData, isVerified: !providerFormData.isVerified})}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-all duration-300 flex items-center",
                      providerFormData.isVerified ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                    )}
                   >
                     <div className={cn("w-4 h-4 rounded-full bg-white transition-all transform", providerFormData.isVerified ? "translate-x-6" : "translate-x-0")} />
                   </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">অ্যাক্টিভ স্ট্যাটাস</label>
                  <select 
                    value={providerFormData.status}
                    onChange={(e) => setProviderFormData({...providerFormData, status: e.target.value as any})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-primary/30 rounded-2xl p-4 outline-none transition-all font-bn"
                  >
                    <option value="approved">এপ্রুভড (Approved)</option>
                    <option value="pending">পেন্ডিং (Pending)</option>
                    <option value="rejected">রিজেক্টেড (Rejected)</option>
                  </select>
                </div>
              </div>

              <div className="p-8 border-t border-slate-50 dark:border-slate-800">
                <button 
                  onClick={handleSaveProvider}
                  disabled={isActing === 'saving_provider'}
                  className="w-full h-14 bg-primary text-white rounded-2xl font-bn font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isActing === 'saving_provider' ? <Loader2 size={20} className="animate-spin" /> : <><CheckCircle2 size={18} /> সেভ করুন</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
      </AnimatePresence>
    </div>
  );
}

function AdminStat({ label, value, icon: Icon, color, trend }: any) {
  return (
    <div className="w-full h-full min-h-[160px] bg-white dark:bg-slate-800 p-6 rounded-3xl soft-shadow border border-slate-100 dark:border-slate-700 hover:border-primary/20 hover:scale-[1.02] transition-all group relative overflow-hidden flex flex-col justify-between">
       <div className="absolute -right-6 -top-6 w-24 h-24 bg-slate-50 dark:bg-slate-900 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
       
       <div className="relative z-10">
         <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", color)}>
           <Icon size={22} className="group-hover:rotate-12 transition-transform" />
         </div>
       </div>
       <div className="relative z-10 mt-auto pt-4 space-y-1.5">
         <div className="flex items-end justify-between gap-2">
           <p className="text-3xl lg:text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight leading-none">{value}</p>
           {trend && (
             <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full flex items-center gap-0.5 whitespace-nowrap mb-0.5">
               <TrendingUp size={10} /> {trend}
             </span>
           )}
         </div>
         <p className="text-[10px] font-bn font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">{label}</p>
       </div>
    </div>
  );
}

function AdminActionItem({ icon: Icon, title, desc, onClick, color = "bg-primary" }: any) {
  return (
    <button 
      onClick={onClick}
      className="w-full bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border-2 border-transparent hover:border-primary/20 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-between text-left group soft-shadow"
    >
       <div className="flex items-center gap-5">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform", color)}>
            <Icon size={26} />
          </div>
          <div className="flex flex-col">
            <span className="font-bn font-black text-xl text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors leading-tight">{title}</span>
            <span className="text-xs text-muted font-bn mt-1">{desc}</span>
          </div>
       </div>
       <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm group-hover:bg-primary group-hover:text-white transition-all transform group-hover:translate-x-1">
         <ChevronRight size={18} />
       </div>
    </button>
  );
}

function RecentActivity({ user, time, action, icon: Icon, color }: any) {
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-50 dark:border-slate-800 soft-shadow">
      <div className={cn("w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700", color || "text-slate-400")}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
          <p className="text-xs font-bn font-bold text-slate-800 dark:text-slate-200">
            <span className="text-primary">{user}</span> {action}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
             <Clock size={10} className="text-slate-400" />
             <p className="text-[10px] text-muted font-bn">
               {time instanceof Date ? time.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }) : 'অজানা'}
             </p>
          </div>
      </div>
    </div>
  );
}
