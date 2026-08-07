# 📱 Termux (Android Mobile) Setup Guide

Termux par iss WhatsApp AI Bot ko run karne ke liye neeche diye gaye commands step-by-step execute karein.

---

## 🚀 Step-by-Step Setup Commands

### 1. Termux packages update karein aur Chromium + Node.js install karein:
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts chromium git -y
```

### 2. Project directory mein jayein:
```bash
cd bwwebstudio-whatsapp-ai-bot
```

### 3. Latest code pull karein (GitHub se):
```bash
git pull
```

### 4. Project dependencies install karein (Puppeteer download error se bachne ke liye):
```bash
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install --ignore-scripts
```

### 5. Server start karein:
```bash
node server.js
```

---

## 📲 WhatsApp Connect Karne Ka Tarika

1. `node server.js` run karne ke baad Termux terminal screen par hi **QR Code** render ho jayega.
2. Apne mobile mein WhatsApp kholein:
   - **Settings / 3-dots** -> **Linked Devices** -> **Link a Device** par click karein.
   - Termux screen par aaye QR Code ko scan karein.
3. Connected! Bot live ho jayega aur incoming messages par **"BW Web Studio ka AI Assistant"** ban kar samajh kar smart response dega.
