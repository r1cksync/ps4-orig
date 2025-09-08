# IntelliHack Backend Test Runner (PowerShell)
# This script runs comprehensive tests for the Discord-like chat backend

Write-Host "🚀 IntelliHack Backend Test Runner" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js to run the tests." -ForegroundColor Red
    exit 1
}

# Check if backend is running
Write-Host "🔍 Checking if backend is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is running" -ForegroundColor Green
    } else {
        throw "Backend returned status: $($response.StatusCode)"
    }
} catch {
    Write-Host "❌ Backend is not running. Please start the backend server first:" -ForegroundColor Red
    Write-Host "   cd backend" -ForegroundColor Yellow
    Write-Host "   npm run dev" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🧪 Running API Tests..." -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

# Run the simple test script
try {
    node test-simple.js
} catch {
    Write-Host "❌ Test execution failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🏁 Tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Manual Testing URLs:" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host "Health Check:     http://localhost:5000/health" -ForegroundColor White
Write-Host "API Root:         http://localhost:5000/" -ForegroundColor White
Write-Host "Register User:    POST http://localhost:5000/api/auth/register" -ForegroundColor White
Write-Host "Login User:       POST http://localhost:5000/api/auth/login" -ForegroundColor White
Write-Host "Create Server:    POST http://localhost:5000/api/servers" -ForegroundColor White
Write-Host "Get Servers:      GET http://localhost:5000/api/servers" -ForegroundColor White
Write-Host ""
Write-Host "📡 WebSocket Test:" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host "Connect to: ws://localhost:5000" -ForegroundColor White
Write-Host "Auth required: Pass JWT token in auth.token" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Debugging:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Host "Check server logs for detailed error information" -ForegroundColor White
Write-Host "Server should be running on port 5000" -ForegroundColor White
Write-Host "MongoDB should be connected and accessible" -ForegroundColor White
