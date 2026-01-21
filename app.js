// ===== DATA MODEL & STATE =====
class Post {
    constructor(data) {
        this.id = data.id || this.generateId();
        this.author = data.author;
        this.orgType = data.orgType;
        this.title = data.title;
        this.details = data.details;
        this.neighborhood = data.neighborhood || '';
        this.locationName = data.locationName || '';
        this.address = data.address || '';
        this.contact = data.contact || '';
        this.lat = data.lat || null;
        this.lng = data.lng || null;
        this.imageUrl = data.imageUrl || '';
        this.tags = data.tags || [];
        this.meansOfPickup = data.meansOfPickup || this.extractMeansOfPickup(data.details);
        this.foodAvailability = data.foodAvailability || this.extractFoodAvailability(data.details, data.tags);
        this.createdAt = data.createdAt || Date.now();
    }

    generateId() {
        return 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    extractMeansOfPickup(details) {
        if (!details) return 'Contact for details';
        const lower = details.toLowerCase();

        if (lower.includes('drive-thru') || lower.includes('drive-through')) return 'Drive-through';
        if (lower.includes('walk-up')) return 'Walk-up';
        if (lower.includes('walk up to')) return 'Walk-up to service window';
        if (lower.includes('available anytime') || lower.includes('24')) return 'Self-service (anytime)';
        if (lower.includes('text') && lower.includes('wait near')) return 'Text for curbside pickup';
        if (lower.includes('pull into') && lower.includes('park')) return 'Drive-in parking lot pickup';
        if (lower.includes('enter') && lower.includes('follow')) return 'Walk-in (follow directions on-site)';
        if (lower.includes('line up') || lower.includes('form a')) return 'Walk-up (queue line)';

        return 'Walk-in';
    }

    extractFoodAvailability(details, tags) {
        if (!details && (!tags || tags.length === 0)) return 'Various items available';

        const items = [];
        const lower = (details || '').toLowerCase();
        const tagStr = (tags || []).join(' ').toLowerCase();

        // Check tags and details for food types
        if (tagStr.includes('produce') || lower.includes('produce') || lower.includes('fruits') || lower.includes('veg')) {
            items.push('Fresh produce');
        }
        if (tagStr.includes('pantry') || lower.includes('pantry') || lower.includes('canned') || lower.includes('shelf-stable')) {
            items.push('Pantry staples');
        }
        if (tagStr.includes('bread') || lower.includes('bread')) {
            items.push('Bread/baked goods');
        }
        if (tagStr.includes('hot-meals') || lower.includes('hot meal') || lower.includes('soup')) {
            items.push('Hot meals');
        }
        if (tagStr.includes('prepared-food') || lower.includes('catered') || lower.includes('sandwiches')) {
            items.push('Prepared meals');
        }
        if (tagStr.includes('grab-bags') || lower.includes('meal kit')) {
            items.push('Grab bags / meal kits');
        }
        if (tagStr.includes('dairy') || lower.includes('milk') || lower.includes('eggs')) {
            items.push('Dairy products');
        }
        if (tagStr.includes('diapers') || lower.includes('diapers')) {
            items.push('Diapers');
        }
        if (tagStr.includes('hygiene') || lower.includes('hygiene') || lower.includes('soap')) {
            items.push('Hygiene items');
        }
        if (tagStr.includes('water') || lower.includes('water bottles')) {
            items.push('Water');
        }

        return items.length > 0 ? items.join(', ') : 'Various items available';
    }
}

// ===== SEEDED DATA =====
const SEED_POSTS = [
    {
        author: "Maria L.",
        orgType: "Community Member",
        title: "Extra groceries + pantry staples (North Park)",
        neighborhood: "North Park",
        locationName: "Near North Park Library",
        address: "3795 31st St, San Diego, CA 92104",
        details: "I have extra groceries from a bulk trip: canned beans, rice, pasta, cereal, and a few snacks. Pickup window: Today 4:30–6:30 PM. Please text when you're on the way and wait near the front steps; I'll bring items out. Bring your own bags if you can.",
        contact: "Text (619) 555-0138",
        tags: ["pantry", "grab-bags", "kid-friendly"],
        lat: 32.7455,
        lng: -117.1312,
        createdAt: Date.now() - 3600000
    },
    {
        author: "St. Bridget Community Pantry",
        orgType: "Church",
        title: "Produce boxes + bread (City Heights)",
        neighborhood: "City Heights",
        locationName: "St. Bridget Pantry Entrance",
        address: "4773 Orange Ave, San Diego, CA 92115",
        details: "We're distributing produce boxes (mixed fruits/veg) plus bread while supplies last. Pickup: Wed 10:00 AM–12:00 PM. Enter from the side gate on Orange Ave and follow the cones. One box per household. No ID required.",
        contact: "Email pantry@stbridgetsd.org",
        tags: ["produce", "bread", "no-id"],
        lat: 32.7394,
        lng: -117.0931,
        createdAt: Date.now() - 7200000
    },
    {
        author: "Feeding San Diego Access Point – Linda Vista",
        orgType: "Feeding San Diego Access Point",
        title: "Drive-thru food distribution (Linda Vista)",
        neighborhood: "Linda Vista",
        locationName: "Parking Lot Distribution Line",
        address: "6905 Linda Vista Rd, San Diego, CA 92111",
        details: "Drive-thru distribution with pantry items and produce. Pickup: Thu 9:00–11:00 AM. Stay in your vehicle and follow volunteers' directions. Arrive early if possible. Limit one allocation per vehicle/household.",
        contact: "Call (858) 555-0199",
        tags: ["drive-thru", "produce", "pantry"],
        lat: 32.7707,
        lng: -117.1781,
        createdAt: Date.now() - 10800000
    },
    {
        author: "Logan Heights Mutual Aid",
        orgType: "Nonprofit",
        title: "Grab-and-go meal kits (Logan Heights)",
        neighborhood: "Logan Heights",
        locationName: "Community Table (front courtyard)",
        address: "3040 National Ave, San Diego, CA 92113",
        details: "Meal kits include rice, beans, tortillas, and a protein option (while supplies last). Pickup: Fri 2:00–4:00 PM. Walk-up only. Please form a single line along the mural wall and keep aisles clear.",
        contact: "Text (619) 555-0144",
        tags: ["meal-kits", "walk-up", "pantry"],
        lat: 32.7058,
        lng: -117.1178,
        createdAt: Date.now() - 14400000
    },
    {
        author: "Derek P.",
        orgType: "Community Member",
        title: "Leftover catered trays (Clairemont) — first come",
        neighborhood: "Clairemont",
        locationName: "Clairemont Village Park entrance",
        address: "3201 Clairemont Dr, San Diego, CA 92117",
        details: "I have leftover catered trays: sandwiches + salad portions (refrigerated). Pickup: Today 6:00–7:00 PM only. Please text ETA; I'll be by the park entrance with coolers. Bring containers if you have them.",
        contact: "Text (858) 555-0122",
        tags: ["prepared-food", "first-come", "bring-containers"],
        lat: 32.8107,
        lng: -117.2045,
        createdAt: Date.now() - 21600000
    },
    {
        author: "Barrio Logan Community Fridge Team",
        orgType: "Nonprofit",
        title: "Community fridge restock + pantry shelf items (Barrio Logan)",
        neighborhood: "Barrio Logan",
        locationName: "Community Fridge",
        address: "2170 Logan Ave, San Diego, CA 92113",
        details: "Fridge restock includes milk, eggs, veggies, and a pantry shelf with canned goods. Available now through 8:00 PM. Please take what you need and leave some for others. Keep fridge door closed between grabs.",
        contact: "Email barriologanfridge@proton.me",
        tags: ["community-fridge", "dairy", "produce"],
        lat: 32.6983,
        lng: -117.1306,
        createdAt: Date.now() - 28800000
    },
    {
        author: "Good Shepherd Pantry Volunteers",
        orgType: "Church",
        title: "Weekend pantry bags + hygiene add-ons (South Park)",
        neighborhood: "South Park",
        locationName: "Fellowship Hall (rear entrance)",
        address: "2680 Granada Ave, San Diego, CA 92104",
        details: "Pantry bags (shelf-stable foods) plus limited hygiene items (soap, shampoo, wipes). Pickup: Sat 9:30–11:30 AM. Enter via rear parking lot, follow signs to Fellowship Hall. One bag per person; families can request extra if available.",
        contact: "Call (619) 555-0171",
        tags: ["pantry", "hygiene", "weekend"],
        lat: 32.7280,
        lng: -117.1250,
        createdAt: Date.now() - 32400000
    },
    {
        author: "Feeding San Diego Access Point – San Ysidro",
        orgType: "Feeding San Diego Access Point",
        title: "Fresh produce + pantry staples (San Ysidro)",
        neighborhood: "San Ysidro",
        locationName: "Distribution tent near main lot",
        address: "663 E San Ysidro Blvd, San Diego, CA 92173",
        details: "Fresh produce (seasonal) + pantry staples. Pickup: Tue 1:00–3:00 PM. Walk-up line starts at the blue tent. Please bring a cart or sturdy bags. If you can't stand long, ask a volunteer for priority assistance.",
        contact: "Email sydistro@feedingsd.example",
        tags: ["produce", "pantry", "walk-up"],
        lat: 32.5586,
        lng: -117.0450,
        createdAt: Date.now() - 43200000
    },
    {
        author: "Encanto Neighborhood Helpers",
        orgType: "Nonprofit",
        title: "Hot meals + water bottles (Encanto)",
        neighborhood: "Encanto",
        locationName: "Corner table near rec center entrance",
        address: "6565 Imperial Ave, San Diego, CA 92114",
        details: "We'll have hot meals (while supplies last) plus water bottles. Pickup: Sun 12:00–1:30 PM. Please line up along the sidewalk, and let us know about dietary restrictions (vegetarian options limited).",
        contact: "Text (619) 555-0160",
        tags: ["hot-meals", "water", "limited-veg"],
        lat: 32.7080,
        lng: -117.0530,
        createdAt: Date.now() - 54000000
    },
    {
        author: "Mira Mesa Community Pantry Box",
        orgType: "Community Member",
        title: "Free pantry box restock (Mira Mesa) — take what you need",
        neighborhood: "Mira Mesa",
        locationName: "Little Free Pantry Box (front yard)",
        address: "8405 New Salem St, San Diego, CA 92126",
        details: "Little pantry box restocked with canned soups, oatmeal, pasta, and snacks. Available anytime; please be respectful of neighbors and keep noise down after 8 PM. If the box is empty, check back later this week.",
        contact: "Email miramesapantrybox@gmail.com",
        tags: ["pantry", "24-7", "snacks"],
        lat: 32.9153,
        lng: -117.1439,
        createdAt: Date.now() - 64800000
    },
    {
        author: "La Mesa Care & Share",
        orgType: "Nonprofit",
        title: "Family produce bags + diapers (La Mesa)",
        neighborhood: "La Mesa",
        locationName: "Side parking lot pickup",
        address: "4690 Palm Ave, La Mesa, CA 91942",
        details: "Produce bags for families plus limited diapers (sizes 3–5). Pickup: Mon 10:00 AM–12:00 PM. Pull into side lot and park; a volunteer will confirm diaper size if available. Please bring ID only if picking up diapers; produce is open to all.",
        contact: "Call (619) 555-0116",
        tags: ["produce", "diapers", "family"],
        lat: 32.7678,
        lng: -117.0231,
        createdAt: Date.now() - 86400000
    },
    {
        author: "Chula Vista Community Kitchen",
        orgType: "Nonprofit",
        title: "Soup + bread night (Chula Vista)",
        neighborhood: "Chula Vista",
        locationName: "Community Kitchen window",
        address: "389 E St, Chula Vista, CA 91910",
        details: "Serving soup and bread. Pickup: Wed 5:00–6:30 PM. Walk up to the service window and let us know how many portions you need. Please bring your own container if possible; we have limited disposable bowls.",
        contact: "Email cvcommunitykitchen@proton.me",
        tags: ["hot-meals", "bread", "bring-container"],
        lat: 32.6401,
        lng: -117.0842,
        createdAt: Date.now() - 129600000
    }
];

// ===== STATE MANAGEMENT =====
let posts = [];
let map;
let markers = [];
let geocoder;

// ===== GOOGLE MAPS INITIALIZATION =====
function initMap() {
    // Center on San Diego
    const sanDiego = { lat: 32.7157, lng: -117.1611 };

    map = new google.maps.Map(document.getElementById('map'), {
        center: sanDiego,
        zoom: 11,
        styles: [
            {
                featureType: 'all',
                elementType: 'geometry',
                stylers: [{ color: '#242f3e' }]
            },
            {
                featureType: 'all',
                elementType: 'labels.text.stroke',
                stylers: [{ color: '#242f3e' }]
            },
            {
                featureType: 'all',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#746855' }]
            },
            {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#17263c' }]
            }
        ]
    });

    geocoder = new google.maps.Geocoder();

    // Initialize after map is ready
    loadPosts();
    renderFeed();
    updateMapMarkers();
    attachEventListeners();
}

// Make initMap available globally for the callback
window.initMap = initMap;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Always load posts and attach listeners even if map fails
    loadPosts();
    renderFeed();
    attachEventListeners();

    // Show loading message
    const mapContainer = document.getElementById('map');
    if (mapContainer && !map) {
        mapContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted);">Loading map...</div>';
    }

    // Fallback: if Google Maps doesn't load in 3 seconds, continue anyway
    setTimeout(() => {
        if (!map) {
            console.warn('Google Maps did not load - continuing without map');
            const mapContainer = document.getElementById('map');
            if (mapContainer) {
                mapContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); background: var(--color-bg-light); padding: 20px; text-align: center;">⚠️ Map failed to load (ad blocker or API key issue)<br><br>Posts will still work without the map!</div>';
            }
        }
    }, 3000);
});

function loadPosts() {
    const savedPosts = localStorage.getItem('foodResourcePosts');
    if (savedPosts) {
        try {
            const parsed = JSON.parse(savedPosts);
            posts = parsed.map(p => new Post(p));
        } catch (e) {
            console.error('Error loading saved posts:', e);
            posts = SEED_POSTS.map(p => new Post(p));
        }
    } else {
        posts = SEED_POSTS.map(p => new Post(p));
    }
}

function savePosts() {
    try {
        localStorage.setItem('foodResourcePosts', JSON.stringify(posts));
    } catch (e) {
        console.error('Error saving posts:', e);
    }
}

// ===== MAP FUNCTIONS =====
function updateMapMarkers() {
    if (!map) return;

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    // Add markers for posts with coordinates
    posts.forEach(post => {
        if (post.lat && post.lng) {
            const marker = new google.maps.Marker({
                position: { lat: post.lat, lng: post.lng },
                map: map,
                title: post.title,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: getOrgColor(post.orgType),
                    fillOpacity: 0.9,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });

            // Info window
            const infoWindow = new google.maps.InfoWindow({
                content: createMapInfoWindow(post)
            });

            marker.addListener('click', () => {
                // Close other info windows
                markers.forEach(m => {
                    if (m.infoWindow) m.infoWindow.close();
                });
                infoWindow.open(map, marker);
            });

            marker.infoWindow = infoWindow;
            markers.push(marker);
        }
    });
}

function createMapInfoWindow(post) {
    return `
        <div style="font-family: Inter, sans-serif; max-width: 250px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; color: ${getOrgColor(post.orgType)};">${escapeHtml(post.title)}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>${escapeHtml(post.orgType)}</strong></p>
            ${post.neighborhood ? `<p style="margin: 4px 0; font-size: 12px;">📍 ${escapeHtml(post.neighborhood)}</p>` : ''}
            ${post.tags.length > 0 ? `<p style="margin: 4px 0; font-size: 11px; color: #888;">${post.tags.map(t => '#' + t).join(' ')}</p>` : ''}
        </div>
    `;
}

function getOrgColor(orgType) {
    const colorMap = {
        'Church': '#A855F7',
        'Community Member': '#22C55E',
        'Nonprofit': '#3B82F6',
        'Feeding San Diego Access Point': '#E91E63'
    };
    return colorMap[orgType] || '#22C55E';
}

async function geocodeAddress(address) {
    if (!geocoder || !address) return null;

    return new Promise((resolve) => {
        geocoder.geocode({ address: address + ', San Diego, CA' }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location;
                resolve({
                    lat: location.lat(),
                    lng: location.lng()
                });
            } else {
                console.log('Geocode failed:', status);
                resolve(null);
            }
        });
    });
}

function panMapToLocation(lat, lng) {
    if (!map) return;

    map.panTo({ lat, lng });
    map.setZoom(15);

    // Scroll to map
    document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== RENDERING =====
function renderFeed() {
    const feedContainer = document.getElementById('feedContainer');
    const sortedPosts = sortPosts([...posts]);

    if (sortedPosts.length === 0) {
        feedContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
                <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">📭 No posts found</p>
                <p>Create a new post to get started!</p>
            </div>
        `;
        return;
    }

    feedContainer.innerHTML = sortedPosts.map(post => createPostCard(post)).join('');
}

function createPostCard(post) {
    const timeLabel = getTimeLabel(post.createdAt);
    const orgClass = getOrgClass(post.orgType);
    const primaryTag = post.tags.length > 0 ? post.tags[0] : null;

    return `
        <article class="post-card" data-post-id="${post.id}">
            <div class="post-header">
                <div class="post-author">
                    <span class="author-name">${escapeHtml(post.author)}</span>
                    <span class="org-badge ${orgClass}">${escapeHtml(post.orgType)}</span>
                </div>
                <span class="time-label">${timeLabel}</span>
            </div>
            
            <!-- Enhanced Preview: Type of Assistance + Neighborhood -->
            <div class="post-preview">
                ${primaryTag ? `<span class="primary-tag">🏷️ ${escapeHtml(primaryTag)}</span>` : ''}
                ${post.neighborhood ? `<span class="primary-neighborhood">📍 ${escapeHtml(post.neighborhood)}</span>` : ''}
            </div>
            
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            <p class="post-details">${escapeHtml(post.details)}</p>
            
            ${post.imageUrl ? `<img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" class="post-image" loading="lazy">` : ''}
            
            <!-- Always Show Full Details -->
            
                <div class="expanded-details">
                    <div class="detail-row">
                        <span class="detail-label">📍 Pickup Address:</span>
                        <span class="detail-value">${escapeHtml(post.address || post.locationName || 'Contact for location')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">🚗 Means of Pickup:</span>
                        <span class="detail-value">${escapeHtml(post.meansOfPickup)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">🍎 Food Availability:</span>
                        <span class="detail-value">${escapeHtml(post.foodAvailability)}</span>
                    </div>
                    ${post.contact ? `
                        <div class="detail-row">
                            <span class="detail-label">📞 Contact:</span>
                            <span class="detail-value">${escapeHtml(post.contact)}</span>
                        </div>
                    ` : ''}
                    
                    ${createLocationBlock(post)}
                    
                    ${post.tags.length > 0 ? `
                        <div class="tags-container">
                            ${post.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="post-actions">
                        <button class="action-btn copy-btn" data-details="${escapeHtml(post.details)}">
                            📋 Copy directions
                        </button>
                    </div>
                </div>

        </article>
    `;
}

function createLocationBlock(post) {
    if (!post.neighborhood && !post.locationName && !post.address) {
        return '';
    }

    return `
        <div class="location-block">
            <span class="location-icon">📍</span>
            <div class="location-info">
                ${post.neighborhood ? `<div class="location-neighborhood">${escapeHtml(post.neighborhood)}</div>` : ''}
                ${post.locationName ? `<div class="location-name">${escapeHtml(post.locationName)}</div>` : ''}
                ${post.address ? `<div class="location-address">${escapeHtml(post.address)}</div>` : ''}
            </div>
        </div>
    `;
}

function getOrgClass(orgType) {
    const classMap = {
        'Church': 'church',
        'Community Member': 'community',
        'Nonprofit': 'nonprofit',
        'Feeding San Diego Access Point': 'feeding-sd'
    };
    return classMap[orgType] || 'community';
}

function getTimeLabel(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===== SORTING =====
function sortPosts(postsToSort) {
    return postsToSort.sort((a, b) => b.createdAt - a.createdAt);
}

// ===== EVENT LISTENERS =====
function attachEventListeners() {
    // Form submission
    const form = document.getElementById('createPostForm');
    form.addEventListener('submit', handleFormSubmit);

    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    clearBtn.addEventListener('click', clearForm);

    // Mobile toggle
    const mobileToggleBtn = document.getElementById('mobileToggleBtn');
    const formWrapper = document.getElementById('formWrapper');
    const closeBtnMobile = document.getElementById('closeBtnMobile');

    mobileToggleBtn.addEventListener('click', () => {
        formWrapper.classList.add('active');
    });

    closeBtnMobile.addEventListener('click', () => {
        formWrapper.classList.remove('active');
    });

    // Delegate events for dynamic content
    document.getElementById('feedContainer').addEventListener('click', handleFeedClick);
}

function handleFeedClick(e) {
    // Copy button
    if (e.target.closest('.copy-btn')) {
        e.stopPropagation();
        const btn = e.target.closest('.copy-btn');
        const details = btn.getAttribute('data-details');
        copyToClipboard(details);
        return;
    }

    // Post card click to expand/collapse
    const clickableArea = e.target.closest('.post-clickable');
    if (clickableArea) {
        const postId = clickableArea.getAttribute('data-post-id');
        togglePostExpansion(postId);
        return;
    }
}

function togglePostExpansion(postId) {
    if (expandedPostId === postId) {
        // Collapse
        expandedPostId = null;
    } else {
        // Expand and pan map
        expandedPostId = postId;

        // Find post and pan to location
        const post = posts.find(p => p.id === postId);
        if (post && post.lat && post.lng) {
            panMapToLocation(post.lat, post.lng);
        }
    }

    renderFeed();
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showNotification('✅ Directions copied to clipboard!');
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showNotification('✅ Directions copied to clipboard!');
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        showNotification('❌ Failed to copy. Please copy manually.');
    }
}

function showNotification(message) {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: var(--color-success);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

// ===== FORM HANDLING =====
async function handleFormSubmit(e) {
    e.preventDefault();

    // Clear previous errors
    clearErrors();

    // Get form values
    const formData = {
        author: document.getElementById('authorName').value.trim(),
        orgType: document.getElementById('orgType').value,
        title: document.getElementById('postTitle').value.trim(),
        details: document.getElementById('postDetails').value.trim(),
        neighborhood: document.getElementById('neighborhood').value,
        locationName: document.getElementById('locationName').value.trim(),
        address: document.getElementById('address').value.trim(),
        imageUrl: document.getElementById('imageUrl').value.trim(),
        tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t),
        contact: '',
        meansOfPickup: '',
        foodAvailability: ''
    };

    // Validate
    if (!validateForm(formData)) {
        return;
    }

    // Try to geocode address if provided
    if (formData.address) {
        showNotification('🌍 Geocoding address...');
        const coords = await geocodeAddress(formData.address);
        if (coords) {
            formData.lat = coords.lat;
            formData.lng = coords.lng;
        }
    }

    // Create new post
    const newPost = new Post(formData);
    posts.unshift(newPost); // Add to beginning

    // Save and render
    savePosts();
    renderFeed();
    updateMapMarkers();

    // Scroll to top of feed
    document.getElementById('feedContainer').scrollTop = 0;

    // Clear form
    clearForm();

    // Close mobile form if open
    document.getElementById('formWrapper').classList.remove('active');

    // Show success message
    showNotification('✅ Post created successfully!');
}

function validateForm(data) {
    let isValid = true;

    // Title required
    if (!data.title) {
        showError('titleError', 'Title is required');
        isValid = false;
    }

    // Details required
    if (!data.details) {
        showError('detailsError', 'Details are required');
        isValid = false;
    }

    return isValid;
}

function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
    }
}

function clearErrors() {
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => el.textContent = '');
}

function clearForm() {
    document.getElementById('createPostForm').reset();
    document.getElementById('authorName').value = 'Community Helper';
    clearErrors();
}

// ===== UTILITIES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS animations dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
