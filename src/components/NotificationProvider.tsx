import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, auth, requestNotificationPermission, onMessageListener, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, query, collection, orderBy, limit } from 'firebase/firestore';
import { sendEmail } from '../services/emailService';
import { NotificationSettings } from '../types';

import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type?: 'emergency' | 'notice' | 'update' | 'welcome';
  receivedAt: Date;
}

interface NotificationContextType {
  settings: NotificationSettings;
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;
  permissionStatus: NotificationPermission;
  requestPermission: () => Promise<void>;
  token: string | null;
  notifications: AppNotification[];
  dismissNotification: (id: string) => void;
  onNotificationClick?: (type?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode, userId: string | null, onNotificationClick?: (type?: string) => void }> = ({ children, userId, onNotificationClick }) => {
  const [settings, setSettings] = useState<NotificationSettings>({
    emergency: true,
    notices: true,
    updates: false,
  });
  const [token, setToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? (window as any).Notification.permission : 'default'
  );

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Load settings from Firestore when user ID is available
  useEffect(() => {
    if (!userId) return;

    const loadSettings = async () => {
      // Ensure we have a user and auth is ready before querying Firestore
      if (!userId || !auth.currentUser) return;
      
      const path = `users/${userId}`;
      try {
        const userRef = doc(db, 'users', userId);
        
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (initialError: any) {
          if (initialError.message?.includes('offline') || initialError.message?.includes('unavailable')) {
            console.log('Firestore unavailable, retrying once in 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            userSnap = await getDoc(userRef);
          } else if (initialError.message?.includes('permission-denied') || initialError.code === 'permission-denied') {
             // If we get a permission-denied error here, it might be because auth state is still propagating
             console.warn("Firestore access denied during initial load. Auth state might be out of sync.");
             return;
          } else {
            throw initialError;
          }
        }

        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.preferences) {
            setSettings(data.preferences);
          }
          if (data.fcmToken) {
            setToken(data.fcmToken);
          }
          
          // Heal existing user docs if they are missing mandatory fields
          const missingFields: any = {};
          if (!data.role) missingFields.role = 'user';
          if (!data.uid) missingFields.uid = userId;
          if (!data.createdAt) missingFields.createdAt = new Date(); // Fallback for old accounts
          
          if (Object.keys(missingFields).length > 0) {
            console.log('Healing user document for:', userId);
            await updateDoc(userRef, missingFields);
          }
        } else {
          // Create initial user doc if it doesn't exist
          await setDoc(userRef, {
            uid: userId,
            phone: auth.currentUser?.phoneNumber || 'N/A',
            role: 'user',
            preferences: settings,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Trigger New User Notification
          await sendEmail({
            subject: `New User Sign-up: ${userId}`,
            html: `
              <h3>A New User has Joined the Platform</h3>
              <p><strong>User ID:</strong> ${userId}</p>
              <p><strong>Method:</strong> ${auth.currentUser?.phoneNumber || auth.currentUser?.email || 'N/A'}</p>
              <p><strong>Joined At:</strong> ${new Date().toLocaleString()}</p>
              <hr/>
              <p>This is an automated notification from the Upazila Helpline System.</p>
            `
          }).catch(act => console.error("New user email notification failed:", act));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    };

    loadSettings();
  }, [userId]);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Notifications not supported in this environment');
      return;
    }
    
    const fcmToken = await requestNotificationPermission();
    setPermissionStatus(window.Notification.permission);
    
    if (fcmToken) {
      setToken(fcmToken);
      if (userId && auth.currentUser) {
        const path = `users/${userId}`;
        try {
          await updateDoc(doc(db, 'users', userId), {
            fcmToken,
            updatedAt: new Date(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }
  };

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (userId) {
      const path = `users/${userId}`;
      try {
        await updateDoc(doc(db, 'users', userId), {
          preferences: updated,
          updatedAt: new Date(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  };

  // Listen for foreground messages
  useEffect(() => {
    const unsubscribe = onMessageListener((payload) => {
        console.log('Received foreground message:', payload);
        
        // Filter based on user settings
        const type = payload.data?.type;
        if (type === 'emergency' && !settings.emergency) return;
        if (type === 'notice' && !settings.notices) return;
        if (type === 'update' && !settings.updates) return;

        const newNotif: AppNotification = {
          id: Math.random().toString(36).substring(7),
          title: payload.notification?.title || 'নতুন বার্তা',
          body: payload.notification?.body || '',
          type: payload.data?.type,
          receivedAt: new Date()
        };

        setNotifications(prev => [newNotif, ...prev].slice(0, 5)); // Keep last 5
        
        // Also show browser notification if permitted
        if (typeof window !== 'undefined' && 'Notification' in window && (window as any).Notification.permission === 'granted' && document.hidden) {
          new (window as any).Notification(newNotif.title, { body: newNotif.body });
        }
    });
    
    return () => unsubscribe();
  }, [settings]);

  // Listen for new notifications from Firestore (Admin Notices)
  useEffect(() => {
    const mountTime = new Date();
    
    // Only listen if user is signed in
    if (!userId) return;

    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const createdAt = data.createdAt?.toDate() || new Date();
          
          // Only trigger for notifications created AFTER the component mounted
          if (createdAt > mountTime) {
            // Check user preferences
            const type = data.type as 'emergency' | 'notice' | 'update';
            if (type === 'emergency' && !settings.emergency) return;
            if (type === 'notice' && !settings.notices) return;
            if (type === 'update' && !settings.updates) return;

            const newNotif: AppNotification = {
              id: change.doc.id,
              title: data.title,
              body: data.message,
              type: type,
              receivedAt: createdAt
            };

            setNotifications(prev => {
              // Avoid duplicates
              if (prev.some(n => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev].slice(0, 5);
            });

            // Browser Notification API
            if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
              try {
                new window.Notification(newNotif.title, { 
                  body: newNotif.body,
                  icon: '/favicon.ico' // Or a relevant icon
                });
              } catch (e) {
                console.warn("Browser notification failed:", e);
              }
            }
          }
        }
      });
    }, (error) => {
      console.error("Firestore Notifications Listener Error:", error);
    });

    return () => unsubscribe();
  }, [userId, settings]);

  return (
    <NotificationContext.Provider value={{ 
      settings, 
      updateSettings, 
      permissionStatus, 
      requestPermission, 
      token,
      notifications,
      dismissNotification,
      onNotificationClick
    }}>
      {children}

      {/* Global Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4">
        <AnimatePresence>
          {notifications.map((notif, idx) => (
            <motion.div
              key={`toast-notification-${notif.id}-${idx}`}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              onClick={() => {
                onNotificationClick?.(notif.type);
                dismissNotification(notif.id);
              }}
              className="pointer-events-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 soft-shadow rounded-2xl p-4 flex gap-4 overflow-hidden cursor-pointer active:scale-95 transition-all"
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                notif.type === 'emergency' ? "bg-red-50 text-red-500" :
                notif.type === 'update' ? "bg-blue-50 text-blue-500" :
                "bg-primary/10 text-primary"
              )}>
                {notif.type === 'emergency' ? <AlertTriangle size={20} /> :
                 notif.type === 'update' ? <Info size={20} /> :
                 notif.type === 'welcome' ? <CheckCircle2 size={20} /> : <Bell size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bn font-bold text-slate-800 dark:text-white truncate">{notif.title}</h4>
                <p className="text-xs font-bn text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{notif.body}</p>
              </div>
              <button 
                onClick={() => dismissNotification(notif.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};
