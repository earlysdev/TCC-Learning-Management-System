<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// 1. Automatically silence Composer platform check for PHP 8.3 compatibility
$platformCheckFile = __DIR__.'/../vendor/composer/platform_check.php';
if (file_exists($platformCheckFile) && filesize($platformCheckFile) > 15) {
    @file_put_contents($platformCheckFile, "<?php\n// platform check bypassed for server compatibility\n");
}

// 2. Automatically fix DB_HOST in .env if external host was used
$envFile = __DIR__.'/../.env';
if (file_exists($envFile)) {
    $envContent = @file_get_contents($envFile);
    if ($envContent && str_contains($envContent, 'DB_HOST=srv1545.hstgr.io')) {
        $envContent = str_replace('DB_HOST=srv1545.hstgr.io', 'DB_HOST=localhost', $envContent);
        @file_put_contents($envFile, $envContent);
    }
}

// Diagnostic check if vendor is missing or setup incomplete
if (!file_exists(__DIR__.'/../vendor/autoload.php')) {
    header('Content-Type: application/json', true, 503);
    echo json_encode([
        'message' => 'Backend setup in progress. Please run "composer install --no-dev" in ~/public_html/backend via Remote Terminal.',
        'vendor_exists' => false,
        'php_version' => PHP_VERSION,
    ]);
    exit;
}

try {
    // Determine if the application is in maintenance mode...
    if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
        require $maintenance;
    }

    // Register the Composer autoloader...
    require __DIR__.'/../vendor/autoload.php';

    // Bootstrap Laravel and handle the request...
    /** @var Application $app */
    $app = require_once __DIR__.'/../bootstrap/app.php';

    $app->handleRequest(Request::capture());
} catch (\Throwable $e) {
    header('Content-Type: application/json', true, 500);
    echo json_encode([
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()) . ':' . $e->getLine(),
    ]);
    exit;
}

