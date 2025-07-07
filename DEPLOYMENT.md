# Deployment Guide for Spontaneous Gifting App

## Option 1: Quick Testing with Expo Go

### For the Frontend (React Native App):

1. **Install Expo CLI globally:**
   ```bash
   npm install -g @expo/cli
   ```

2. **Start the development server:**
   ```bash
   cd SpontaneousGifting
   npx expo start
   ```

3. **Share with others:**
   - Install **Expo Go** app on their phones
   - Scan the QR code that appears in the terminal
   - Both devices must be on the same WiFi network

### For the Backend (API):

1. **Deploy to Render.com (Free):**
   - Go to [render.com](https://render.com)
   - Sign up for a free account
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Set the following:
     - **Name:** spontaneous-gifting-backend
     - **Root Directory:** backend
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Environment:** Node
   - Click "Create Web Service"

2. **Update API URLs in the app:**
   - Once deployed, you'll get a URL like: `https://your-app-name.onrender.com`
   - Update all API calls in `SpontaneousGifting/App.tsx` to use this URL instead of localhost

## Option 2: Production Deployment

### Frontend - Build for Production:

1. **Build for iOS/Android:**
   ```bash
   cd SpontaneousGifting
   npx expo build:ios    # For iOS
   npx expo build:android # For Android
   ```

2. **Or use EAS Build (Recommended):**
   ```bash
   npm install -g @expo/eas-cli
   eas build:configure
   eas build --platform ios
   eas build --platform android
   ```

### Backend - Deploy to Production:

**Recommended platforms:**
- **Render.com** (Free tier available)
- **Railway.app** (Free tier available)
- **Heroku** (Paid)
- **DigitalOcean App Platform** (Paid)

## Option 3: Local Network Sharing

If you want to share on your local network:

1. **Find your computer's IP address:**
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. **Update API URLs in the app** to use your computer's IP instead of localhost

3. **Start both servers:**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm start
   
   # Terminal 2 - Frontend
   cd SpontaneousGifting
   npx expo start
   ```

4. **Others on the same network** can access via your computer's IP address

## Important Notes:

- **Backend must be deployed** for the app to work properly (it needs the API)
- **Update all API URLs** in the app after deploying the backend
- **Expo Go** is great for testing but has limitations
- **Production builds** require Apple Developer account (iOS) or Google Play Console (Android)

## Quick Start for Testing:

1. Deploy backend to Render.com
2. Update API URLs in the app
3. Start Expo development server
4. Share QR code with others
5. They install Expo Go and scan the code 