# 🏛️ Tagoloan Community College (TCC) — Web-Based Learning Management System

A full-stack **Web-Based Learning Management System (LMS)** built for **Tagoloan Community College (TCC)** using **React 19 + TypeScript + Vite** on the frontend and **Laravel 12 + Sanctum** on the backend.

---

## ✨ Key System Features & Modules

### 1. 🔐 User Access & Identity Control
- **Dual-Identifier Authentication:** Students and staff can sign in using either their institutional **Email Address** or **8-digit Student ID** (e.g., `20273710`) with Laravel Sanctum bearer token authentication.
- **Interactive Security Verification:** Built-in 6-character alphanumeric CAPTCHA verification and password visibility toggle on the glassmorphic sign-in card.
- **Client-Side Idle Session Watchdog:** Automatically detects user inactivity on student sessions, displays a 60-second countdown modal, dismisses immediately on mouse movement/hover or key press, and auto-signs out when the timer reaches `0:00`.
- **Role-Based Access Control (RBAC):** Dedicated route guards and backend middleware (`EnsureRole`) separating **Student**, **Teacher**, **Secretary (Registrar)**, and **College Dean** portals.
- **Self-Service Profile Management:** Every role can update their Full Name, Email Address, and Password from their dashboard **Settings** tab.

### 2. 🎓 Academic Structure & BSIT Curriculum Management
- **Year-Level College Blocks:** Supports 20 official College Blocks automatically mapped by Year Level:
  - **1st Year:** `Block - 1A`, `Block - 1B`, `Block - 1C`, `Block - 1D`, `Block - 1E`
  - **2nd Year:** `Block - 2A`, `Block - 2B`, `Block - 2C`, `Block - 2D`, `Block - 2E`
  - **3rd Year:** `Block - 3A`, `Block - 3B`, `Block - 3C`, `Block - 3D`, `Block - 3E`
  - **4th Year:** `Block - 4A`, `Block - 4B`, `Block - 4C`, `Block - 4D`, `Block - 4E`
- **43 Official BSIT Courses:** Pre-seeded with all 43 Bachelor of Science in Information Technology (BSIT) subject codes and descriptions (`PATH FIT 1–4`, `GEC 1–9`, `GEE 1–4`, `Math 1–3`, `NSTP 1–2`, `IT 101–122`, and `IT Elec 1–2`).
- **Registrar Enrollment & Roster Binding:** The Secretary can enroll students into specific Year Levels and Blocks and manage account activation status.

### 3. 📝 Manual Quiz Authoring & Targeted Publishing Engine
- **Manual Quiz Builder:** Teachers create custom assessments by selecting a BSIT course, specifying a topic/unit, and authoring multiple-choice questions and answer keys in the **Interactive Quiz Editor Modal**.
- **Per-Question Point Customization:** Assign custom point weights (`1–100 pts`) per question with real-time total points calculation and direct question reordering (**Move to Top / Bottom / Up / Down**).
- **Local Draft Persistence:** Unsaved question edits are automatically persisted in browser `localStorage` (`Local Draft Auto-Saved`) to prevent accidental data loss.
- **Targeted Quiz Publishing Modal:** Publish quizzes to **All Enrolled Students**, **Selected Blocks (`Block - 1A` to `4E`)**, or **Individual Students**, configure the **Time Limit (Minutes)**, and enable **Shuffle Questions** (available whenever a quiz has **3 or more questions**).

### 4. 🛡️ Proctored Examination Runtime & Anti-Cheat Subsystem
- **Full-Screen Assessment Workspace:** Dedicated examination interface (`/student/quizzes/:quizId/take`) with progress tracking and **Scroll to Bottom / Scroll to Top** quick navigation.
- **Synchronized Countdown Timer & Auto-Submit:** Live `MM:SS` countdown pill that automatically submits the student's selected answers when time expires.
- **Pitch-Black Anti-Cheat Blackout Shield:** Immediately blacks out the entire screen (`#000000`) and logs a real-time proctoring violation whenever `Alt+Tab`, window focus blur, `PrintScreen` / Snipping Tool, right-click context menu, copy/cut, or `F12` Developer Tools shortcuts are detected.
- **Single-Attempt Submission Lock & Server-Side Grading:** Answer keys never leave the Laravel server. Submissions are graded server-side and locked against duplicate attempts (`409 Conflict`) unless reset by the Teacher.

### 5. 📊 Academic Performance Analytics & AI Study Recommendations
- **Student & Cohort Analytics:** Students track their overall average, personal best, and per-subject score bars; Teachers inspect class averages, student submissions, proctoring violation logs, and retake controls.
- **Personalized AI Study Plans & Curated References:** After submitting a quiz, `LmsAiService` analyzes missed question competencies (via **Google Gemini API** with deterministic curriculum fallback) to generate **Focus Topics**, **Action Steps**, and clickable **Study Reference Links** (MDN Web Docs, W3Schools, GeeksforGeeks, OpenStax, and Google Scholar).

### 6. 🔔 Administrative Audit, Security Logs & College Dean Portal
- **Real-Time Topbar Notification Bell:** Delivers quiz publication alerts and campus announcements with unread badges and one-click mark-all-read.
- **Activity & Security Audit Trails:** Tracks user logins, account creations, profile changes, failed authentication attempts, and exam proctoring violations for the **College Dean** and **Secretary**.

---

## 🔑 Default Institutional Role Accounts

After running `php artisan migrate:fresh --seed`, sign in at `http://localhost:5173/login` using the shared password:

```text
TccPortal!2026
```

| Role | Email Address | Student ID Login | Assigned Block | Portal Route |
| :--- | :--- | :--- | :--- | :--- |
| **Student** | `student@tcc.edu.ph` | `20273710` | `Block - 1A` (1st Year) | `/student/dashboard` |
| **Teacher** | `teacher@tcc.edu.ph` | — | BSIT Faculty | `/teacher/dashboard` |
| **Secretary** | `secretary@tcc.edu.ph` | — | Registrar's Office | `/secretary/dashboard` |
| **College Dean** | `dean@tcc.edu.ph` | — | Office of the Dean | `/dean/dashboard` |

---

## 🚀 Local Installation & Setup Guide

### Prerequisites
- **Node.js** `20.19+` or `22.12+` (with `npm`)
- **PHP** `8.2+` or `8.3+` (with `pdo_sqlite`, `sqlite3`, `fileinfo`, `mbstring`, and `openssl` extensions enabled)
- **Composer** `2.x`

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/earlysdev/TCC-Learning-Management-System.git
cd TCC-Learning-Management-System
```

---

### Step 2: Configure & Start the Backend (Laravel API)

Open a terminal in the project root and run:

```powershell
cd backend

# 1. Install PHP dependencies
composer install

# 2. Create the environment file and generate an application key
if (!(Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate

# 3. Create the SQLite database file (if it does not exist)
if (!(Test-Path database/database.sqlite)) { New-Item -ItemType File database/database.sqlite | Out-Null }

# 4. Run database migrations and seed the default TCC accounts, 20 Blocks, and 43 BSIT subjects
php artisan migrate:fresh --seed

# 5. Start the Laravel API server at http://127.0.0.1:8000
php artisan serve --host=127.0.0.1 --port=8000
```

> **Windows PHP SQLite Note:** If your local `php.ini` does not have `pdo_sqlite` enabled by default, run Artisan commands with `-d extension=pdo_sqlite`:
> ```powershell
> php -d extension=pdo_sqlite artisan migrate:fresh --seed
> php -d extension=pdo_sqlite artisan serve --host=127.0.0.1 --port=8000
> ```

---

### Step 3: Configure & Start the Frontend (React + Vite)

Open a **second terminal** in the project root and run:

```powershell
cd frontend

# 1. Install Node.js packages
npm install

# 2. Start the Vite development server at http://127.0.0.1:5173
npm run dev
```

Now open **`http://localhost:5173`** in your browser.

---

## 🤖 Optional: Enable Live Google Gemini AI Study Recommendations

By default, the system includes a deterministic BSIT curriculum recommendation engine that works offline out of the box. To enable live **Google Gemini AI** study recommendations for students, add your server-side API key to `backend/.env`:

```dotenv
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Restart the Laravel backend server after updating `backend/.env`.

---

## 🧪 Running Automated Tests & Production Build

### Backend Automated Feature Tests (PHPUnit)
```powershell
cd backend
php artisan test
```

### Frontend Type-Check & Production Bundle
```powershell
cd frontend
npm run build
```

---

## 📂 Project Structure

```text
TCC-Learning-Management-System/
├── backend/                  # Laravel 12 REST API & Sanctum Authentication
│   ├── app/
│   │   ├── Http/Controllers/ # Auth, Quiz, User, Subject, Section, Analytics, Audit & Security Controllers
│   │   ├── Http/Middleware/  # EnsureRole RBAC middleware
│   │   ├── Models/           # User, Quiz, QuizAttempt, Subject, Section, ActivityLog, SecurityLog
│   │   └── Services/         # LmsAiService (Student study diagnostics & curated references)
│   ├── database/
│   │   ├── migrations/       # Database schema definitions
│   │   └── seeders/          # DemoSeeder (TCC roles, 20 College Blocks, 43 BSIT courses)
│   └── routes/api.php        # Protected & public REST API routes
├── frontend/                 # React 19 + TypeScript + Vite SPA
│   ├── public/images/        # Official TCC seal & institutional campus photography
│   └── src/
│       ├── components/       # GlassCard, Modal, Topbar, Sidebar, DashboardLayout, ProfileUpdateCard
│       ├── hooks/            # useIdleTimeout (client-side inactivity watchdog)
│       ├── lib/              # BSIT constants, TypeScript interfaces, and utilities
│       └── pages/            # LandingPage, LoginPage, Student, Teacher, Secretary, and Dean portals
└── render.yaml               # Cloud deployment blueprint for Render + PostgreSQL
```
