The expandable posts feature should be working! Here's how to test it:

## How to Use
1. Open `index.html` in your browser
2. **Click anywhere on a post card** (the title, details, or any part of the preview)
3. The post should expand showing:
   - Pickup Address
   - Means of Pickup
   - Food Availability
   - Contact info
4. The map should automatically pan to that location
5. Click the post again to collapse it

## Troubleshooting

If posts aren't expanding, check your browser console (F12) for errors.

Common issues:
- **No coordinates**: Posts without lat/lng won't pan the map (but should still expand)
- **JavaScript errors**: Check console for errors
- **LocalStorage data**: Try clearing localStorage and refreshing

### To clear localStorage:
1. Open browser console (F12)
2. Go to Application tab > Local Storage
3. Delete `foodResourcePosts` entry
4. Refresh the page

The click handler is looking for `.post-clickable` divs and should work on any click inside the post preview area.
