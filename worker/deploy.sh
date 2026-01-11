#!/bin/bash
# ScreenshotPro Worker Deployment Script
# Run this on your EC2 instance

set -e

echo "=========================================="
echo "ScreenshotPro Worker Deployment"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Please run as regular user (not root)"
    exit 1
fi

echo -e "${GREEN}[1/7] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

echo -e "${GREEN}[2/7] Installing Java...${NC}"
sudo apt install -y openjdk-11-jdk

echo -e "${GREEN}[3/7] Installing Xvfb and dependencies...${NC}"
sudo apt install -y xvfb libgtk-3-0 libwebkit2gtk-4.0-37 xdg-utils wget

echo -e "${GREEN}[4/7] Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

echo -e "${GREEN}[5/7] Installing Screaming Frog...${NC}"
cd /tmp
if [ ! -f "screamingfrogseospider_latest_all.deb" ]; then
    wget https://download.screamingfrog.co.uk/products/seo-spider/screamingfrogseospider_latest_all.deb
fi
sudo dpkg -i screamingfrogseospider_latest_all.deb || sudo apt-get install -f -y

echo -e "${GREEN}[6/7] Setting up directories...${NC}"
sudo mkdir -p /opt/screenshotpro-worker
sudo mkdir -p /var/screenshotpro/crawls
sudo chown $USER:$USER /opt/screenshotpro-worker
sudo chown $USER:$USER /var/screenshotpro/crawls

echo -e "${GREEN}[7/7] Setting up Xvfb service...${NC}"
# Create Xvfb systemd service
sudo tee /etc/systemd/system/xvfb.service > /dev/null << EOF
[Unit]
Description=X Virtual Frame Buffer Service
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1024x768x24
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable xvfb
sudo systemctl start xvfb

echo ""
echo -e "${GREEN}=========================================="
echo "Installation Complete!"
echo "==========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Activate your Screaming Frog license:"
echo "   export DISPLAY=:99"
echo "   /usr/bin/screamingfrogseospider --headless --license \"YOUR_USERNAME\" \"YOUR_LICENSE_KEY\""
echo ""
echo "2. Copy worker files to /opt/screenshotpro-worker/"
echo ""
echo "3. Create .env file with your Supabase credentials"
echo ""
echo "4. Start the worker:"
echo "   cd /opt/screenshotpro-worker"
echo "   pm2 start crawl-worker.js --name sf-worker"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
