# EARS - Engagement Activity Recording System

A web-based application for recording and managing university engagement activities.

## Features

- Record engagement activities (meetings, workshops, community events, etc.)
- Dashboard with activity overview and statistics
- Timeline view of activities
- Activity management and filtering
- User authentication and role-based access
- Admin panel for user and activity management
- Audit logging
- Mobile-responsive design

## Running Offline

This application has been configured to work completely offline:

### Option 1: Open in Browser (Recommended)
1. Simply open `index.html` in any modern web browser
2. The app will work without an internet connection
3. All data is stored locally in your browser

### Option 2: Install as PWA
1. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari)
2. Look for the install prompt or use the browser menu to install
3. The app will be installed as a standalone application
4. Works completely offline after installation

### Option 3: Local Web Server
If you prefer to run a local server:
1. Use any static file server (Python, Node.js, etc.)
2. Example with Python: `python -m http.server 8000`
3. Open `http://localhost:8000` in your browser

## Demo Accounts

- **Admin**: admin@uni.edu / admin123
- **Staff**: staff@uni.edu / staff123

## Data Storage & Sync

### **Local Storage**
- All data is stored locally in browser `localStorage`
- Works completely offline
- Data persists between sessions

### **Automatic Sync Features**
- **Auto-sync**: Automatically syncs data every 30 seconds when online
- **Smart Conflict Resolution**: Prevents overwriting existing data
- **Configurable Exclusions**: Choose which activity types/statuses to exclude from sync
- **Manual Sync**: Button available for immediate sync
- **Connection Monitoring**: Syncs automatically when coming back online

### **Sync Configuration (Admin Only)**
Access sync settings through Admin Panel → Sync Settings:
- Enable/disable automatic sync
- Exclude specific activity types from sync
- Exclude activities by status (pending/approved/rejected)
- View sync status and connection info
- Test sync connection
- Manual sync trigger

### **What Gets Synced**
- Activity records (configurable exclusions apply)
- User accounts and audit logs stay local only
- Sync is one-way: local → Google Sheets (no data pulled back)

### **Sync Safety**
- ✅ **No Overwrites**: Existing Google Sheets data is never overwritten
- ✅ **Conflict-Free**: Multiple users can sync without data loss
- ✅ **Selective Sync**: Configure exactly what data to sync
- ✅ **Offline-First**: Works without sync, sync happens in background

## Browser Support

Works in all modern browsers with LocalStorage support:
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Files Structure

```
/
├── index.html          # Main application
├── style.css           # Stylesheets
├── fonts.css           # Local font definitions
├── script.js           # Application logic
├── sw.js              # Service worker for offline
├── manifest.json      # PWA manifest
├── data.json          # Sample data (optional)
├── assets/            # Static assets
│   └── logo.svg       # Application logo
└── fonts/             # Local fonts
    ├── dm-sans-300.ttf
    ├── dm-sans-400.ttf
    ├── dm-sans-500.ttf
    ├── dm-sans-600.ttf
    ├── dm-mono-400.ttf
    └── dm-mono-500.ttf
```

## Technical Details

- **Frontend**: HTML, CSS, JavaScript
- **Storage**: Browser LocalStorage + Automatic Google Sheets sync
- **Fonts**: Locally hosted Google Fonts (DM Sans, DM Mono)
- **PWA**: Service Worker for offline caching
- **Sync**: Automatic background sync with conflict resolution
- **Responsive**: Mobile-first design
- **Admin Features**: User management, activity approval, sync configuration