@echo off
setlocal
title UpSight - build the Android app
cd /d "%~dp0"
echo.
echo   ==== UpSight: building the Android app ====
echo   (the first build downloads tools and can take 5-10 minutes)
echo.

rem --- 1. Java 21 for the build tools ---------------------------------------------------
rem Android Studio's own Java can be too new for the build tools (Rabbit 2 ships Java 25),
rem so UpSight keeps its own copy of Java 21 in %LOCALAPPDATA%\SkyWatch\jdk-21 (downloaded once).
set "SWJDK=%LOCALAPPDATA%\SkyWatch\jdk-21"
set "ASJBR=%ProgramFiles%\Android\Android Studio\jbr"
if exist "%SWJDK%\bin\java.exe" goto havejdk
findstr /c:"JAVA_VERSION=\"21" "%ASJBR%\release" >nul 2>&1
if not errorlevel 1 ( set "JAVA_HOME=%ASJBR%" & goto javaok )
echo   Downloading Java 21 for building (one time, about 190 MB)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $z=Join-Path $env:TEMP 'skywatch-jdk21.zip'; Invoke-WebRequest 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $z; $t=Join-Path $env:LOCALAPPDATA 'SkyWatch\jdk-tmp'; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive $z $t -Force; Move-Item (Get-ChildItem $t | Select-Object -First 1).FullName (Join-Path $env:LOCALAPPDATA 'SkyWatch\jdk-21'); Remove-Item $t -Recurse -Force; Remove-Item $z"
if not exist "%SWJDK%\bin\java.exe" (
  echo   Could not download Java 21. Check the internet connection and try again.
  goto fail
)
:havejdk
set "JAVA_HOME=%SWJDK%"
:javaok
echo   Using Java at %JAVA_HOME%

rem --- 2. Android SDK (downloaded by Android Studio the first time it runs) ---------------
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
  echo   The Android SDK is missing at:
  echo     %ANDROID_HOME%
  echo   Open Android Studio once and finish its Setup Wizard ^(Standard^), then try again.
  goto fail
)
> "android-app\android\local.properties" echo sdk.dir=%ANDROID_HOME:\=\\%

rem --- 3. Copy the latest UpSight files into the Android project ------------------------
echo   Copying the app files...
set "PUB=android-app\android\app\src\main\assets\public"
for %%D in (css js lib data icons) do robocopy "%%D" "%PUB%\%%D" /MIR /NFL /NDL /NJH /NJS /NP >nul
copy /y index.html "%PUB%\" >nul
copy /y manifest.webmanifest "%PUB%\" >nul

rem --- 4. Build -------------------------------------------------------------------------
echo   Building...
pushd android-app\android
call gradlew.bat --stop >nul 2>&1
call gradlew.bat assembleDebug
if errorlevel 1 ( popd & goto fail )
popd
copy /y "android-app\android\app\build\outputs\apk\debug\app-debug.apk" "android-app\UpSight.apk" >nul
echo.
echo   DONE!  Your app:  %~dp0android-app\UpSight.apk
echo   Copy it to your phone and tap it to install.
explorer /select,"%~dp0android-app\UpSight.apk"
pause
exit /b 0

:fail
echo.
echo   Something went wrong. Copy the text above and send it to Claude.
pause
exit /b 1
