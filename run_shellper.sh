#!/bin/bash
cd "$(dirname "$0")"
echo "┌─────────────────────────────────────────────┐"
echo "│          ShellPer for macOS                 │"
echo "└─────────────────────────────────────────────┘"

# Make script executable
chmod +x *.sh 2>/dev/null || true

# Function to check dependencies
check_environment() {
    echo "▶ Checking environment..."
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo "Node.js is not installed. Please install Node.js to run this application."
        return 1
    fi
    
    # Check for npm
    if ! command -v npm &> /dev/null; then
        echo "npm is not installed. Please install npm to run this application."
        return 1
    fi
    
    # Check for ImageMagick
    if ! command -v magick &> /dev/null; then
        echo "ImageMagick is not installed. Some features may not work properly."
        echo "   Consider running ./fix_shellper.sh to install dependencies."
    fi
    
    # Check for Ollama
    if ! command -v ollama &> /dev/null; then
        echo "Ollama is not installed. The app requires Ollama to function properly."
        echo "   Please install Ollama from https://ollama.ai"
    else
        echo "Ollama is installed"
        
        # Check if the model is installed
        if ! ollama list 2>/dev/null | grep -qi "shellper\|sudosaturn"; then
            echo "The 'SudoSaturn/Shellper' model is not installed in Ollama."
            read -p "Would you like to pull the SudoSaturn/Shellper model now? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "Pulling SudoSaturn/Shellper model..."
                ollama pull SudoSaturn/Shellper
            fi
        else
            echo "SudoSaturn/Shellper model is installed"
        fi
        
        # Check if Ollama service is running
        if ! curl -s localhost:11434/api/tags >/dev/null; then
            echo "Ollama service is not running. Starting it now..."
            ollama serve >/dev/null 2>&1 &
            echo "Ollama service started"
            sleep 2  # Give it a moment to start
        else
            echo "Ollama service is running"
        fi
    fi
    
    return 0
}

# Function to run the application
run_app() {
    # Check if build exists, or build if it doesn't
    if [ ! -d "dist-electron" ] || [ ! -f "dist-electron/main.js" ]; then
        echo "▶ Building the application..."
        npm run clean
        npx tsc -p tsconfig.electron.json
        npx vite build
    fi
    
    # Run the app
    echo "▶ Starting ShellPer..."
    NODE_ENV=development npx electron ./dist-electron/main.js
}

# Function to reset app data
reset_app_data() {
    echo "▶ Resetting application data..."
    APP_DATA_DIR="$HOME/Library/Application Support/ShellPer"
    ELECTRON_DATA_DIR="$HOME/Library/Application Support/Electron"
    
    # Remove ShellPer data
    if [ -d "$APP_DATA_DIR" ]; then
        rm -rf "$APP_DATA_DIR"
        echo "ShellPer data reset"
    fi
    
    # Remove Electron data
    if [ -d "$ELECTRON_DATA_DIR" ]; then
        rm -rf "$ELECTRON_DATA_DIR"
        echo "Electron data reset"
    fi
}

# Check if first parameter is "reset" to reset app data
if [ "$1" = "reset" ]; then
    reset_app_data
    run_app
    exit 0
fi

# Check if first parameter is "help" to show usage info
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage:"
    echo "  ./run_shellper.sh           - Run the application"
    echo "  ./run_shellper.sh reset     - Reset app data and run"
    echo "  ./run_shellper.sh help      - Show this help message"
    exit 0
fi

# Main execution: check environment and run the app
check_environment && run_app 
