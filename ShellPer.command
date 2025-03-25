#!/bin/bash
# ShellPer macOS Launcher
cd "$(dirname "$0")"

# Display a nice header
echo "╭───────────────────────────────────────╮"
echo "│    ShellPer for macOS                 │"
echo "│    Starting application...            │" 
echo "╰───────────────────────────────────────╯"

# Run the application
./run_shellper.sh "$@" 