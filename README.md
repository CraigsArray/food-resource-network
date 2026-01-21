# Food Resource Network - Setup Instructions

## Google Maps API Setup

To use the map functionality, you need a Google Maps API key:

### Step 1: Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Geocoding API
4. Go to "Credentials" and create an API key
5. (Optional) Restrict the key to your domain for security

### Step 2: Add Your API Key

Open `index.html` and find this line (around line 213):

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&callback=initMap" async defer></script>
```

Replace `YOUR_API_KEY` with your actual Google Maps API key.

### Step 3: Test the App

Simply open `index.html` in your browser. The map should load with pins showing all food resource locations.

## Features

✅ **Google Maps Integration**
- Interactive map showing all food resource locations
- Color-coded pins by organization type:
  - Purple: Church
  - Green: Community Member
  - Blue: Nonprofit
  - Pink: Feeding San Diego Access Point
- Click pins to see post details

✅ **Enhanced Post Cards**
- Primary tag displayed at top (type of assistance)
- Neighborhood prominently shown
- "Show on map" button for posts with coordinates

✅ **Address Geocoding**
- Enter an address when creating a post
- Automatically converted to coordinates and shown on map

✅ **100+ San Diego Locations**
- Comprehensive dropdown of all San Diego cities and neighborhoods
- Alphabetically sorted for easy selection

## No Longer Included

❌ Search functionality (removed as requested)
❌ Manual latitude/longitude entry (replaced with geocoding)

## How to Use

1. **Browse the community feed** - See all food donations and resources
2. **Click map pins** - View location details
3. **Create a post** - Fill out the form with details and address
4. **Auto-geocoding** - Addresses are automatically converted to map pins
5. **Show on map** - Click the button on any post card to center the map

## Troubleshooting

**Map shows "Loading map..." forever:**
- Check that you've added your Google Maps API key
- Ensure Maps JavaScript API and Geocoding API are enabled
- Check browser console for errors

**Geocoding doesn't work:**
- Make sure Geocoding API is enabled in Google Cloud Console
- Verify your API key has permission to use Geocoding API
- Address should include San Diego area (it's automatically appended)

**Map looks blank/gray:**
- This is normal before adding your API key
- The map uses dark theme styling to match the app design

## Data Persistence

Posts are saved to localStorage and persist across page refreshes. To reset:
- Open browser DevTools (F12)
- Go to Application > Local Storage
- Delete the `foodResourcePosts` entry
