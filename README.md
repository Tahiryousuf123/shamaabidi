# PhDReach – CRM for PhD Outreach

A private CRM for Shama Abidi (Clinical Pharmacist, Karachi) to find professors, manage outreach emails for fully-funded PhD positions, and track replies.

---

## Quick Start (Local Dev)

### 1. Clone and install
```bash
git clone <repo-url>
cd shama
npm install
```

### 2. Set environment variables
Copy `.env.local` and fill in the missing values (see **Environment Variables** section below).

### 3. Configure Firebase
- Go to [Firebase Console](https://console.firebase.google.com) → Project `shamaabidi-3ddf8`
- **Authentication** → Sign-in method → Enable **Email/Password**
- **Authentication** → Users → Add user: `shama.abidi80@gmail.com` with a password
- **Firestore** → Create database (Production mode)
- **Firestore** → Rules → Paste contents of `firestore.rules` and publish

### 4. Get the Web App config (client SDK)
- Firebase Console → Project Settings → Your apps → Add web app (or use existing)
- Copy the `firebaseConfig` object values into your `.env.local`

### 5. Run locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

All secrets are read from environment variables. **Never hardcode them.**

### Firebase Client SDK (prefix: `NEXT_PUBLIC_`)
| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same (format: `<project-id>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same (value: `shamaabidi-3ddf8`) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same (format: `<project-id>.firebasestorage.app`) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same |

### Firebase Admin SDK (server-side)
| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `shamaabidi-3ddf8` |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@shamaabidi-3ddf8.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | The `private_key` from service account JSON (with quotes, `\n` as-is) |

### Gmail SMTP
| Variable | How to get it |
|---|---|
| `GMAIL_USER` | `shama.abidi80@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail → My Account → Security → 2-Step Verification → **App Passwords** → Create for "Mail" |

> ⚠️ You must have 2-Step Verification enabled on Gmail to create App Passwords.

### AI / Search APIs
| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → API Key |
| `GEMINI_MODEL` | Default: `gemini-1.5-flash` (or `gemini-1.5-pro` for higher quality) |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys (free tier available) |
| `TAVILY_API_KEY` | Already set: `tvly-dev-3FZo27-...` |

### Cron Security
| Variable | How to set |
|---|---|
| `CRON_SECRET` | Any random string, e.g., run `openssl rand -hex 32` |

---

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/shama-crm.git
git push -u origin main
```

### 2. Import to Vercel
1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the `shama-crm` repository
3. Framework: **Next.js** (auto-detected)
4. Click **Environment Variables** → Add all variables from the table above
   - For `FIREBASE_PRIVATE_KEY`: paste the full key including `-----BEGIN/END PRIVATE KEY-----`, with literal `\n` characters (Vercel handles this correctly)

### 3. Deploy
Click **Deploy**. Vercel will build and deploy.

### 4. Set up Vercel Cron
The `vercel.json` already configures the cron to run daily at 8:00 AM UTC:
```json
{
  "crons": [{ "path": "/api/cron", "schedule": "0 8 * * *" }]
}
```
> Cron jobs require a **Pro** plan on Vercel, or you can trigger manually by calling `GET /api/cron?secret=YOUR_CRON_SECRET`.

### 5. Custom domain (optional)
Vercel Project → Settings → Domains → Add your domain.

---

## Pages

| Path | Description |
|---|---|
| `/login` | Firebase email/password login |
| `/dashboard` | Status counts + professor table with filters |
| `/find` | Search OpenAlex → Tavily → generate draft emails |
| `/professors/[id]` | View/edit email draft, send, regenerate, delete |
| `/settings` | Edit profile, daily limit, CV upload |

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/find` | POST | Find professors (OpenAlex + Tavily + AI) |
| `/api/generate-email` | POST | Generate/regenerate email for a professor |
| `/api/send` | POST | Send email via Gmail SMTP |
| `/api/cron` | GET | Daily cron: detect replies + create follow-ups |

## Data Model

### `professors` collection
```
name, university, country, email, researchArea, sourceUrl, recentPaper,
status: new|draft|sent|followup_draft|followup_sent|replied|email_not_found,
sentAt, createdAt
```

### `emails` collection
```
professorId, type: first|followup, subject, body,
status: draft|sent, sentAt, messageId
```

### `profile` collection (doc: `main`)
```
name, email, background, researchInterests, dailySendLimit, cvFileName, cvBase64
```

### `sendCounters` collection
```
(doc per day: YYYY-MM-DD) → count: number
```

---

## Firestore Security Rules

Located in `firestore.rules`. Only authenticated Firebase users can read/write any document. Apply via Firebase Console or `firebase deploy --only firestore:rules`.

---

## Build Steps Completed

- [x] **Step 1**: Project setup + Login + Firestore
- [x] **Step 2**: Dashboard + manual add professor
- [x] **Step 3**: Email generation (Gemini + Groq fallback)
- [x] **Step 4**: Email sending (Gmail SMTP + daily limit)
- [x] **Step 5**: Find logic (OpenAlex + Tavily)
- [x] **Step 6**: Cron for replies (IMAP) and follow-ups
