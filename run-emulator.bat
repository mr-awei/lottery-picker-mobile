@echo off
cd /d E:\lottery-picker-mobile

echo [1/5] Waiting for emulator...
adb wait-for-device
echo Device connected.

echo [2/5] Waiting for boot complete...
:wait_boot
for /f "delims=" %%a in ('adb shell getprop sys.boot_completed 2^>nul') do set BOOT=%%a
if not "%BOOT%"=="1" (
    timeout /t 3 /nobreak >nul
    goto wait_boot
)
echo Boot complete.

echo [3/5] Building web assets...
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)
echo Build success.

echo [4/5] Sync to Android...
call npx cap sync android
cd /d E:\lottery-picker-mobile\android

echo [5/5] Uninstall old + install + launch...
adb uninstall com.lottery.picker >nul 2>&1
call gradlew.bat installDebug --no-daemon
if errorlevel 1 (
    echo INSTALL FAILED
    pause
    exit /b 1
)
adb shell am start -n com.lottery.picker/.MainActivity

echo.
echo DONE! App launched in emulator.
echo Keep this logcat window open to see errors.
pause