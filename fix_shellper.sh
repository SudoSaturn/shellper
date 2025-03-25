#!/bin/bash
cd "$(dirname "$0")"
echo "┌─────────────────────────────────────────────┐"
echo "│   ShellPer Fix Tool for macOS               │"
echo "└─────────────────────────────────────────────┘"

# Function to fix application issues
fix_application() {
    echo "▶ Checking for installed app..."
    
    # Check if app is installed
    if [ -d "/Applications/ShellPer.app" ]; then
        echo "✅ ShellPer app found in Applications folder"
        
        # Fix permissions
        echo "▶ Fixing app permissions..."
        sudo chmod -R 755 "/Applications/ShellPer.app"
        xattr -cr "/Applications/ShellPer.app"
        echo "✅ App permissions fixed"
        
        # Create .env file in app bundle
        echo "▶ Creating required configuration files..."
        RESOURCES_DIR="/Applications/ShellPer.app/Contents/Resources"
        ENV_CONTENT="NO_EXTERNAL_SERVICES=true
NO_AUTH=true
OFFLINE_ONLY=true"

        sudo mkdir -p "$RESOURCES_DIR"
        echo "$ENV_CONTENT" | sudo tee "$RESOURCES_DIR/.env" > /dev/null
        echo "$ENV_CONTENT" | sudo tee "$RESOURCES_DIR/app/.env" > /dev/null 2>&1
        
        # Add window visibility workaround
        echo "▶ Adding window visibility workaround..."
        PLIST_PATH="/Applications/ShellPer.app/Contents/Info.plist"
        sudo /usr/libexec/PlistBuddy -c "Add :NSHighResolutionCapable bool true" "$PLIST_PATH" 2>/dev/null || true
        sudo /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST_PATH" 2>/dev/null || sudo /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST_PATH" 2>/dev/null || true
        echo "✅ Added window visibility settings"
        
        # Reset Ollama prompt settings
        echo "▶ Resetting Ollama prompt settings..."
        APP_DATA_DIR="$HOME/Library/Application Support/ShellPer"
        SETTINGS_FILE="$APP_DATA_DIR/shellper-settings.json"
        if [ -f "$SETTINGS_FILE" ]; then
            # Update JSON file to reset Ollama prompt flags
            # Try to use jq if available, otherwise use simpler approach
            if command -v jq &> /dev/null; then
                # Create a temporary file with updated content
                jq '.ollama.promptShown = false | .ollama.modelPromptShown = false' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
                mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
            else
                # Simple string replacement approach
                sed -i '' 's/"promptShown":true/"promptShown":false/g' "$SETTINGS_FILE"
                sed -i '' 's/"modelPromptShown":true/"modelPromptShown":false/g' "$SETTINGS_FILE"
            fi
            echo "✅ Ollama prompt settings reset"
        else
            echo "ℹ️ No settings file found, will create with default settings on next launch"
        fi
    else
        echo "ℹ️ ShellPer app not found in Applications folder. Will fix local installation only."
    fi
    
    # Create local .env file
    echo "▶ Creating local configuration file..."
    ENV_CONTENT="NO_EXTERNAL_SERVICES=true
NO_AUTH=true
OFFLINE_ONLY=true"
    echo "$ENV_CONTENT" > .env
    echo "✅ Configuration files created"
}

# Function to fix ImageMagick
fix_imagemagick() {
    echo "▶ Checking ImageMagick installation..."
    
    # Check for ImageMagick and install if needed
    if ! command -v magick &> /dev/null; then
        echo "⚠️ ImageMagick not found"
        
        # Check for Homebrew
        if ! command -v brew &> /dev/null; then
            echo "⚠️ Homebrew not found. Please install Homebrew first:"
            echo "   Visit https://brew.sh to install Homebrew"
            echo "   Then run this script again."
            return 1
        fi
        
        # Install ImageMagick via Homebrew
        echo "▶ Installing ImageMagick via Homebrew..."
        brew install imagemagick
        echo "✅ ImageMagick installed"
    else
        echo "✅ ImageMagick is already installed"
    fi
    
    # Create symlinks to ensure ShellPer can find ImageMagick
    echo "▶ Creating symlinks for ImageMagick..."
    
    # Get the path to magick
    MAGICK_CMD=$(command -v magick)
    
    if [ -n "$MAGICK_CMD" ]; then
        # Create usr/local/bin directory if it doesn't exist
        sudo mkdir -p /usr/local/bin
        
        # Create symlinks
        if [ ! -f "/usr/local/bin/magick" ]; then
            sudo ln -sf "$MAGICK_CMD" /usr/local/bin/magick
            echo "✅ Created symlink at /usr/local/bin/magick"
        fi
        
        # Update PATH for current terminal session
        export PATH="/usr/local/bin:$PATH"
    fi
    
    echo "✅ ImageMagick setup complete"
}

# Function to reset application data
reset_app_data() {
    echo "▶ Resetting application data..."
    
    # Reset ShellPer data
    APP_DATA_DIR="$HOME/Library/Application Support/ShellPer"
    if [ -d "$APP_DATA_DIR" ]; then
        rm -rf "$APP_DATA_DIR"
        echo "✅ ShellPer app data reset"
    fi
    
    # Reset Electron data
    ELECTRON_DATA_DIR="$HOME/Library/Application Support/Electron"
    if [ -d "$ELECTRON_DATA_DIR" ]; then
        rm -rf "$ELECTRON_DATA_DIR"
        echo "✅ Electron data reset"
    fi
    
    echo "✅ App data reset complete"
}

# Function to fix Ollama and install the model
fix_ollama() {
    echo "▶ Checking Ollama installation..."
    
    # Check for Ollama and install if needed
    if ! command -v ollama &> /dev/null; then
        echo "⚠️ Ollama not found"
        
        # Ask user if they want to install Ollama
        read -p "Would you like to download and install Ollama? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "▶ Opening Ollama website to download..."
            open "https://ollama.ai"
            echo "ℹ️ Please download and install Ollama, then run this script again."
            return 1
        else
            echo "ℹ️ Skipping Ollama installation."
            return 1
        fi
    else
        echo "✅ Ollama is already installed"
    fi
    
    # Check if SudoSaturn/Shellper model is installed
    echo "▶ Checking if SudoSaturn/Shellper model is installed..."
    if ! ollama list 2>/dev/null | grep -qi "shellper\|sudosaturn"; then
        echo "⚠️ SudoSaturn/Shellper model not found"
        
        # Ask user if they want to install the model
        read -p "Would you like to download the SudoSaturn/Shellper model? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "▶ Downloading SudoSaturn/Shellper model..."
            ollama pull SudoSaturn/Shellper
            echo "✅ SudoSaturn/Shellper model installed"
        else
            echo "ℹ️ Skipping model installation."
            return 1
        fi
    else
        echo "✅ SudoSaturn/Shellper model is already installed"
    fi
    
    # Check if Ollama service is running
    echo "▶ Checking if Ollama service is running..."
    if ! curl -s localhost:11434/api/tags >/dev/null; then
        echo "⚠️ Ollama service is not running"
        
        # Start Ollama service
        echo "▶ Starting Ollama service..."
        ollama serve >/dev/null 2>&1 &
        echo "✅ Ollama service started"
        sleep 2  # Give it a moment to start
    else
        echo "✅ Ollama service is running"
    fi
    
    echo "✅ Ollama setup complete"
}

# Main function to fix all issues
fix_all() {
    echo "▶ Starting complete fix process..."
    
    # Fix application issues
    fix_application
    
    # Fix ImageMagick
    fix_imagemagick
    
    # Fix Ollama and install the model
    fix_ollama
    
    # Reset app data
    reset_app_data
    
    echo ""
    echo "✅ All fixes have been applied."
    echo ""
    echo "To launch the application:"
    echo "1. If installed: open -a ShellPer"
    echo "2. Development: ./run_shellper.sh"
}

# Check if first parameter is to show help
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage:"
    echo "  ./fix_shellper.sh           - Fix all issues"
    echo "  ./fix_shellper.sh app       - Fix application issues only"
    echo "  ./fix_shellper.sh imagemagick - Fix ImageMagick issues only"
    echo "  ./fix_shellper.sh ollama    - Fix Ollama and install model"
    echo "  ./fix_shellper.sh reset     - Reset app data only"
    echo "  ./fix_shellper.sh help      - Show this help message"
    exit 0
fi

# Process command line arguments
if [ -z "$1" ]; then
    # No arguments, fix everything
    fix_all
elif [ "$1" = "app" ]; then
    fix_application
elif [ "$1" = "imagemagick" ]; then
    fix_imagemagick
elif [ "$1" = "ollama" ]; then
    fix_ollama
elif [ "$1" = "reset" ]; then
    reset_app_data
else
    echo "Unknown option: $1"
    echo "Run ./fix_shellper.sh help for usage information"
    exit 1
fi 