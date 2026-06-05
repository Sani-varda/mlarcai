# My Project

## GitHub + OpenCode Setup Guide

### Step 1: Revoke your exposed API key
Go to https://opencode.ai/auth and generate a new key. The one you shared is compromised.

### Step 2: Create a GitHub repository
1. Go to https://github.com/new
2. Enter a repository name (e.g. `my-project`)
3. Click **Create repository**
4. Do NOT initialize with README (we already have one)

### Step 3: Link your local repo to GitHub
Run these commands in your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin master
```
Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with actual values.

### Step 4: Add your API key as a GitHub secret
1. Go to your repo on GitHub: `https://github.com/YOUR_USERNAME/YOUR_REPO_NAME`
2. Click **Settings** tab
3. In left sidebar, expand **Secrets and variables** > click **Actions**
4. Click **New repository secret**
5. **Name:** `OPENCODE_API_KEY`
6. **Secret:** Paste your new Zen API key (from step 1)
7. Click **Add secret**

### Step 5: Install the OpenCode GitHub App
1. Go to https://github.com/apps/opencode-agent
2. Click **Install**
3. Select your repository
4. Click **Install**

### Step 6: Push the workflow file
The `.github/workflows/opencode.yml` file is already created. Push it:

```bash
git add -A
git commit -m "add opencode github workflow"
git push
```

### Step 7: Test it
Go to your repo on GitHub, open an Issue, and comment:

```
/opencode hello
```

OpenCode will reply in the issue.
