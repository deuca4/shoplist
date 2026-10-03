# 🛒 ShopList Local Server

A lightweight, self-hosted shopping list web application powered by Node.js, Express, and an embedded SQLite database. Designed specifically to run inside Docker and deploy effortlessly via **Portainer**.

---

## 🌟 Key Features

- 🐳 **Portainer & Docker Ready**: Easy 1-click stack deployment with automatic health checks.
- 💾 **Persistent SQLite Volume**: Lists and items survive container updates and restarts (`/app/data/shopping.db`).
- ⚡ **Real-Time Device Sync**: Server-Sent Events (SSE) instantly update all connected family phones and tablets.
- 📱 **Mobile First & PWA Support**: Glassmorphic dark/light UI designed for mobile shopping at the store.
- 📌 **Categorized Lists & Quick Staples**: Organize items by aisle/category, track estimated prices, and quick-add frequent staples.
- 📤 **Share & Export**: One-tap copy to WhatsApp, iMessage, Markdown, or JSON export.

---

## 🚀 Portainer Deployment Guide

### Option A: Using Portainer Web UI (Recommended)

1. Open **Portainer** (`http://<your-server-ip>:9000`).
2. Go to **Stacks** ➔ **Add stack**.
3. Name your stack: `shoplist`.
4. Choose **Web editor** or **Repository**.
5. Paste the following `docker-compose.yml` content:

```yaml
version: '3.8'

services:
  shoplist:
    build:
      context: https://github.com/your-user/shoplist.git # or use local repository build
    image: shoplist:latest
    container_name: shoplist
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
    volumes:
      - shoplist_data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  shoplist_data:
    driver: local
    name: shoplist_data
```

6. Click **Deploy the stack**.
7. Access your Shopping List at `http://<your-server-ip>:3000`!

---

## 💻 Local Docker & CLI Deployment

### Run with Docker Compose
```bash
# Clone or navigate to shoplist directory
cd /Users/radeesh/projects/shoplist

# Build and start container in detached mode
docker-compose up -d --build
```

### Run Node Server Locally (Without Docker)
```bash
# Install dependencies
npm install

# Start server
npm start
```
Server will be available at `http://localhost:3000`.

---

## 🛠️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port on which Express server listens |
| `DATABASE_DIR` | `/app/data` | Directory path where SQLite DB file resides |
| `DATABASE_PATH` | `/app/data/shopping.db` | Absolute path to SQLite DB file |

---

## 📂 Project Structure

```
.
├── Dockerfile              # Multi-stage production container build
├── docker-compose.yml      # Portainer stack configuration
├── server.js               # Express REST API & SSE Real-time broadcaster
├── db.js                   # SQLite database initialization & migrations
├── public/                 # Web app assets (HTML, CSS, JS, PWA manifest)
└── README.md
```
