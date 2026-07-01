import { LucideIcon } from 'lucide-react';

export type Screen = 
  | 'SPLASH' 
  | 'ONBOARDING' 
  | 'AUTH' 
  | 'HOME' 
  | 'SERVICES' 
  | 'EMERGENCY' 
  | 'NOTICES' 
  | 'PROFILE' 
  | 'EXPLORE' 
  | 'ADMIN' 
  | 'SERVICE_DETAILS'
  | 'REPORT'
  | 'HELP'
  | 'AI_CHATT'
  | 'MAP'
  | 'HEALTH'
  | 'SERVICE_HUB'
  | 'NEWS'
  | 'MARKETPLACE'
  | 'PRODUCT_DETAIL'
  | 'SELLER_APPLY'
  | 'RIDER_APPLY'
  | 'SELLER_DASHBOARD'
  | 'RIDER_DASHBOARD'
  | 'ORDER_TRACKING';

export interface ServiceItem {
  id: string;
  name: string;
  bnName: string;
  icon: any; // Can be LucideIcon or emoji string
  color: string;
  category: string;
  description?: string;
  link?: string;
  appLink?: string;
  phone?: string;
  phoneList?: { name: string; number: string }[];
  contactPerson?: string;
  officeHours?: string;
  requiredDocuments?: string[];
  locationDetails?: string;
  lat?: number;
  lng?: number;
  distance?: number;
  isVisible?: boolean; // Visibility control
  locationMapUrl?: string;
  portalUrl?: string;
}

export interface ExploreService {
  id: string;
  title: string;
  category: string;
  icon: string;         // emoji
  color: string;        // hex background color
  description: string;
  location: string;
  locationMapUrl: string;
  documents: string[];
  phone: string;
  portalUrl: string;
  isVisible: boolean;
  createdAt?: any;
}

export interface Notice {
  id: string;
  title: string;
  date: string;
  important: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  number: string;
  type: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  location: string;
  image?: string;
}

export interface NotificationSettings {
  emergency: boolean;
  notices: boolean;
  updates: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  pickupLocation: { lat: number; lng: number };
  sellerId: string;
  sellerName: string;
  stock: number;
  category: string;
  createdAt: any;
  imageUrl?: string;
  imageBase64?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity?: number;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: 'COD' | 'wallet';
  sellerLocation: { lat: number; lng: number; address?: string };
  buyerLocation: { lat: number; lng: number; address?: string };
  status: 'pending' | 'accepted' | 'picked' | 'delivered';
  createdAt: any;
  buyerName?: string;
  buyerPhone?: string;
  sellerName?: string;
  sellerPhone?: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  type: 'seller' | 'rider';
  status: 'pending' | 'approved' | 'rejected';
  details: {
    nid: string;
    phone: string;
    address: string;
    businessName?: string;
    vehicleType?: string;
  };
  createdAt: any;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userType: 'seller' | 'rider';
  amount: number;
  bkashNumber: string;
  status: 'pending' | 'paid' | 'rejected';
  createdAt: any;
}

