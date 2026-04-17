@echo off
:: ─── Garmin Auth Proxy - Inicio ────────────────────────────────────────────
:: Editá GARMIN_PROXY_API_KEY con una clave secreta cualquiera (inventala vos).
:: La misma clave hay que ponerla en las variables de entorno de Vercel.

set GARMIN_PROXY_API_KEY=CAMBIA_ESTO_POR_UNA_CLAVE_SECRETA
set PORT=80

echo.
echo  Garmin Auth Proxy
echo  Puerto: %PORT%
echo  API Key: %GARMIN_PROXY_API_KEY:~0,8%...
echo.
echo  Deja esta ventana abierta.
echo  Para detener el proxy, cerra esta ventana.
echo.

node "%~dp0server.mjs"
pause
