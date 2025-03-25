# ShellPer - AI-Powered Helper for macOS

ShellPer analyzes screenshots to provide AI-powered suggestions.

## Quick Start

```bash
# Install
npm install

# Launch
./run_shellper.sh
```

## Features

- Screenshot analysis of your code 
- AI-powered command suggestions
- Completely invisible to screenshots, screen recordings and video calls
- User-only visibility that can't be captured by external tools
- Offline processing with local Ollama integration
- Designed specifically for macOS

## Keyboard Shortcuts

- **Cmd+B**: Toggle app visibility (for user only, always invisible to screen capture)
- **Cmd+H**: Take a screenshot
- **Cmd+Enter**: Process screenshots
- **Cmd+R**: Reset and clear queues
- **Cmd+Arrow Keys**: Move window
- **Ctrl+Cmd+Opt+Q**: Quit application

## Installation

```bash
# Build DMG
./build_mac.sh

# Install
open ./release/ShellPer-Mac-arm64.dmg

# Fix issues
./fix_shellper.sh
```

## Requirements

- macOS 11.0+
- Node.js (v16+)
- ImageMagick
- Ollama

## Scripts

- **./run_shellper.sh**: Run the application
  - `./run_shellper.sh reset`: Reset app data

- **./build_mac.sh**: Create macOS DMG installer

- **./fix_shellper.sh**: Fix common issues
  - `./fix_shellper.sh app`: Fix installation
  - `./fix_shellper.sh imagemagick`: Fix ImageMagick
  - `./fix_shellper.sh reset`: Reset app data

## License

MIT
