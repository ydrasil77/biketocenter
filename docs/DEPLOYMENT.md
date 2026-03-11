# Dark Velocity — Deployment Guide

## Architecture Overview

```
GitHub (code) ──► Railway (backend server, port 8080)
                         ▲
Vercel (frontend) ───────┘  (VITE_SERVER_URL points to Railway)
```

- **Vercel** hosts the React frontend (static build)
- **Railway** hosts the Node.js/Socket.io backend
- Both are connected via an environment variable

---

## Part 1 — Deploy the Backend to Railway

### Step 1 — Sign up
Go to [railway.app](https://railway.app) and sign in with GitHub.

### Step 2 — Create a new project
1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose the `biketocenter` repository

### Step 3 — Configure the service
In your service → **Settings**:

**Source section:**
- **Root Directory:** `server`

**Deploy section:**
- **Custom Start Command:** `node index.js`

**Networking section:**
- Click **Generate Domain**
- When prompted for a port, enter `8080`
- You'll get a URL like `biketocenter-production.up.railway.app`

### Step 4 — Add environment variables
In your service → **Variables** tab, add:

| Name | Value |
|------|-------|
| `PORT` | (leave blank — Railway sets this automatically) |

If you use Strava integration, also add:
| Name | Value |
|------|-------|
| `STRAVA_CLIENT_ID` | your Strava client ID |
| `STRAVA_CLIENT_SECRET` | your Strava client secret |
| `STRAVA_REDIRECT_URI` | `https://your-railway-url.up.railway.app/auth/strava/callback` |
| `FRONTEND_URL` | `https://your-vercel-url.vercel.app` |

### Step 5 — Verify it's working
Open in your browser:
```
https://biketocenter-production.up.railway.app/health
```
You should see: `{"status":"ok"}`

---

## Part 2 — Deploy the Frontend to Vercel

### Step 1 — Sign up
Go to [vercel.com](https://vercel.com) and sign in with GitHub.

### Step 2 — Import project
1. Click **Add New Project**
2. Select the `biketocenter` repository
3. Leave all build settings as default (Vite is auto-detected)
4. Click **Deploy**

### Step 3 — Add environment variable
After the initial deploy, go to **Settings → Environment Variables**:

| Name | Value |
|------|-------|
| `VITE_SERVER_URL` | `https://biketocenter-production.up.railway.app` |

> ⚠️ Use your actual Railway URL. No trailing slash.

### Step 4 — Redeploy
Click **Redeploy** after adding the environment variable. Vite bakes env vars into the JavaScript bundle at build time, so a redeploy is required.

---

## Part 3 — Pushing Updates

Any `git push` to the `master` branch will:
- Automatically redeploy the **Railway** backend
- Automatically redeploy the **Vercel** frontend

You don't need to do anything manually after a push.

---

---

## Part 4 — Alternative: Deploy Backend to Render (Free)

Render has a genuinely free tier — 750 hours/month (enough for one always-on service).

> ⚠️ **Caveat:** Free Render services sleep after 15 minutes of inactivity. The first connection after sleeping takes ~30 seconds to wake up. For a cycling class, just open the instructor view a minute before your riders join.

### Step 1 — Sign up
Go to [render.com](https://render.com) and sign in with GitHub.

### Step 2 — Create a new Web Service
1. Click **New → Web Service**
2. Connect your GitHub account and select the `biketocenter` repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `dark-velocity-server` |
| **Root Directory** | `server` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Instance Type** | `Free` |

4. Click **Create Web Service**

### Step 3 — Add environment variables
In your service → **Environment** tab, add:

| Name | Value |
|------|-------|
| `NODE_VERSION` | `20` |

For Strava (optional):
| Name | Value |
|------|-------|
| `STRAVA_CLIENT_ID` | your client ID |
| `STRAVA_CLIENT_SECRET` | your client secret |
| `STRAVA_REDIRECT_URI` | `https://your-render-url.onrender.com/auth/strava/callback` |
| `FRONTEND_URL` | `https://your-vercel-url.vercel.app` |

### Step 4 — Get your URL
Your service URL will be: `https://dark-velocity-server.onrender.com`

Test it:
```
https://dark-velocity-server.onrender.com/health
```
Should return `{"status":"ok"}` (may take 30s first time).

### Step 5 — Update Vercel
In Vercel → **Settings → Environment Variables**, update `VITE_SERVER_URL`:
```
https://dark-velocity-server.onrender.com
```
Then **Redeploy** on Vercel.

### Keep-alive tip (optional)
To prevent the 30-second cold start, add a free cron job on [cron-job.org](https://cron-job.org) that pings your `/health` URL every 10 minutes. This keeps Render awake.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Application failed to respond` on Railway | Check Deploy Logs. Usually a missing module or wrong port. |
| Frontend can't connect to server | Verify `VITE_SERVER_URL` in Vercel and redeploy. |
| `Cannot find module '/src/utils/...'` | The server is importing from frontend files — copy the needed file into `server/`. |
| Railway shows wrong port in logs | Railway auto-assigns `PORT` env var. Make sure `server/index.js` uses `process.env.PORT`. |
| Socket.io `ERR_BLOCKED_BY_CLIENT` | Ad blocker may be blocking WebSocket. Try in incognito. |
