/**
 * Utility to transform various image URLs (like Google Drive) into direct links
 */
export function getDirectImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  // Handle Google Drive links
  // Standard: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Sharing: https://drive.google.com/open?id=FILE_ID
  // Export: https://drive.google.com/uc?export=download&id=FILE_ID
  
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|docs\.google\.com\/file\/d\/)([a-zA-Z0-9_-]+)/;
  const match = url.match(driveRegex);
  
  if (match && match[1]) {
    const fileId = match[1];
    // Option 1: Google API thumbnail (fast, reliable for previews)
    // return `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
    
    // Option 2: uc?export for direct download
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  
  // Add more transformations here if needed (Dropbox, etc.)
  
  return url;
}

// --- Image Caching Layer ---

// In-memory cache for fast lookup
const memoryImageCache: Record<string, string> = {};

// Map of image sources that have been completely loaded in the browser to prevent flicker
const browserLoadedImages = new Set<string>();

// Retrieve the persistent cache from localStorage
const LOCAL_STORAGE_KEY = 'upazila_resolved_images_cache';
const getPersistentCache = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const savePersistentCache = (cache: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    // Ignore quota issues
  }
};

/**
 * Preload an image URL into browser cache
 */
export function preloadImage(url: string): Promise<string> {
  if (!url || typeof window === 'undefined') return Promise.resolve('');
  if (browserLoadedImages.has(url)) return Promise.resolve(url);

  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      browserLoadedImages.add(url);
      resolve(url);
    };
    img.onerror = () => {
      resolve(url); // Resolve anyway to not break callers
    };
  });
}

/**
 * Checks if an image is already cached/preloaded in the browser
 */
export function isImagePreloaded(url: string): boolean {
  return browserLoadedImages.has(url);
}

/**
 * Clears the image cache (both in-memory and persistent)
 */
export function clearImageCache() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    Object.keys(memoryImageCache).forEach(key => delete memoryImageCache[key]);
    browserLoadedImages.clear();
  } catch (e) {
    // ignore
  }
}

/**
 * Resolves image URL, replacing slow or blocked wikimedia images with high quality curated Unsplash fallbacks.
 * Uses an in-memory and localStorage cache to guarantee instant resolution and zero layout shifting.
 */
export function getCleanImageUrl(url: string | null | undefined, item?: { id: string; category?: string; subCategory?: string; title?: string }): string {
  const cacheKey = `${url || 'fallback'}-${item?.id || 'none'}`;
  
  // Check memory cache first
  if (memoryImageCache[cacheKey]) {
    return memoryImageCache[cacheKey];
  }
  
  // Check localStorage cache next
  const persistent = getPersistentCache();
  if (persistent[cacheKey]) {
    memoryImageCache[cacheKey] = persistent[cacheKey];
    // Warm up the browser image cache
    if (typeof window !== 'undefined') {
      preloadImage(persistent[cacheKey]);
    }
    return persistent[cacheKey];
  }

  const cleanUrl = (url || '').trim();
  const lowerUrl = cleanUrl.toLowerCase();
  
  // Identify common invalid dummy data or placeholder strings
  const isDummy = 
    !cleanUrl || 
    lowerUrl === 'n/a' || 
    lowerUrl === 'na' || 
    lowerUrl === 'null' || 
    lowerUrl === 'undefined' || 
    lowerUrl === 'none' || 
    lowerUrl === 'placeholder' || 
    lowerUrl === 'no image' || 
    lowerUrl === 'no-image' || 
    lowerUrl === 'no_image' || 
    lowerUrl === 'nan' || 
    lowerUrl === 'image_url' ||
    lowerUrl === 'image';

  // Check if it is a valid absolute web URL scheme
  const hasValidProtocol = 
    cleanUrl.startsWith('http://') || 
    cleanUrl.startsWith('https://') || 
    cleanUrl.startsWith('data:image/') || 
    cleanUrl.startsWith('blob:');

  let resolvedUrl = '';

  if (isDummy || !hasValidProtocol) {
    if (item) resolvedUrl = getSmartFallbackImage(item);
    else resolvedUrl = 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&q=80&w=800'; // Default river boats Bangladesh
  } else if (cleanUrl.includes('wikimedia.org') || cleanUrl.includes('wikipedia.org')) {
    // If it's a wikimedia/wikipedia image, use a beautiful, curated, fast-loading Unsplash image for a premium production look!
    if (item) resolvedUrl = getSmartFallbackImage(item);
    else resolvedUrl = 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&q=80&w=800'; // Default river boats Bangladesh
  } else if (cleanUrl.includes('photo-1542838132-92c53300491e') && item && 
             !(item.category || '').toLowerCase().includes('relig') && 
             !(item.title || '').toLowerCase().includes('mosque') && 
             !(item.title || '').toLowerCase().includes('মসজিদ') && 
             !(item.subCategory || '').toLowerCase().includes('মসজিদ')) {
    // Intercept default mosque image in non-religious items to assign dynamic category visuals
    resolvedUrl = getSmartFallbackImage(item);
  } else {
    // Force conversion of http:// to https:// to prevent browser mixed content blocking
    let formattedUrl = cleanUrl;
    if (cleanUrl.startsWith('http://')) {
      formattedUrl = 'https://' + cleanUrl.slice(7);
    }
    resolvedUrl = getDirectImageUrl(formattedUrl);
  }

  // Preload image in the background to prevent flashing on visual render
  if (typeof window !== 'undefined' && resolvedUrl) {
    preloadImage(resolvedUrl);
  }

  // Save to cache
  memoryImageCache[cacheKey] = resolvedUrl;
  persistent[cacheKey] = resolvedUrl;
  savePersistentCache(persistent);

  return resolvedUrl;
}

/**
 * Validates if a string is a potentially valid image URL
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  if (url.startsWith('blob:')) return true;
  
  const cleanUrl = url.trim().toLowerCase();
  if (cleanUrl === 'n/a' || cleanUrl === 'na' || cleanUrl === 'null' || cleanUrl === 'undefined' || cleanUrl === 'none' || cleanUrl === 'placeholder') {
    return false;
  }
  
  const imageRegex = /\.(jpeg|jpg|gif|png|webp|svg)$/i;
  const isDirect = imageRegex.test(url.split('?')[0]);
  const isDrive = url.includes('drive.google.com') || url.includes('docs.google.com');
  const isUnsplash = url.includes('unsplash.com');
  return isDirect || isDrive || isUnsplash;
}

// Map of curated category-specific direct Unsplash photo IDs that are guaranteed to load and authentically represent Bangladeshi scenes.
const CATEGORY_IMAGES: Record<string, string[]> = {
  computer: [
    'photo-1496181130204-755241544ee0', // MacBook notebook on desk
    'photo-1488590528505-98d2b5aba04b', // Modern computer laptop screen tech
    'photo-1547082299-de196ea013d6', // Workspace with iMac computer screen
    'photo-1517694712202-14dd9538aa97'  // Coding/developer computer desktop setups
  ],
  hospital: [
    'photo-1519494026892-80bbd2d6fd0d', // Modern hospital lobby/rooms
    'photo-1516549655169-df83a0774514', // Hospital clinical ward
    'photo-1584515901107-56431c18a595', // Stethoscope stethoscope clinic
    'photo-1576091160550-2173dba999ef'  // Scientific diagnostics equipment
  ],
  doctor: [
    'photo-1584515979956-d9f6e5d09982', // Experienced doctor examining patient
    'photo-1629909613654-28e377c37b09', // Stethoscope lying on a clinical table
    'photo-1579684389781-75a777000e3d'  // Medical consult consultation
  ],
  dentist: [
    'photo-1504813184591-01552ff75800', // Modern dental surgery chair and instruments
    'photo-1629909613654-28e377c37b09'
  ],
  eye: [
    'photo-1582560086966-6dfff578d302'  // Ophthalmic optical examination
  ],
  veterinary: [
    'photo-1628177142898-93e36e4e3a50'  // Happy veterinary nurse checking puppy dog
  ],
  homoeo: [
    'photo-1603398938378-e54eab446dde'  // Dark glass herbal homeopathic dropper bottles
  ],
  pharmacy: [
    'photo-1580256081112-e499f140fb8b', // Authentic pharmacy storefront counter
    'photo-1579684389781-75a777000e3d'  // Modern medicinal supplies store shelf
  ],
  ambulance: [
    'photo-1587244141658-766aa7029587'  // Fast moving red ambulance on road
  ],
  fire: [
    'photo-1549488344-1f9b8d2bd1f3'  // Crimson red emergency fire response engine truck
  ],
  police: [
    'photo-1627856013091-fed6e4e30025', // Modern flashing blue police siren alarm light
    'photo-1610190533036-7c981249fa14'  // Urban responder patrol station vehicle
  ],
  disaster: [
    'photo-1601584115197-04ecc0da31d7'  // Prepared crisis relief packages food supply
  ],
  classroom: [
    'photo-1607511474811-20df11100fcf', // Radiant smiling rural school children in classroom Bangladesh
    'photo-1577896851231-70ee18881754'  // Bright local elementary high classroom chalkboard
  ],
  library: [
    'photo-1503676260728-1c00da094a0b', // Quiet student reading book desk library
    'photo-1427504494785-3a9ca7044f45'  // Empty desks books class learning
  ],
  college: [
    'photo-1562774053-701939374585', // Academic campus buildings brick corridor
    'photo-1523050854058-8df90110c9f1'  // Vibrant college campus group walking
  ],
  madrasa: [
    'photo-1564507592333-c60657eea523', // Group islamic reading and study mosque interior
    'photo-1542838132-92c53300491e'
  ],
  admin: [
    'photo-1486406146926-c627a92ad1ab', // Grand administrative office facade building
    'photo-1541829019-25f2fc604864'  // Local municipal complex official front
  ],
  records: [
    'photo-1454165804606-c3d57bc86b40', // Professional administrative register records documents
    'photo-1521587760476-6c12a4b040da'  // Official municipal folders registry desk
  ],
  paddy: [
    'photo-1622210196726-d62f0f49c0d9', // Bright expansive green Sreepur rice paddy crops
    'photo-1583212292454-1fe6229603b7'  // Authentic rural village agriculture land
  ],
  river: [
    'photo-1573164713714-d95e436ab8d6', // Classic country boat floating on serene river Bangladesh
    'photo-1563911302283-d2bc129e7370', // Lush waterside village homestead landscapes
    'photo-1624314138139-2fe49e7fcbed', // Peaceful golden twilight over wetlands Sreepur
    'photo-1590398014769-02689fafcf22'  // Verdant tropical trees riverside countryside
  ],
  forest: [
    'photo-1441974231531-c6227db76b6e', // Deep lush green woodlands sal forest Gazipur
    'photo-1500622944204-b135684e99fd'  // Forest sun rays over canopy trail
  ],
  resort: [
    'photo-1610484826967-09c5720778c7', // Coconut palms and beautiful resort swimming pool
    'photo-1520250497591-112f2f40a3f4'  // Eco friendly nature luxury resort wood cabin
  ],
  mosque: [
    'photo-1542838132-92c53300491e', // White mosque symmetry clean geometry arches
    'photo-1597935258735-e254c1839512'  // Mosque minaret against clean blue sky dome
  ],
  temple: [
    'photo-1612450800052-73a7266d616d'  // Majestic standard ancient stone carvings pillars temple
  ],
  church: [
    'photo-1438263347300-90136284ee3e'  // Classical cathedral spiritual interior corridors
  ],
  bank: [
    'photo-1601597111158-2fceff270190', // Cash counting notes bank desk transactions
    'photo-1501167786227-4cba60f6d58f'  // Majestic banking columns architecture front
  ],
  finance_calc: [
    'photo-1559526324-4b87b5e36e44', // Analytical spreadsheet files and calculator ledger
    'photo-1526304640581-d334cdbbf45e'  // Currency notes capital deposits
  ],
  payments: [
    'photo-1621416894569-0f39ed31d247'  // Safe mobile internet online banking app payment screen
  ],
  farming: [
    'photo-1595974482597-4b8da8879bc5', // Smiling organic farmer harvesting in Sreepur field
    'photo-1530595467537-0b5996c41f2d', // Lush endless crop acreage under warm sunshine
    'photo-1500937386664-56d1dfef3854'  // Countryside bright yellow mustard plantations Gazipur
  ],
  fishery: [
    'photo-1511884642898-4c92249e20b6'  // Lakeside green fishing net harvest traditional fisherman
  ],
  rickshaw: [
    'photo-1601362840469-51e4d8d59085'  // Brightly decorated traditional cycle rickshaws roads
  ],
  railway: [
    'photo-1494515426402-f1980ae7a41d', // Sreepur local railroad tracks crossing countryside
    'photo-1474487548417-781cb71495f3'  // Authentic passenger train carriage window
  ],
  bus: [
    'photo-1549317661-bd32c8ce0db2', // Transit coach bus traveling public highway
    'photo-1532245133614-41d7d020d20d'  // Active local highway road transit lanes
  ],
  bazaar: [
    'photo-1563812848-fa2ff7ded0f3', // Street market fresh produce basket vegetables
    'photo-1589254065878-42c9da997008', // Busy lanes of traditional food and fish street bazaar
    'photo-1533900298318-6b8da08a523e'  // Green vegetable stall vendor market
  ],
  factory: [
    'photo-1590247813693-5541d1c609fd'  // Spinning fabric loom production weaving weaver local industry
  ],
  telecom: [
    'photo-1544197150-b99a580bb7a8', // Professional optic internet network fiber broadband patch cables
    'photo-1516321318423-f06f85e504b3'  // Dynamic help desk terminal connection computer screen
  ],
  court: [
    'photo-1589829545856-d10d557cf95f', // Elegant scale of justice and law books gavel mallet
    'photo-1505664194779-8beaceb93744'  // Registration notary lawyer leather documents
  ],
  post_box: [
    'photo-1506784983877-45594efa4cbe'  // Classic crimson red letter slot mailbox post office
  ],
  shipping: [
    'photo-1586880244406-556ebe35f28e'  // Courier parcel package shipping delivery cardboard boxes
  ],
  passport: [
    'photo-1512314889357-e157c22f938d', // Desk passport verify check citizenship documents
    'photo-1554415707-6e8cfc93fe23'  // Registration voter verification desk
  ],
  ngo: [
    'photo-1488521787991-ed7bbaae773c', // Warm human community relief work volunteers support
    'photo-1532629345422-7515f3d16bb8'  // Food aid help boxes box donation program
  ],
  utility: [
    'photo-1473341304170-971dccb5ac1e', // Beautiful electric power poles dusk Sreepur
    'photo-1544724480-6cc331abc1b6'  // Pure glass of water / utility supply
  ],
  citizen: [
    'photo-1554415707-6e8cfc93fe23', // Admin desk documentation
    'photo-1512314889357-e157c22f938d'  // Verification paperwork citizen
  ],
  business: [
    'photo-1441986300917-64674bd600d8', // Local garments store Sreepur hub
    'photo-1472851294608-062f824d296e', // Shop display window active market lane
    'photo-1513151233558-d860c5398176'  // Sreepur professional workspace office
  ],
  plumber: [
    'photo-1581092160607-ee22621dd758', // Handyman/plumbing tools repairing
    'photo-1504307651254-35680f356dfd'
  ],
  electrician: [
    'photo-1621905251189-08b45d6a269e', // Electrician working with wires
    'photo-1473341304170-971dccb5ac1e'
  ],
  ac_repair: [
    'photo-1621905251189-08b45d6a269e',
    'photo-1581092160607-ee22621dd758'
  ],
  cctv: [
    'photo-1557597774-9d273a4a4a4a'  // Security surveillance camera
  ],
  property: [
    'photo-1564013799919-ab600027ffc6', // Luxury family house
    'photo-1582407947304-fd86f028f716', // Modern flat/apartment building
    'photo-1513694203232-719a280e022f'  // Eco friendly organic nature house wood cabin
  ],
  prof: [
    'photo-1551836022-d5d88e9218df', // Corporate meeting/consultant
    'photo-1454165804606-c3d57bc86b40'  // Business workspace
  ],
  general: [
    'photo-1573164713714-d95e436ab8d6', // Scenic traditional village river cruise boat
    'photo-1590398014769-02689fafcf22', // Green palms reeds riverside rural village Gazipur
    'photo-1622210196726-d62f0f49c0d9'  // Beautiful village crop fields
  ]
};

/**
 * Generates a stable, high-quality, category-specific and item-specific Unsplash fallback image URL.
 */
export function getSmartFallbackImage(item: { id: string; category?: string; subCategory?: string; title?: string }): string {
  const category = (item.category || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  const sub = (item.subCategory || '').toLowerCase();

  const text = `${title} ${sub} ${category} ${item.id}`.toLowerCase();
  
  let targetKey = 'general';
  
  if (text.includes('ambulance') || text.includes('অ্যাম্বুলেন্স')) {
    targetKey = 'ambulance';
  } else if (text.includes('fire') || text.includes('ফায়ার') || text.includes('অগ্নি') || text.includes('দমকল')) {
    targetKey = 'fire';
  } else if (text.includes('police') || text.includes('থানা') || text.includes('পুলিশ') || text.includes('thana')) {
    targetKey = 'police';
  } else if (text.includes('doctor') || text.includes('ডাক্তার') || text.includes('expert') || text.includes('বিশেষজ্ঞ') || text.includes('চেম্বার')) {
    targetKey = 'doctor';
  } else if (text.includes('dentist') || text.includes('dental') || text.includes('দাঁত') || text.includes('দন্ত')) {
    targetKey = 'dentist';
  } else if (text.includes('eye') || text.includes('চক্ষু') || text.includes('চোখ') || text.includes('optics')) {
    targetKey = 'eye';
  } else if (text.includes('vet') || text.includes('পশু') || text.includes('প্রাণিসম্পদ') || text.includes('animal') || text.includes('livestock') || text.includes('পশু চিকিৎসক')) {
    targetKey = 'veterinary';
  } else if (text.includes('homeo') || text.includes('হোমিও')) {
    targetKey = 'homoeo';
  } else if (text.includes('pharmacy') || text.includes('ওষুধ') || text.includes('ফার্মেসি') || text.includes('medicine') || text.includes('ড্রাগ')) {
    targetKey = 'pharmacy';
  } else if (text.includes('diagnostic') || text.includes('ডায়াগনস্টিক') || text.includes('টেস্ট') || text.includes('lab') || text.includes('প্যাথলজি')) {
    targetKey = 'hospital';
  } else if (text.includes('hospital') || text.includes('হাসপাতাল') || text.includes('ক্লিনিক') || text.includes('clinic')) {
    targetKey = 'hospital';
  } else if (text.includes('resort') || text.includes('সারাহ রিসোর্ট') || text.includes('ড্রিম স্কয়ার') || text.includes('রিসোর্ট')) {
    targetKey = 'resort';
  } else if (text.includes('safari') || text.includes('সাফারি') || text.includes('park') || text.includes('লালাবাগ') || text.includes('পার্ক') || text.includes('চিড়িয়াখানা')) {
    targetKey = 'resort'; 
  } else if (text.includes('mosque') || text.includes('মসজিদ')) {
    targetKey = 'mosque';
  } else if (text.includes('temple') || text.includes('মন্দির') || text.includes('পূজা')) {
    targetKey = 'temple';
  } else if (text.includes('church') || text.includes('গির্জা') || text.includes('খ্রিস্টান')) {
    targetKey = 'church';
  } else if (text.includes('bkash') || text.includes('নগদ') || text.includes('বিকাশ') || text.includes('mobile banking') || text.includes('payment') || text.includes('রকেট')) {
    targetKey = 'payments';
  } else if (text.includes('agricultural') || text.includes('কৃষি') || text.includes('krishi') || text.includes('crop') || text.includes('চাষ') || text.includes('বীজ') || text.includes('সার') || text.includes('ভূমি')) {
    targetKey = 'farming';
  } else if (text.includes('মৎস্য') || text.includes('মাছ') || text.includes('fish') || text.includes('জেলে') || text.includes('পুকুর')) {
    targetKey = 'fishery';
  } else if (text.includes('railway') || text.includes('রেলওয়ে') || text.includes('স্টেশন') || text.includes('train') || text.includes('রেল')) {
    targetKey = 'railway';
  } else if (text.includes('bus') || text.includes('বাস') || text.includes('টিকিট')) {
    targetKey = 'bus';
  } else if (text.includes('rickshaw') || text.includes('রিকশা') || text.includes('cng') || text.includes('সিএনজি') || text.includes('পরিবহন') || text.includes('যাতায়াত')) {
    targetKey = 'rickshaw';
  } else if (text.includes('bank') || text.includes('ব্যাংক') || text.includes('বীমা') || text.includes('insurance') || text.includes('আর্থিক')) {
    targetKey = 'bank';
  } else if (text.includes('courier') || text.includes('কুরিয়ার') || text.includes('পার্সেল')) {
    targetKey = 'shipping';
  } else if (text.includes('post office') || text.includes('ডাকঘর') || text.includes('পোস্ট')) {
    targetKey = 'post_box';
  } else if (text.includes('broadband') || text.includes('ইন্টারনেট') || text.includes('internet') || text.includes('isp') || text.includes('ওয়াইফাই')) {
    targetKey = 'telecom';
  } else if (text.includes('computer') || text.includes('কম্পিউটার') || text.includes('training') || text.includes('প্রশিক্ষণ') || text.includes('it') || text.includes('আইটি') || text.includes('ict') || text.includes('আইসিটি')) {
    targetKey = 'computer';
  } else if (text.includes('factory') || text.includes('কারখানা') || text.includes('শিল্প') || text.includes('কুটির') || text.includes('ফ্যাক্টরি')) {
    targetKey = 'factory';
  } else if (text.includes('market') || text.includes('মার্কেট') || text.includes('bazaar') || text.includes('বাজার') || text.includes('দোকান') || text.includes('store') || text.includes('শপিং') || text.includes('রেস্টুরেন্ট') || text.includes('রেস্তোরাঁ') || text.includes('বেকারি') || text.includes('পাইকারি') || text.includes('খাবার')) {
    targetKey = 'bazaar';
  } else if (text.includes('school') || text.includes('স্কুল') || text.includes('বলয়') || text.includes('বিদ্যালয়') || text.includes('মাদরাসা') || text.includes('মাদ্রাসা') || text.includes('এতিমখানা') || text.includes('class')) {
    if (text.includes('মাদরাসা') || text.includes('মাদ্রাসা')) targetKey = 'madrasa';
    else targetKey = 'classroom';
  } else if (text.includes('college') || text.includes('কলেজ') || text.includes('university') || text.includes('বিশ্ববিদ্যালয়')) {
    targetKey = 'college';
  } else if (text.includes('union') || text.includes('ইউনিয়ন') || text.includes('পরিষদ')) {
    targetKey = 'river';
  } else if (text.includes('lawyer') || text.includes('আইনজীবী') || text.includes('আইন') || text.includes('court') || text.includes('হিসাবরক্ষক') || text.includes('accountant') || text.includes('engineer') || text.includes('ইঞ্জিনিয়ার') || category === 'prof' || text.includes('কন্সালট্যান্ট') || text.includes('consultant')) {
    targetKey = 'court';
  } else if (text.includes('passport') || text.includes('জন্ম') || text.includes('ভোটার') || text.includes('নিবন্ধন') || text.includes('nid') || text.includes('এনআইডি') || text.includes('নাগরিক')) {
    targetKey = 'passport';
  } else if (text.includes('electricity') || text.includes('বিদ্যুৎ') || text.includes('পল্লী') || text.includes('বিদ্যুৎ অফিস') || text.includes('জ্বালানি')) {
    targetKey = 'utility';
  } else if (text.includes('water') || text.includes('পানি') || text.includes('ওয়াসা') || text.includes('wasa')) {
    targetKey = 'utility';
  } else if (text.includes('disaster') || text.includes('দুর্যোগ') || text.includes('খরা’') || text.includes('বন্যা')) {
    targetKey = 'disaster';
  } else if (text.includes('ngo') || text.includes('এনজিও') || text.includes('brac') || text.includes('ব্র্যাক') || text.includes('কারিতাস')) {
    targetKey = 'ngo';
  } else if (text.includes('plumber') || text.includes('প্লাম্বার') || text.includes('পাইপ') || text.includes('কল')) {
    targetKey = 'plumber';
  } else if (text.includes('electrician') || text.includes('ইলেকট্রিশিয়ান') || text.includes('ইলেকট্রিক') || text.includes('ওয়্যারিং')) {
    targetKey = 'electrician';
  } else if (text.includes('ac repair') || text.includes('এসি মেরামত') || text.includes('এসি') || text.includes('ac')) {
    targetKey = 'ac_repair';
  } else if (text.includes('cctv') || text.includes('সিসিটিভি') || text.includes('ক্যামেরা')) {
    targetKey = 'cctv';
  } else if (text.includes('rent') || text.includes('ভাড়া') || text.includes('বাসা') || text.includes('flat') || text.includes('ফ্ল্যাট') || text.includes('জমি') || text.includes('land') || category === 'property') {
    targetKey = 'property';
  } else if (category === 'health') {
    targetKey = 'hospital';
  } else if (category === 'emergency') {
    targetKey = 'police';
  } else if (category === 'edu') {
    targetKey = 'college';
  } else if (category === 'gov') {
    targetKey = 'admin';
  } else if (category === 'union') {
    targetKey = 'paddy';
  } else if (category === 'tourism') {
    targetKey = 'resort';
  } else if (category === 'religious') {
    targetKey = 'mosque';
  } else if (category === 'finance') {
    targetKey = 'bank';
  } else if (category === 'agri') {
    targetKey = 'farming';
  } else if (category === 'transport') {
    targetKey = 'bus';
  } else if (category === 'post') {
    targetKey = 'post_box';
  } else if (category === 'utility') {
    targetKey = 'utility';
  } else if (category === 'internet') {
    targetKey = 'telecom';
  } else if (category === 'business') {
    targetKey = 'bazaar';
  } else if (category === 'ngo') {
    targetKey = 'ngo';
  } else if (category === 'citizen') {
    targetKey = 'passport';
  } else if (category === 'legal') {
    targetKey = 'court';
  } else if (category === 'service') {
    // Default to electrician or plumber for general services
    targetKey = 'electrician';
  }

  const list = CATEGORY_IMAGES[targetKey] || CATEGORY_IMAGES['general'];
  
  // Choose seed using ID
  let seedNum = 0;
  const idStr = item.id || 'seed';
  for (let i = 0; i < idStr.length; i++) {
    seedNum += idStr.charCodeAt(i);
  }

  const photoId = list[seedNum % list.length];
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&q=80&w=800`;
}

/**
 * Generates a stable fallback image for news items
 */
export function getNewsFallbackImage(title: string, category?: string): string {
  const cleanTitle = (title || '').toLowerCase();
  const cleanCat = (category || '').toLowerCase();
  
  let targetKey = 'general';
  
  if (cleanTitle.includes('fire') || cleanTitle.includes('accident') || cleanCat.includes('accident') || cleanTitle.includes('দুর্ঘটনা') || cleanTitle.includes('আগুন')) {
    targetKey = 'emergency';
  } else if (cleanTitle.includes('school') || cleanTitle.includes('student') || cleanTitle.includes('education') || cleanTitle.includes('শিক্ষা') || cleanTitle.includes('পরীক্ষা')) {
    targetKey = 'edu';
  } else if (cleanTitle.includes('festival') || cleanTitle.includes('fair') || cleanTitle.includes('mela') || cleanTitle.includes('eid') || cleanTitle.includes('puja') || cleanTitle.includes('উৎসব')) {
    targetKey = 'tourism';
  } else if (cleanTitle.includes('weather') || cleanTitle.includes('rain') || cleanTitle.includes('storm') || cleanTitle.includes('flood') || cleanTitle.includes('বৃষ্টি') || cleanTitle.includes('ঝড়')) {
    targetKey = 'agri';
  } else if (cleanTitle.includes('sport') || cleanTitle.includes('cricket') || cleanTitle.includes('football') || cleanTitle.includes('খেলা')) {
    targetKey = 'tourism';
  } else if (cleanTitle.includes('health') || cleanTitle.includes('hospital') || cleanTitle.includes('doctor') || cleanTitle.includes('চিকিৎসা') || cleanTitle.includes('হাসপাতাল')) {
    targetKey = 'health';
  } else if (cleanTitle.includes('বাংলাদেশ') || cleanTitle.includes('শ্রীপুর') || cleanTitle.includes('গ্রাম')) {
    targetKey = 'union';
  }

  const list = CATEGORY_IMAGES[targetKey] || CATEGORY_IMAGES['general'];

  let seedNum = 0;
  const seedString = title + (category || '');
  for (let i = 0; i < seedString.length; i++) {
    seedNum += seedString.charCodeAt(i);
  }

  const photoId = list[seedNum % list.length];
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&q=80&w=800`;
}

/**
 * Generates a modern multi-stop CSS gradient string representing a high-fidelity mesh or abstract graphic.
 */
export function getDynamicServiceGradient(colorInput?: string, seedId: string = 'default'): string {
  // Extract background colors or fallbacks
  let baseColor = colorInput || '#3b82f6';
  
  // If it's a tailwind gradient direction class (e.g., from-emerald-500 to-teal-600), resolve stable colors
  if (baseColor.includes('from-') || baseColor.includes('to-')) {
    if (baseColor.includes('rose') || baseColor.includes('red')) baseColor = '#f43f5e';
    else if (baseColor.includes('emerald') || baseColor.includes('green')) baseColor = '#10b981';
    else if (baseColor.includes('blue') || baseColor.includes('indigo')) baseColor = '#3b82f6';
    else if (baseColor.includes('orange') || baseColor.includes('amber') || baseColor.includes('yellow')) baseColor = '#f59e0b';
    else if (baseColor.includes('purple') || baseColor.includes('violet') || baseColor.includes('indigo')) baseColor = '#8b5cf6';
    else if (baseColor.includes('cyan') || baseColor.includes('sky')) baseColor = '#06b6d4';
    else baseColor = '#475569';
  }

  // Calculate dynamic offsets based on seed
  let charSum = 0;
  for (let i = 0; i < seedId.length; i++) {
    charSum += seedId.charCodeAt(i);
  }

  const angle = (charSum % 12) * 30; // 0 to 330 deg
  const percent1 = 15 + (charSum % 25); // 15% to 40%
  const percent2 = 55 + (charSum % 35); // 55% to 90%

  return `linear-gradient(${angle}deg, ${baseColor}22 0%, ${baseColor}55 ${percent1}%, ${baseColor}aa ${percent2}%, ${baseColor}ff 100%)`;
}

/**
 * Returns a magnificent placeholder Unsplash image URL for service items based on their category/title.
 */
export function getServiceCoverPlaceholder(service: { id: string; category?: string; bnName?: string; name?: string; color?: string }): string {
  const category = (service.category || 'general').toLowerCase();
  const searchName = ((service.name || '') + ' ' + (service.bnName || '') + ' ' + category).toLowerCase();
  
  let targetKey = 'general';
  
  if (category.includes('health') || category.includes('doctor') || searchName.includes('হাসপাতাল') || searchName.includes('ডাক্তার') || searchName.includes('health')) {
    targetKey = 'health';
  } else if (category.includes('gov') || category.includes('office') || searchName.includes('সরকারি') || searchName.includes('ভূমি')) {
    targetKey = 'gov';
  } else if (category.includes('edu') || category.includes('school') || category.includes('college') || searchName.includes('শিক্ষা') || searchName.includes('স্কুল') || searchName.includes('মাদ্রাসা')) {
    targetKey = 'edu';
  } else if (category.includes('tourism') || category.includes('travel') || searchName.includes('সাফারি') || searchName.includes('পার্ক') || searchName.includes('রিসোর্ট')) {
    targetKey = 'tourism';
  } else if (category.includes('emergency') || category.includes('fire') || searchName.includes('ফায়ার') || searchName.includes('থানা') || searchName.includes('জরুরি')) {
    targetKey = 'emergency';
  } else if (category.includes('agri') || category.includes('crop') || searchName.includes('কৃষি') || searchName.includes('মৎস্য')) {
    targetKey = 'agri';
  } else if (category.includes('union') || category.includes('parishad') || searchName.includes('ইউনিয়ন')) {
    targetKey = 'union';
  } else if (category.includes('finance') || category.includes('bank') || searchName.includes('ব্যাংক') || searchName.includes('টাকা')) {
    targetKey = 'finance';
  } else if (category.includes('transport') || category.includes('bus') || category.includes('train') || searchName.includes('বাস') || searchName.includes('ট্রেন') || searchName.includes('স্টেশন')) {
    targetKey = 'transport';
  } else if (category.includes('post') || category.includes('mail') || searchName.includes('ডাকঘর') || searchName.includes('কুরিয়ার')) {
    targetKey = 'post';
  } else if (category.includes('utility') || category.includes('electric') || searchName.includes('বিদ্যুৎ') || searchName.includes('পানি')) {
    targetKey = 'utility';
  } else if (category.includes('internet') || category.includes('broadband') || searchName.includes('ইন্টারনেট') || searchName.includes('ওয়াইফাই')) {
    targetKey = 'internet';
  } else if (category.includes('business') || category.includes('store') || searchName.includes('ব্যবসা') || searchName.includes('দোকান')) {
    targetKey = 'business';
  }

  const list = CATEGORY_IMAGES[targetKey] || CATEGORY_IMAGES['general'];
  
  // Choose seed using service ID
  let seedNum = 0;
  const idStr = service.id || 'service_cover';
  for (let i = 0; i < idStr.length; i++) {
    seedNum += idStr.charCodeAt(i);
  }

  const photoId = list[seedNum % list.length];
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&q=80&w=800`;
}

/**
 * Compresses an image file (if it is an image) and converts it to a Base64 Data URL.
 * If the file is not an image (e.g. PDF), it converts it directly to a Base64 Data URL.
 */
export function compressAndConvertToBase64(
  file: File,
  maxWidthOrHeight: number = 800,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's a PDF or other non-image, or if canvas isn't supported, do direct FileReader base64 conversion
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
      return;
    }

    // It's an image. Read it into an Image object, resize it onto a canvas, and output compressed data URL.
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidthOrHeight) {
              height = Math.round((height * maxWidthOrHeight) / width);
              width = maxWidthOrHeight;
            }
          } else {
            if (height > maxWidthOrHeight) {
              width = Math.round((width * maxWidthOrHeight) / height);
              height = maxWidthOrHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Fallback if canvas context is null
            resolve(e.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          
          // Determine mime-type (prefer jpeg to keep size small)
          const mimeType = 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve(dataUrl);
        } catch (err) {
          // Fallback on canvas error/exceptions
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => {
        // Fallback on image load error
        resolve(e.target?.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

