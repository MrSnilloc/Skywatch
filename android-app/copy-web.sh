#!/bin/sh
# copies the web app (folder above) into www/ for Capacitor
rm -rf www && mkdir -p www
cd .. && cp -r index.html manifest.webmanifest css js lib data icons android-app/www/
