# Screaming Frog Worker

This worker processes crawl jobs for ScreenshotPro using Screaming Frog SEO Spider.

## Server Requirements

- **OS:** Ubuntu 22.04 LTS (recommended)
- **RAM:** Minimum 4GB (8GB+ recommended for large sites)
- **Storage:** 50GB+ SSD
- **Java:** OpenJDK 11+
- **Node.js:** 18+

## Installation

### 1. Install Java

```bash
sudo apt update
sudo apt install openjdk-11-jdk -y
```

### 2. Install Screaming Frog

```bash
# Download latest version
wget https://download.screamingfrog.co.uk/products/seo-spider/screamingfrogseospider_latest_all.deb

# Install dependencies
sudo apt install libgtk-3-0 libwebkit2gtk-4.0-37 -y

# Install Screaming Frog
sudo dpkg -i screamingfrogseospider_latest_all.deb
```

### 3. Activate License

```bash
/usr/bin/screamingfrogseospider --headless --license "YOUR_USERNAME" "YOUR_LICENSE_KEY"
```

### 4. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 5. Setup Worker

```bash
# Clone repository or copy worker files
cd /opt/screenshotpro-worker

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit environment variables
nano .env
```

### 6. Configure Environment

Edit `.env` with your settings:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SF_PATH=/usr/bin/screamingfrogseospider
SF_OUTPUT_DIR=/var/screenshotpro/crawls
POLL_INTERVAL=10000
```

### 7. Create Output Directory

```bash
sudo mkdir -p /var/screenshotpro/crawls
sudo chown $USER:$USER /var/screenshotpro/crawls
```

## Running the Worker

### Development

```bash
npm run dev
```

### Production (with PM2)

```bash
# Install PM2
npm install -g pm2

# Start worker
pm2 start crawl-worker.js --name sf-worker

# Enable startup on boot
pm2 startup
pm2 save

# View logs
pm2 logs sf-worker
```

### Using systemd

Create `/etc/systemd/system/screenshotpro-worker.service`:

```ini
[Unit]
Description=ScreenshotPro Crawl Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/screenshotpro-worker
ExecStart=/usr/bin/node crawl-worker.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable screenshotpro-worker
sudo systemctl start screenshotpro-worker
sudo systemctl status screenshotpro-worker
```

## Testing

You can test the Screaming Frog CLI directly:

```bash
/usr/bin/screamingfrogseospider --headless --crawl "https://example.com" --output-folder /tmp/test-crawl --export-tabs "Internal:All"
```

## Troubleshooting

### Screaming Frog not found

Make sure the path is correct:

```bash
which screamingfrogseospider
```

### Permission denied

Check file permissions:

```bash
ls -la /usr/bin/screamingfrogseospider
sudo chmod +x /usr/bin/screamingfrogseospider
```

### Display errors (headless)

Screaming Frog requires Xvfb for headless operation:

```bash
sudo apt install xvfb -y
Xvfb :99 -screen 0 1024x768x24 &
export DISPLAY=:99
```

### Memory issues

Increase Java heap size by editing `/usr/bin/screamingfrogseospider` and adjusting the `-Xmx` parameter.

### Disk space issues

Screaming Frog requires at least 5GB free disk space. To reduce usage:

```bash
# Remove old crawl data
rm -rf ~/.ScreamingFrogSEOSpider/ProjectInstanceData/*

# Clean apt cache
sudo apt clean && sudo apt autoremove -y

# Remove unused snap packages
sudo snap remove gnome-42-2204 --purge
sudo snap remove gtk-common-themes --purge
sudo snap remove lxd --purge
```

---

## Current Production Deployment

**Server:** AWS EC2 (eu-central-1)
- **IP:** `3.75.174.180`
- **SSH Key:** `server_key.pem`

**SSH Access:**
```bash
ssh -i server_key.pem ubuntu@3.75.174.180
```

**Installed Components:**
| Component | Version | Status |
|-----------|---------|--------|
| Ubuntu | 22.04 LTS | ✅ |
| Java | OpenJDK 11 | ✅ |
| Node.js | 18.x | ✅ |
| PM2 | 6.0.14 | ✅ |
| Screaming Frog | 23.2 | ✅ Licensed |
| Xvfb | systemd service | ✅ Running |

**File Locations:**
- Worker: `/opt/screenshotpro-worker`
- Crawl output: `/var/screenshotpro/crawls`
- Config: `/opt/screenshotpro-worker/.env`
- Logs: `~/.pm2/logs/sf-worker-*.log`

**Useful Commands:**
```bash
# Check worker status
pm2 status

# View live logs
pm2 logs sf-worker

# Restart worker
pm2 restart sf-worker

# Stop worker
pm2 stop sf-worker

# Check disk space
df -h
```

**License:**
- Username: `adam@grafit.agency`
- Stored in: `~/.ScreamingFrogSEOSpider/licence.txt`
