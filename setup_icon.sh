#!/bin/bash
set -e  # Exit on error

echo "┌─────────────────────────────────────────────┐"
echo "│   ShellPer Icon Setup Tool                  │"
echo "└─────────────────────────────────────────────┘"

echo "▶ Please manually save the icon from the chat to your desktop as 'shellper_icon.png'"
echo "▶ Make sure you save the full image, not a screenshot"
echo "▶ Press Enter when you've saved the image to your desktop..."
read -p ""

DESKTOP_PATH="$HOME/Desktop/shellper_icon.png"
TARGET_PATH="$(pwd)/public/icon.png"

if [ ! -f "$DESKTOP_PATH" ]; then
    echo "⚠️ Icon file not found at $DESKTOP_PATH"
    echo "▶ Please save the icon to your desktop as 'shellper_icon.png' and try again"
    exit 1
fi

echo "▶ Found icon file at $DESKTOP_PATH"
echo "▶ Copying to $TARGET_PATH..."
cp "$DESKTOP_PATH" "$TARGET_PATH"

# Create directories
mkdir -p assets/icons/mac
mkdir -p public

# Create temporary iconset directory
mkdir -p temp.iconset

# Generate PNG files of various sizes for macOS
echo "▶ Generating macOS icons of various sizes..."
magick "$TARGET_PATH" -resize 16x16 "temp.iconset/icon_16x16.png"
magick "$TARGET_PATH" -resize 32x32 "temp.iconset/icon_16x16@2x.png"
magick "$TARGET_PATH" -resize 32x32 "temp.iconset/icon_32x32.png"
magick "$TARGET_PATH" -resize 64x64 "temp.iconset/icon_32x32@2x.png"
magick "$TARGET_PATH" -resize 128x128 "temp.iconset/icon_128x128.png"
magick "$TARGET_PATH" -resize 256x256 "temp.iconset/icon_128x128@2x.png"
magick "$TARGET_PATH" -resize 256x256 "temp.iconset/icon_256x256.png"
magick "$TARGET_PATH" -resize 512x512 "temp.iconset/icon_256x256@2x.png"
magick "$TARGET_PATH" -resize 512x512 "temp.iconset/icon_512x512.png"
magick "$TARGET_PATH" -resize 1024x1024 "temp.iconset/icon_512x512@2x.png"

# Create .icns file using iconutil (macOS specific)
echo "▶ Creating .icns file..."
iconutil -c icns temp.iconset -o "public/icon.icns"
cp "public/icon.icns" "assets/icons/mac/icon.icns"

# Cleanup
rm -rf temp.iconset

echo "✅ Icon setup complete!"
echo "▶ The icon has been saved to public/icon.png and public/icon.icns"
echo "▶ You'll need to rebuild the application to apply the new icon"
echo "▶ Run './build_mac.sh' to rebuild the application with the new icon" 