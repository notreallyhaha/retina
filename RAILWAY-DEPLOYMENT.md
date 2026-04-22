# Railway Deployment Guide

## Backend Deployment (Railway)

### Step 1: Prepare Your Repository

1. **Initialize Git** (if not already done):
   ```bash
   cd "C:\Users\User\Documents\OJT\Face Recognition Clock In\face-recognition-clock"
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub**:
   - Create a new repository on GitHub
   - Push your code:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
     git branch -M main
     git push -u origin main
     ```

### Step 2: Deploy to Railway

1. **Go to Railway**: https://railway.app

2. **Sign up/Login** with GitHub

3. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

4. **Configure the Service**:
   - Railway will auto-detect it's a Node.js app
   - The `nixpacks.toml` or `Procfile` will configure the build

5. **Set Environment Variables**:
   - Click on your service → Variables tab
   - Add these variables:
     ```
     ALLOWED_ORIGINS=*
     NODE_ENV=production
     ```
   - (For production, replace `*` with your frontend URL)

6. **Deploy**:
   - Railway will automatically build and deploy
   - Wait for the deployment to complete (~2-5 minutes)

7. **Get Your Railway URL**:
   - Click "Settings" → "Domains"
   - Copy your public URL (e.g., `https://your-app.railway.app`)

### Step 3: Configure CORS (Important!)

After deployment, update the environment variables:

1. Go to Railway → Your Service → Variables
2. Update `ALLOWED_ORIGINS` to include:
   - Your Vercel frontend URL
   - Your Railway backend URL
   - localhost for testing

   Example:
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app.railway.app,http://localhost:3000,http://localhost:5173
   ```

---

## Frontend Deployment (Vercel)

### Step 1: Update Frontend Configuration

1. **Update `client/.env`**:
   ```
   VITE_API_URL=https://your-app.railway.app
   ```

2. **Update `client/vite.config.js`** (if needed for build):
   ```javascript
   export default {
     define: {
       'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://your-app.railway.app')
     }
   }
   ```

### Step 2: Deploy to Vercel

1. **Go to Vercel**: https://vercel.com

2. **Sign up/Login** with GitHub

3. **Import Repository**:
   - Click "Add New Project"
   - Import your GitHub repository
   - Set Framework Preset to "Vite"

4. **Configure Build**:
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. **Set Environment Variables**:
   - Click "Environment Variables"
   - Add:
     ```
     VITE_API_URL=https://your-app.railway.app
     ```

6. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete (~1-3 minutes)

7. **Get Your Vercel URL**:
   - Copy your production URL (e.g., `https://your-app.vercel.app`)

### Step 3: Update Railway CORS

1. Go back to Railway
2. Update `ALLOWED_ORIGINS` with your new Vercel URL:
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app.railway.app
   ```

---

## Testing

### Test Registration:
1. Go to your Vercel URL
2. Click "Register"
3. Allow camera access
4. Fill in your details
5. Capture 5 face angles

### Test Clock In/Out:
1. Go to your Vercel URL
2. Click "Clock In" or "Clock Out"
3. Allow camera access
4. Verify your face is recognized

---

## Troubleshooting

### Camera Not Working:
- Ensure you're using HTTPS (Vercel provides this automatically)
- Check browser permissions
- Close other apps using the camera

### API Errors:
- Check Railway logs for errors
- Verify `ALLOWED_ORIGINS` includes your Vercel URL
- Check that `VITE_API_URL` is correct in Vercel environment variables

### Face Recognition Failing:
- Ensure good lighting
- Face should be clearly visible
- Move closer to camera if "face too small" error

---

## Cost Estimates

- **Railway**: Free tier available ($5/month for hobby)
- **Vercel**: Free for personal projects

---

## File Structure for Deployment

```
face-recognition-clock/
├── server/
│   ├── index.js              # Main server (PORT from env)
│   ├── .railway.json         # Railway config
│   ├── nixpacks.toml         # Build config
│   ├── Procfile              # Alternative deploy config
│   ├── .env.example          # Environment template
│   └── .gitignore            # Git ignore
├── client/
│   ├── .env                  # API URL config
│   ├── vite.config.js        # Vite config
│   └── package.json
└── README.md
```

---

## Quick Commands

### Local Testing:
```bash
# Terminal 1 - Backend
cd server
npm install
npm start

# Terminal 2 - Frontend
cd client
npm install
npm run dev
```

### Deploy:
```bash
git add .
git commit -m "Update for deployment"
git push origin main
```

Railway and Vercel will auto-deploy on push to main branch.
