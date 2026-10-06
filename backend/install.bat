@echo off
REM Install npm dependencies for iLAB Guiguinto backend

cd /d "%~dp0"

echo.
echo ============================================
echo  iLAB Guiguinto Backend - Install Script
echo ============================================
echo.

if not exist "package.json" (
    echo ERROR: package.json not found. Please run this script from the backend directory.
    pause
    exit /b 1
)

echo Installing npm dependencies...
echo.

npm install --legacy-peer-deps

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo SUCCESS! Dependencies installed.
    echo ============================================
    echo.
    echo Next steps:
    echo 1. Create .env file: copy .env.example .env
    echo 2. Update DATABASE_URL and JWT_SECRET in .env
    echo 3. Run migrations: npm run migrate
    echo 4. Start development server: npm run dev
    echo.
) else (
    echo.
    echo ERROR: npm install failed. Please check your Node.js installation.
    echo.
)

pause
