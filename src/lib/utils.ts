import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function handleShare(data: { title?: string; text?: string; url?: string }) {
  if (navigator.share) {
    try {
      await navigator.share(data);
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Sharing failed:', error);
      }
    }
  } else {
    const shareText = `${data.title ? data.title + '\n' : ''}${data.text ? data.text + '\n' : ''}${data.url || window.location.href}`;
    navigator.clipboard.writeText(shareText).then(() => {
      // In a real app we'd show a toast here
      console.log('Content copied to clipboard');
    });
  }
}

/**
 * Universal helper to extract latitude and longitude from various formats,
 * supporting {lat, lng}, {latitude, longitude}, Firebase GeoPoint, and string coords.
 */
export function getCoordinates(loc: any): { lat: number, lng: number } | null {
  if (!loc || typeof loc !== 'object') return null;
  
  let lat: number | undefined;
  let lng: number | undefined;

  // 1. Direct key extraction
  if ('lat' in loc && loc.lat !== undefined && loc.lat !== null) {
    lat = typeof loc.lat === 'string' ? parseFloat(loc.lat) : loc.lat;
  } else if ('latitude' in loc && loc.latitude !== undefined && loc.latitude !== null) {
    lat = typeof loc.latitude === 'string' ? parseFloat(loc.latitude) : loc.latitude;
  }

  if ('lng' in loc && loc.lng !== undefined && loc.lng !== null) {
    lng = typeof loc.lng === 'string' ? parseFloat(loc.lng) : loc.lng;
  } else if ('longitude' in loc && loc.longitude !== undefined && loc.longitude !== null) {
    lng = typeof loc.longitude === 'string' ? parseFloat(loc.longitude) : loc.longitude;
  }

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }

  return null;
}
