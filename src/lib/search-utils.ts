
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface SearchableItem {
  id: string;
  name: string;
  bnName?: string;
  description?: string;
  category?: string;
  subCategory?: string;
  lat?: number;
  lng?: number;
  location?: { lat: number; lng: number } | { latitude: number; longitude: number };
}

export function calculateRelevanceScore(
  item: SearchableItem,
  query: string,
  userLocation?: { lat: number; lng: number } | null
): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  // Split query into words to support multi-word search
  const queryWords = q.split(/\s+/);
  let totalScore = 0;
  
  const name = item.name.toLowerCase();
  const bnName = item.bnName?.toLowerCase() || '';
  const description = item.description?.toLowerCase() || '';
  const category = item.category?.toLowerCase() || '';
  const subCategory = item.subCategory?.toLowerCase() || '';

  for (const word of queryWords) {
    if (word.length < 2) continue; // Skip very short words
    
    let wordScore = 0;

    // 1. Text Matching Scores
    
    // Title matches (High weight)
    if (name === word || bnName === word) wordScore += 100;
    else if (name.startsWith(word) || bnName.startsWith(word)) wordScore += 50;
    else if (name.includes(word) || bnName.includes(word)) wordScore += 30;

    // Category/Subcategory matches (Medium weight)
    if (category === word || subCategory === word) wordScore += 40;
    else if (category.includes(word) || subCategory.includes(word)) wordScore += 20;

    // Description matches (Low weight)
    if (description.includes(word)) wordScore += 10;
    
    totalScore += wordScore;
  }

  // Bonus for exact full phrase match
  if (name.includes(q) || bnName.includes(q)) totalScore += 50;

  // 2. Location Scores (Distance-based)
  if (userLocation) {
    const itemLat = item.lat ?? (item.location as any)?.lat ?? (item.location as any)?.latitude;
    const itemLng = item.lng ?? (item.location as any)?.lng ?? (item.location as any)?.longitude;

    if (itemLat !== undefined && itemLng !== undefined) {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, itemLat, itemLng);
      // Boost score for closer items (max 50 points boost for distance < 1km)
      // Score decreases as distance increases. items within 20km get a boost.
      const distanceBoost = Math.max(0, 50 * (1 - distance / 20)); 
      totalScore += distanceBoost;
    }
  }

  return totalScore;
}
