# Testing with ngrok - Quick Guide

## Step 1: Install ngrok

1. Download: https://ngrok.com/download
2. Extract the ZIP file
3. (Optional) Add to PATH or move to project folder

## Step 2: Setup ngrok Account

1. Sign up at https://ngrok.com/signup (free)
2. Go to dashboard → Your Authtoken
3. Run once:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```

## Step 3: Start the Servers

### Option A: Use the batch file
```bash
test-ngrok.bat
```

### Option B: Manual
```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - ngrok
ngrok http 5000
```

## Step 4: Get Your ngrok URL

1. ngrok window will open
2. Copy the **HTTPS** URL (e.g., `https://abc123.ngrok.io`)
3. Ignore the HTTP URL

## Step 5: Update Frontend Config

Edit `client\.env`:
```
VITE_API_URL=https://YOUR-NGROK-URL.ngrok.io
```

## Step 6: Restart Frontend

```bash
cd client
npm run dev
```

## Step 7: Test on Mobile

### Method 1: Same WiFi (Recommended)
1. Find your PC's IP: `ipconfig` → IPv4 Address
2. On phone browser: `http://YOUR-PC-IP:3000`

### Method 2: ngrok for Frontend Too
```bash
# Another terminal
ngrok http 3000
```
Then access the ngrok URL on your phone.

## Step 8: Test the App

1. **Register** - Enroll your face (5 frames)
2. **Clock In** - Test face verification
3. **Admin** - View records

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Camera not working on mobile | Use Chrome, allow permissions |
| "Network error" | Check PC and phone on same WiFi |
| ngrok URL changes | Update `.env` and restart frontend |
| CORS error | Restart backend server |
| Slow on mobile | Use 5GHz WiFi, move closer to router |

## Important Notes

⚠️ **ngrok URL changes every restart** - Update `.env` each time

⚠️ **Free ngrok has limits**:
- Random URL each session
- Connection timeouts
- Limited bandwidth

⚠️ **For production**: Deploy to Railway (not ngrok)

## Next: Deploy to Railway

Once testing is complete:
1. Create Railway account: https://railway.app
2. Connect GitHub repository
3. Deploy backend + database
4. Update `VITE_API_URL` to Railway URL
5. Deploy frontend to Vercel

---

**Cost**: $0 for testing (ngrok free tier)
