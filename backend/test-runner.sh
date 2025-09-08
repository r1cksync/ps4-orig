#!/bin/bash

# IntelliHack Backend Test Runner
# This script runs comprehensive tests for the Discord-like chat backend

echo "🚀 IntelliHack Backend Test Runner"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js to run the tests."
    exit 1
fi

# Check if backend is running
echo "🔍 Checking if backend is running..."
if curl -s http://localhost:5000/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running. Please start the backend server first:"
    echo "   cd backend && npm run dev"
    exit 1
fi

echo ""
echo "🧪 Running API Tests..."
echo "======================"

# Run the simple test script
node test-simple.js

echo ""
echo "🏁 Tests completed!"
echo ""
echo "📋 Manual Testing URLs:"
echo "======================"
echo "Health Check:     http://localhost:5000/health"
echo "API Root:         http://localhost:5000/"
echo "Register User:    POST http://localhost:5000/api/auth/register"
echo "Login User:       POST http://localhost:5000/api/auth/login"
echo "Create Server:    POST http://localhost:5000/api/servers"
echo "Get Servers:      GET http://localhost:5000/api/servers"
echo ""
echo "📡 WebSocket Test:"
echo "=================="
echo "Connect to: ws://localhost:5000"
echo "Auth required: Pass JWT token in auth.token"
echo ""
echo "🔧 Debugging:"
echo "============="
echo "Check server logs for detailed error information"
echo "Server should be running on port 5000"
echo "MongoDB should be connected and accessible"
