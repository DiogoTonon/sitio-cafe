@echo off
cd /d C:\Projetos\sitio-cafe
if not exist dist call npm run build
start "Sistema do Sitio (nao feche)" /min cmd /k "npm run preview -- --port 4173 --strictPort"
timeout /t 6 >nul
start "" http://localhost:4173