#!/bin/bash
set -e  # Exit on error
cd "$(dirname "$0")"
echo "┌─────────────────────────────────────────────┐"
echo "│   ShellPer Build Tool (macOS)               │"
echo "└─────────────────────────────────────────────┘"

# Function to generate macOS icons
generate_icons() {
    echo "▶ Generating macOS icons..."
    
    # Input image
    INPUT_IMAGE="./public/icon.png"

    # Check if input image exists
    if [ ! -f "$INPUT_IMAGE" ]; then
        echo "⚠️ Input image not found! Creating a placeholder image..."
        magick -size 1024x1024 xc:black -fill white -pointsize 500 -font Arial -gravity center -annotate 0 ">_" "$INPUT_IMAGE"
    fi

    # Create directories
    mkdir -p assets/icons/mac
    mkdir -p public

    # Create temporary iconset directory
    mkdir -p temp.iconset

    # Generate PNG files of various sizes for macOS
    magick "$INPUT_IMAGE" -resize 16x16 "temp.iconset/icon_16x16.png"
    magick "$INPUT_IMAGE" -resize 32x32 "temp.iconset/icon_16x16@2x.png"
    magick "$INPUT_IMAGE" -resize 32x32 "temp.iconset/icon_32x32.png"
    magick "$INPUT_IMAGE" -resize 64x64 "temp.iconset/icon_32x32@2x.png"
    magick "$INPUT_IMAGE" -resize 128x128 "temp.iconset/icon_128x128.png"
    magick "$INPUT_IMAGE" -resize 256x256 "temp.iconset/icon_128x128@2x.png"
    magick "$INPUT_IMAGE" -resize 256x256 "temp.iconset/icon_256x256.png"
    magick "$INPUT_IMAGE" -resize 512x512 "temp.iconset/icon_256x256@2x.png"
    magick "$INPUT_IMAGE" -resize 512x512 "temp.iconset/icon_512x512.png"
    magick "$INPUT_IMAGE" -resize 1024x1024 "temp.iconset/icon_512x512@2x.png"

    # Create .icns file using iconutil (macOS specific)
    iconutil -c icns temp.iconset -o "public/icon.icns"
    cp "public/icon.icns" "assets/icons/mac/icon.icns"

    # Cleanup
    rm -rf temp.iconset

    echo "✅ macOS icons generated"
}

# Function to check dependencies
check_dependencies() {
    echo "▶ Checking dependencies..."

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo "⚠️ Node.js is not installed. Please install Node.js to build this application."
        return 1
    fi

    # Check for npm
    if ! command -v npm &> /dev/null; then
        echo "⚠️ npm is not installed. Please install npm to build this application."
        return 1
    fi

    # Check for ImageMagick
    if ! command -v magick &> /dev/null; then
        echo "⚠️ ImageMagick is not installed. Installing via Homebrew..."
        if command -v brew &> /dev/null; then
            brew install imagemagick
        else
            echo "⚠️ Homebrew not found. Please install Homebrew first:"
            echo "   Visit https://brew.sh to install Homebrew"
            return 1
        fi
    else
        echo "✅ ImageMagick is installed"
    fi

    # Check for Ollama
    if ! command -v ollama &> /dev/null; then
        echo "⚠️ Ollama is not installed. Please install from https://ollama.ai"
        echo "   The app requires Ollama to function properly."
    else
        echo "✅ Ollama is installed"
        
        # Check if model is installed
        if ! ollama list | grep -qi "shellper\|sudosaturn"; then
            echo "⚠️ The 'SudoSaturn/Shellper' model is not installed in Ollama."
            read -p "Would you like to pull the SudoSaturn/Shellper model now? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                ollama pull SudoSaturn/Shellper
            fi
        else
            echo "✅ Shellper model is installed"
        fi
    fi

    # Ensure .env file exists
    if [ ! -f .env ]; then
        echo "▶ Creating .env file..."
        echo "NO_EXTERNAL_SERVICES=true
NO_AUTH=true
OFFLINE_ONLY=true" > .env
    fi

    return 0
}

# Main function to build application and create DMG
build_app() {
    echo "┌─────────────────────────────────────────────┐"
    echo "│   Building ShellPer for macOS               │"
    echo "└─────────────────────────────────────────────┘"

    # Check dependencies
    check_dependencies || return 1
    
    # Generate icons
    generate_icons

    # Clean previous builds
    echo "▶ Cleaning previous builds..."
    rm -rf release dist dist-electron
    npm run clean

    # Install dependencies
    echo "▶ Installing dependencies..."
    npm install

    # Build for production
    echo "▶ Building for production..."
    NODE_ENV=production npm run build:mac

    echo "▶ Build completed!"
    if [ -d "release" ]; then
        find release -name "*.dmg" -type f | while read -r DMG_FILE; do
            echo "📦 DMG file created: $DMG_FILE"
            echo "   - To install, open the DMG file and drag the app to Applications"
            echo "   - Right-click the app and select 'Open' for first launch"
            echo "   - Grant the required permissions when prompted"
        done
    else
        echo "⚠️ No DMG files were found in the release directory."
        echo "   Please check for errors in the build process."
    fi
}

# Run the build process
build_app 