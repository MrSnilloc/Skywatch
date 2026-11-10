#!/bin/sh
# (Claude's side) refresh the Android project after web changes: copy web files, sync Capacitor,
# then keep the Capacitor library and plugins as plain folders next to the project so the PC needs no Node.js.
set -e
cd "$(dirname "$0")"
sh copy-web.sh
npx cap sync android >/dev/null
rm -rf capacitor-android && cp -r node_modules/@capacitor/android/capacitor capacitor-android
rm -rf plugins && mkdir -p plugins
cp -r node_modules/@capacitor/local-notifications/android plugins/local-notifications
sed -i "s#new File('../node_modules/@capacitor/android/capacitor')#new File('../capacitor-android')#" android/capacitor.settings.gradle
sed -i "s#new File('../node_modules/@capacitor/local-notifications/android')#new File('../plugins/local-notifications')#" android/capacitor.settings.gradle
echo synced
