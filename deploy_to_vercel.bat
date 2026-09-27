@echo off
title Deploy Shama Abidi PhD AI System to Vercel (Free Hosting)
echo ============================================================================
echo   Shama Abidi — International Funded PhD AI Research & Application System
echo   One-Click Vercel Free Hosting Deployment
echo ============================================================================
echo.
echo Step 1: Checking / Logging in to your Vercel account...
echo (If prompted, press Enter to open your browser and confirm Vercel login)
echo.
call npx --yes vercel --prod
echo.
echo ============================================================================
echo   Deployment Process Complete! Copy your live https://...vercel.app URL above.
echo ============================================================================
pause
