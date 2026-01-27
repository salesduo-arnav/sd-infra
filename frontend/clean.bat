@echo off
echo ==============================
echo Cleaning project artifacts...
echo ==============================

:: Node / JS
if exist node_modules (
  echo Deleting node_modules
  rmdir /s /q node_modules
)

if exist package-lock.json (
  echo Keeping package-lock.json
)

:: Build outputs (common)
for %%d in (dist build out .next .nuxt coverage) do (
  if exist %%d (
    echo Deleting %%d
    rmdir /s /q %%d
  )
)

:: Playwright
for %%d in (test-results playwright-report blob-report) do (
  if exist %%d (
    echo Deleting %%d
    rmdir /s /q %%d
  )
)

:: Caches
for %%d in (.cache .turbo .eslintcache) do (
  if exist %%d (
    echo Deleting %%d
    rmdir /s /q %%d
  )
)

:: Logs
del /q *.log 2>nul

echo ==============================
echo Cleanup complete
echo ==============================
pause
