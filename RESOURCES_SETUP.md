# Resources Wiki — Setup Guide

The Resources wiki uses **GitHub** for authentication and data storage, with **Vercel** serverless functions as the API layer. Everything is free.

---

## Architecture Overview

| Component | Service | Cost |
|-----------|---------|------|
| Authentication | GitHub OAuth | Free |
| Data storage | Private GitHub repo | Free |
| API backend | Vercel serverless functions | Free (Hobby plan) |
| Image storage | Same private GitHub repo | Free |
| Sessions | Signed JWT cookies | — |

Users log in with their **GitHub accounts**. Wiki pages are stored as files in a **private GitHub repository**. Vercel serverless functions handle auth, access control, and proxying data.

> **Note:** The Resources page only works when accessed via your **Vercel deployment** (not GitHub Pages), since it depends on the Vercel API routes.

---

## Step 1: Create a Private GitHub Repository for Wiki Data

1. Go to [github.com/new](https://github.com/new)
2. Name it something like `group-wiki-data`
3. Set visibility to **Private**
4. Check "Add a README file"
5. Click **Create repository**

This repo will store all wiki pages, user roles, and uploaded images.

## Step 2: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** `Group Resources Wiki`
   - **Homepage URL:** `https://www.xuchenghe.science` (your Vercel domain)
   - **Authorization callback URL:** `https://www.xuchenghe.science/api/auth/callback`
4. Click **Register application**
5. Note the **Client ID**
6. Click **Generate a new client secret** — copy the **Client Secret** immediately

## Step 3: Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Give it a name like `wiki-data-access`
3. Set expiration to **1 year** (or custom)
4. Under **Repository access**, select **Only select repositories** → choose your `group-wiki-data` repo
5. Under **Permissions → Repository permissions**, set:
   - **Contents:** Read and write
6. Click **Generate token** — copy the token immediately

## Step 4: Generate a Session Secret

Run this in your terminal to generate a random secret:

```bash
openssl rand -base64 32
```

Copy the output string.

## Step 5: Configure Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com) → your project → **Settings → Environment Variables**
2. Add the following variables (set all for **Production**, **Preview**, and **Development**):

| Variable | Value |
|----------|-------|
| `GITHUB_CLIENT_ID` | OAuth App Client ID from Step 2 |
| `GITHUB_CLIENT_SECRET` | OAuth App Client Secret from Step 2 |
| `GITHUB_TOKEN` | Fine-grained PAT from Step 3 |
| `WIKI_REPO` | `your-username/group-wiki-data` (owner/repo format) |
| `ADMIN_GITHUB_LOGIN` | Your GitHub username (e.g., `momo-catcat`) |
| `SESSION_SECRET` | The random string from Step 4 |
| `SITE_URL` | `https://www.xuchenghe.science` (no trailing slash) |

## Step 6: Deploy

1. Commit and push your changes to trigger a Vercel deployment
2. Navigate to `https://your-vercel-domain/resources/`
3. Click **Sign in with GitHub**
4. Authorize the OAuth app
5. Since your GitHub username matches `ADMIN_GITHUB_LOGIN`, you'll automatically be the **Admin**
6. Start creating wiki pages!

---

## How It Works

### Roles

| Role | View Pages | Edit/Create | Delete Pages | Manage Users |
|------|:----------:|:-----------:|:------------:|:------------:|
| **Admin** | Yes | Yes | Yes | Yes |
| **Editor** | Yes | Yes | No | No |
| **Viewer** | Yes | No | No | No |
| **Pending** | No | No | No | No |

### Adding Team Members

**Option A — Pre-add (recommended):**
1. Click the **Admin** button (gear icon)
2. Enter the team member's GitHub username and select their role
3. Click **Add**
4. When they visit the Resources page and sign in with GitHub, they'll get the assigned role

**Option B — Post-login approval:**
1. A team member visits `/resources/` and signs in with GitHub
2. They see the "Pending Approval" screen
3. Open the Admin panel — you'll see them listed as **Pending**
4. Change their role dropdown to Viewer or Editor

### Creating Wiki Pages

- Click **New Page** in the sidebar to create a root-level page
- Click the **+** icon on any page in the tree to create a sub-page
- Full **Markdown** support: headings, bold, italic, links, code blocks, tables, blockquotes, images
- **Upload images** via the toolbar button or by dragging & dropping into the editor

### Keyboard Shortcuts

- **Ctrl+S** / **Cmd+S** — Save page while editing
- **Tab** — Insert indent in editor

### Page Structure Example

```
📁 Research Resources
   📄 Data Processing Guide
   📄 Instrument Manuals
   📁 CLOUD Experiment
      📄 Chamber Operations
      📄 Safety Protocols
📁 Group Policies
   📄 Travel Guidelines
   📄 Publication Process
📁 Onboarding
   📄 New Member Checklist
   📄 Software Setup
```

---

## Data Storage Details

All data lives in your private GitHub repository:

```
group-wiki-data/
├── users.json          # User roles: {githubLogin: {role, displayName, ...}}
├── pages.json          # Page tree metadata: [{id, title, parentId, order, ...}]
├── pages/
│   └── {pageId}.md     # Individual page content in Markdown
└── uploads/
    └── {timestamp}_{filename}   # Uploaded images
```

You can view and manage this data directly in GitHub if needed.

---

## Troubleshooting

### "Resources Unavailable" message
The page is being accessed via GitHub Pages instead of Vercel. Use your Vercel domain.

### Login redirects in a loop
Check that `SITE_URL` in Vercel matches your actual domain, and that the OAuth callback URL matches: `{SITE_URL}/api/auth/callback`.

### "Access denied" after login
Your GitHub username might not match `ADMIN_GITHUB_LOGIN`. Check the casing — comparison is case-insensitive.

### 500 errors from API
Check Vercel's Function Logs (Vercel Dashboard → your project → Logs). Common causes:
- `GITHUB_TOKEN` expired or doesn't have `contents:write` permission
- `WIKI_REPO` format wrong (should be `owner/repo`)
- Private repo doesn't exist yet

### Images don't upload
- Max size: 3 MB per image (due to API body limits)
- The `GITHUB_TOKEN` needs write access to the wiki repo

### PAT expired
Generate a new fine-grained token (Step 3) and update the `GITHUB_TOKEN` environment variable in Vercel.

---

## Free Tier Limits

| Service | Limit |
|---------|-------|
| GitHub private repos | Unlimited |
| GitHub API (authenticated) | 5,000 requests/hour |
| GitHub repo storage | 5 GB recommended |
| Vercel Hobby plan | 100 GB bandwidth, unlimited deployments |
| Vercel serverless functions | 100K invocations/month |

These limits are far beyond what a research group wiki will use.
