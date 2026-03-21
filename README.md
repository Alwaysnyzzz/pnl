# PteroReseller — Panel Management System

Web panel manajemen reseller Pterodactyl.
HTML/CSS/JS + Vercel Serverless Functions + GitHub JSON DB.

## Cara Deploy

### 1. Push ke GitHub repo (bisa private)

### 2. Generate GitHub Personal Access Token
- https://github.com/settings/tokens → Generate new token (classic)
- Centang scope: `repo`

### 3. Deploy ke Vercel
- https://vercel.com → New Project → Import repo

### 4. Set Environment Variables di Vercel
| Key | Contoh |
|-----|--------|
| PTERO_URL | https://panel.domain.com |
| PTERO_API_KEY | ptla_xxxxxxxxxxxx |
| GITHUB_TOKEN | ghp_xxxxxxxxxxxx |
| GITHUB_REPO | username/repo-name |
| GITHUB_BRANCH | main |

Setelah set env → Redeploy

## Default Login Developer
- Username: admin
- Password: admin123

## Cara dapat Pterodactyl Application API Key
1. Login admin → https://panel.domain.com/admin/api
2. Create New → copy key
