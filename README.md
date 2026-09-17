# UWORK — Business Intelligence & Forecasting Platform

**Enterprise SaaS Platform for Data Cleaning, Metric Intelligence, Multi-Model Time-Series Forecasting, and Decision Centers.**

---

## 1. Product Overview

**UWORK** transforms complex, fragmented enterprise datasets into high-confidence business intelligence. Beyond conventional dashboards that merely plot raw numbers, UWORK implements the pipeline:

$$\text{DATA} \longrightarrow \text{CLEANING} \longrightarrow \text{VALIDATION} \longrightarrow \text{ANALYSIS} \longrightarrow \text{INTELLIGENCE} \longrightarrow \text{FORECAST} \longrightarrow \text{ACTION}$$

It answers five foundational executive questions:
1. **What happened?** (Descriptive KPIs, MoM growth, dimensional attribution)
2. **Why did it happen?** (Driver analysis, segment variance, outlier identification)
3. **What is happening now?** (UWORK Business Health Score, statistical anomaly detection)
4. **What is likely to happen next?** (Multi-model time-series forecasting with empirical 95% confidence intervals)
5. **What should the business do about it?** (Prioritized Decision Center action items linked directly to data evidence)

---

## 2. Core Architecture & Tech Stack

- **Frontend**: Next.js 15 (App Router, React 19, TypeScript), Tailwind CSS, Lucide icons, Recharts for responsive time-series visualization.
- **Backend API**: Modular TypeScript services (`Controller -> Service -> Repository -> Model`) with Zod request/response validation.
- **Database**: PostgreSQL 16 / SQLite with Prisma ORM, multi-tenant row-level scoping, composite indexes, and transactional job queues.
- **Forecasting Engine**:
  - Holt-Winters Triple Exponential Smoothing (Level, Trend, Additive Seasonality)
  - Autoregressive Integrated Lags (ARIMA-style)
  - Ordinary Least Squares Linear Trend Drift
  - Ensembled Multi-Model Hybrid
  - Temporal walk-forward out-of-time backtesting (zero future data leakage)
  - Loss metrics: sMAPE, MAE, RMSE, R²
- **Data Hub**: CSV/XLSX streaming parser, automated data profiling, semantic role inference (Revenue, Cost, Units, Customer, Product, Region, Date), Data Quality Scoring (0-100), and non-destructive cleaning transforms.
- **Security**:
  - Spreadsheet formula injection protection (neutralizing `=`, `+`, `-`, `@`, `\t`, `\r`)
  - Sliding-window rate limiting on sensitive routes
  - Argon2id / Bcrypt password hashing with complexity enforcement
  - Secure HttpOnly SameSite session cookies and account lockout protection
  - Strict tenant isolation guarantees scoped by `organizationId`

---

## 3. Quick Start & Local Run

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm or pnpm

### Setup Instructions
1. Install dependencies:
   ```bash
   npm install
   ```
2. Initialize database and run migrations:
   ```bash
   npx prisma db push
   ```
3. Seed demo organization, metrics, forecasts, and users:
   ```bash
   node scripts/seed.js
   ```
4. Start development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Credentials
- **Owner**: `admin@apex.com` / `Password123!`
- **Analyst**: `analyst@apex.com` / `Password123!`
- **Viewer**: `viewer@apex.com` / `Password123!`
