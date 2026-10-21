# TCC Learning Management System

React and Laravel rebuild based on the original site in `legacy-reference/`. The original Firebase source and school images remain there for reference. Firebase browser-side Gemini credentials were removed from the copied reference; keep provider keys on the Laravel server.

## What's working

- React responsive landing, sign-in, Student, Teacher, Secretary, and Dean dashboards.
- Laravel token authentication and role-based access control for Student, Teacher, Secretary, and Dean APIs.
- College Block system (`Block - 1A`–`1E` for 1st Year, `Block - 2A`–`2E` for 2nd Year, `Block - 3A`–`3E` for 3rd Year, and `Block - 4A`–`4E` for 4th Year).
- Full BSIT curriculum (43 official Subject Codes & Descriptions from `PATH FIT 1`–`4`, `GEC`, `GEE`, `Math`, `NSTP`, and `IT 101`–`122` / `IT Elec 1`–`2`).
- Teacher quiz creation, manual question authoring, AI question generation, and block-level publishing.
- Students can take published quizzes and receive skill-based review suggestions.
- Quiz answer keys stay on the server. Scoring happens in Laravel and the database prevents a student from submitting the same quiz twice.

## Default TCC Role Accounts

Seed the database using `php artisan migrate --seed`. Default initial role accounts share this password:

```text
TccPortal!2026
```

| Role | Email Login | Student ID Login | Default Block |
| --- | --- | --- | --- |
| Student | `student@tcc.edu.ph` | `20273710` | `Block - 1A` (1st Year) |
| Teacher | `teacher@tcc.edu.ph` | - | - |
| Secretary | `secretary@tcc.edu.ph` | - | - |
| Dean | `dean@tcc.edu.ph` | - | - |

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

Open the Vite URL shown in the first terminal, usually `http://localhost:5173`. The API runs at `http://localhost:8000`.

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


## Project folders

- `frontend/` - React, TypeScript, Vite, and school image assets.
- `backend/` - Laravel API, authentication, migrations, demo seeder, and AI integration.
- `render.yaml` - Render API and database blueprint.
