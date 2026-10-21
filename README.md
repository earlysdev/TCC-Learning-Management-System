# TCC Learning Management System

## What's cooking

- React responsive landing, sign-in, teacher dashboard, and student quiz interface.
- Laravel token authentication and role checks for teacher and student quiz APIs.
- Teacher quiz list and dashboard metrics, including submissions and average scores.
- Quiz drafts generated with Gemini when `GEMINI_API_KEY` is configured. Without a key, the demo generator supports Ecosystems, Photosynthesis, Fractions, Water Cycle, and Context Clues.
- Students can take published quizzes and receive skill based review suggestions.
- Quiz answer keys stay on the server. Scoring happens in Laravel and the database prevents a student submitting the same quiz twice.
- Local demo accounts and an already published Ecosystems quiz.

## Demo sign-ins

Seed the local database using the steps below. All demo accounts share this password:

```text
LnhsDemo!2026
```

| Role | Login | Alternative |
| --- | --- | --- |
| Student | `student.demo@TCC.test` | LRN `123456789012` |
| Teacher | `teacher.demo@TCC.test` | - |
| Secretary | `secretary.demo@TCC.test` | - |
| Dean | `dean.demo@TCC.test` | - |

The teacher and student accounts have the working quiz experiences. Secretary and principal currently open the protected interface preview. Demo accounts are seeded only in local/testing environments and should not be added to production.

## Run locally on Windows

Requirements: Node.js 20.19+ or 22.12+, PHP 8.3+, Composer. The default local database is SQLite. Enable PHP's `fileinfo`, `zip`, `pdo_sqlite`, and `sqlite3` extensions. On this development machine, a per-user extension configuration is at `%LOCALAPPDATA%\TCC-LMS\php-conf.d`. Set it in each terminal before running Composer or Artisan if the PHP extension errors return:

```powershell
$env:PHP_INI_SCAN_DIR = Join-Path $env:LOCALAPPDATA 'TCC-LMS\php-conf.d'
```

The `ext-fileinfo` Composer error means the CLI PHP configuration is missing the extension. The SQLite `could not find driver` error means `pdo_sqlite` is not enabled. `--ignore-platform-req` only hides the first error and does not fix the database driver.

In one terminal:

```powershell
cd frontend
npm install
npm run dev
```

In a second terminal:

```powershell
cd backend
composer install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
if (!(Test-Path database/database.sqlite)) { New-Item -ItemType File database/database.sqlite | Out-Null }
php artisan migrate --seed
php artisan serve
```

Open the Vite URL shown in the first terminal, usually `http://localhost:5173`. The API runs at `http://localhost:8000`. The sign-in screen has a **Try a demo account** panel while running in development; choose a role to fill in its login and password.

To enable live AI, put a Gemini key in `backend/.env`:

```dotenv
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Restart Laravel after changing the environment file. The key is used only by Laravel and is never included in the React build. With no key, supported topics use local demo question sets and the recommendation engine uses missed question skills.

## Cheap cloud deployment

The included `render.yaml` describes a Laravel API on Render with PostgreSQL. Deploy it from a Git repository as a Render Blueprint. The React app can be deployed separately as a free Cloudflare Pages site.

For Cloudflare Pages, set the project root to `frontend`, the build command to `npm run build`, and the build output directory to `dist`. Set `VITE_API_BASE_URL` to the deployed API URL plus `/api`, for example `https://your-api.onrender.com/api`. After Cloudflare creates the site URL, set these Render API environment values to the Cloudflare site origin (no trailing slash):

```dotenv
FRONTEND_URL=https://your-site.pages.dev
FRONTEND_ALLOWED_ORIGINS=https://your-site.pages.dev
```

During Render Blueprint setup, provide a Laravel application key as `APP_KEY`. Generate one locally with `php artisan key:generate --show`. Set `GEMINI_API_KEY` in Render's secret environment settings if live AI is wanted. Add a mail provider before relying on account reset emails; the current default writes email to Laravel logs.

Current Render pricing is about **$7/month** for the 512 MB web service plus **$6/month** for the smallest paid PostgreSQL compute plan; Cloudflare Pages is free. Allow for database storage, taxes, and usage. Render's free PostgreSQL plan is temporary, so use the paid plan for persistent school data. Review current provider prices before deployment.

## Project folders

- `frontend/` - React, TypeScript, Vite, and school image assets.
- `backend/` - Laravel API, authentication, migrations, demo seeder, and AI integration.
- `legacy-reference/` - original Firebase application and migration reference.
- `render.yaml` - Render API and database blueprint.
