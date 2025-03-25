#!/bin/bash
set -e  # Exit on error

echo "┌─────────────────────────────────────────────┐"
echo "│   ShellPer App Debugger                     │"
echo "└─────────────────────────────────────────────┘"

# Check if ShellPer is installed
if [ ! -d "/Applications/ShellPer.app" ]; then
    echo "⚠️ ShellPer app not found in Applications folder"
    echo "▶ Please install ShellPer first"
    exit 1
fi

# Kill any running instances
echo "▶ Killing any running instances of ShellPer..."
killall ShellPer 2>/dev/null || true

# Reset app data
echo "▶ Resetting application data..."
APP_DATA_DIR="$HOME/Library/Application Support/ShellPer"
ELECTRON_DATA_DIR="$HOME/Library/Application Support/Electron"

# Remove ShellPer data
if [ -d "$APP_DATA_DIR" ]; then
    rm -rf "$APP_DATA_DIR"
    echo "✅ ShellPer data reset"
fi

# Remove Electron data
if [ -d "$ELECTRON_DATA_DIR" ]; then
    rm -rf "$ELECTRON_DATA_DIR"
    echo "✅ Electron data reset"
fi

# Fix application permissions
echo "▶ Fixing application permissions..."
sudo chmod -R 755 "/Applications/ShellPer.app"
xattr -cr "/Applications/ShellPer.app"
echo "✅ Permissions fixed"

# Create necessary configuration
echo "▶ Creating configuration files..."
RESOURCES_DIR="/Applications/ShellPer.app/Contents/Resources"
ENV_CONTENT="NO_EXTERNAL_SERVICES=true
NO_AUTH=true
OFFLINE_ONLY=true"

sudo mkdir -p "$RESOURCES_DIR"
echo "$ENV_CONTENT" | sudo tee "$RESOURCES_DIR/.env" > /dev/null
echo "$ENV_CONTENT" | sudo tee "$RESOURCES_DIR/app/.env" > /dev/null 2>&1
echo "✅ Configuration created"

# Run the application with debugging
echo "▶ Running ShellPer with debugging enabled..."
echo "▶ Watch this terminal for error output"
echo "▶ Press Ctrl+C to stop"
ELECTRON_ENABLE_LOGGING=1 DEBUG=electron-builder /Applications/ShellPer.app/Contents/MacOS/ShellPer 