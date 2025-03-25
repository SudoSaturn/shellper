import { app, BrowserWindow, screen, shell, ipcMain, dialog, globalShortcut } from "electron"
import path from "path"
import { initializeIpcHandlers } from "./ipcHandlers"
import { ProcessingHelper } from "./ProcessingHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import * as dotenv from "dotenv"
import fs from 'fs'
import { exec, execSync } from 'child_process'
import { PathUtils } from './path-utils'
import axios from 'axios'
import { Tray, Menu } from "electron"
import log from "electron-log"

// Define interface for our store
interface IStore {
  get(key: string, defaultValue?: any): any;
  set(key: string, value: any): void;
}

// Create a simple in-memory store
const createInMemoryStore = (): IStore => {
  const data: Record<string, any> = {
    ollama: {
      promptShown: false,
      modelPromptShown: false
    }
  };
  
  return {
    get: (key: string, defaultValue?: any) => {
      const keys = key.split('.');
      let current = data;
      
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return defaultValue;
        }
      }
      
      return current ?? defaultValue;
    },
    set: (key: string, value: any) => {
      const keys = key.split('.');
      let current = data;
      
      // Navigate to the right location
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current) || typeof current[k] !== 'object') {
          current[k] = {};
        }
        current = current[k];
      }
      
      // Set the value
      const lastKey = keys[keys.length - 1];
      current[lastKey] = value;
      
      console.log(`[InMemoryStore] Set ${key} to ${JSON.stringify(value)}`);
    }
  };
};

// Create placeholder for the store
let store: IStore = createInMemoryStore();

// Define isDev once for the entire file
// This ensures it works in both packaged and development environments
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Log important path information for debugging
console.log("===================== DEBUGGING PATHS =====================")
console.log("Current working directory:", process.cwd())
console.log("__dirname:", __dirname)
console.log("app.getAppPath():", app.getAppPath())
console.log("isDev:", isDev)
console.log("==========================================================")

// Add a proper debug logger
const LOG_DIRECTORY = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIRECTORY, 'debug.log');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIRECTORY)) {
  fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
}

// Custom logger that writes to both console and file
const logger = {
  log: (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  },
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    const errorString = error ? `\n  ${error.stack || error}` : '';
    const logMessage = `[${timestamp}] [ERROR] ${message}${errorString}`;
    console.error(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  },
  debug: (message: string) => {
    if (isDev) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [DEBUG] ${message}`;
      console.debug(logMessage);
      fs.appendFileSync(LOG_FILE, logMessage + '\n');
    }
  }
};

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  isWindowVisible: false,
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  step: 0,
  currentX: 0,
  currentY: 0,

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as ProcessingHelper | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,

  // Processing events
  PROCESSING_EVENTS: {
    INITIAL_START: "processing-initial-start",
    INITIAL_SOLUTION_SUCCESS: "processing-initial-solution-success",
    INITIAL_SOLUTION_ERROR: "processing-initial-solution-error",
    PROBLEM_EXTRACTED: "processing-problem-extracted",
    SOLUTION_SUCCESS: "processing-solution-success",
    DEBUG_START: "processing-debug-start",
    DEBUG_SUCCESS: "processing-debug-success",
    DEBUG_ERROR: "processing-debug-error",
    NO_SCREENSHOTS: "processing-no-screenshots",
    RESET: "processing-reset",
    SCREENSHOT_IN_PROGRESS: "screenshot-in-progress"
  } as const,

  // New properties
  screenshotInProgress: false,
  screenshotQueue: [] as string[],
  extraScreenshotQueue: [] as string[],
  
  // Flags to avoid repeated prompts - initialize from default values
  // These will be updated after the store is initialized
  ollmaPromptShown: false,
  modelPromptShown: false
}

// Add interfaces for helper classes
export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null
  getMainWindow: () => BrowserWindow | null
  getView: () => "queue" | "solutions" | "debug"
  setView: (view: "queue" | "solutions" | "debug") => void
  getProblemInfo: () => any
  setProblemInfo: (info: any) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  clearQueues: () => void
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  setHasDebugged: (value: boolean) => void
  getHasDebugged: () => boolean
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
}

export interface IIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  setWindowDimensions: (width: number, height: number) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
  takeScreenshot: () => Promise<string>
  getView: () => "queue" | "solutions" | "debug"
  toggleMainWindow: () => void
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view)
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    getProblemInfo,
    setProblemInfo,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    getImagePreview,
    deleteScreenshot,
    setHasDebugged,
    getHasDebugged,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS
  } as IProcessingHelperDeps)
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    takeScreenshot,
    getImagePreview,
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) =>
        Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
      ),
    moveWindowRight: () =>
      moveWindowHorizontal((x) =>
        Math.min(
          state.screenWidth - (state.windowSize?.width || 0) / 2,
          x + state.step
        )
      ),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step)
  } as IShortcutsHelperDeps)
}

// Register protocol handler for local use only (NOT for external URLs)
// This is used only for internal app commands, not for network connections
if (process.platform === "darwin") {
  app.setAsDefaultProtocolClient("shellper")
} else {
  app.setAsDefaultProtocolClient("shellper", process.execPath, [
    path.resolve(process.argv[1] || "")
  ])
}

// Handle the protocol. In this case, we choose to show an Error Box.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("shellper", process.execPath, [
    path.resolve(process.argv[1])
  ])
}

// Force Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.focus()
    }
  })
}

// Window management functions
async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.focus()
    return
  }

  // Hide from dock on macOS
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  console.log("Creating new window...");
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workAreaSize
  state.screenWidth = workArea.width
  state.screenHeight = workArea.height
  state.step = 60
  state.currentY = 50

  console.log("Screen dimensions:", { 
    width: workArea.width, 
    height: workArea.height,
    workArea: primaryDisplay.workArea 
  });

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    height: 600,
    width: 800,
    x: state.currentX,
    y: 50,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js"),
      scrollBounce: true
    },
    show: true,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    type: "panel", // Always use panel type for better invisibility
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: true,
    movable: true
  }

  console.log("Window settings:", windowSettings);
  
  // Create the window and ensure it's shown
  state.mainWindow = new BrowserWindow(windowSettings)
  
  // Set content protection to make window invisible to screen capture
  state.mainWindow.setContentProtection(true);
  
  // Always make the window visible to the user initially
  state.mainWindow.show();
  state.mainWindow.setOpacity(1);
  state.mainWindow.focus();
  state.mainWindow.moveTop(); // Force window to top
  state.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  state.isWindowVisible = true;
  console.log("Window created and set to visible to user but invisible to screen capture");

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading")
  })
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription)
      if (isDev) {
        // In development, retry loading the file directly
        console.log("Retrying to load the built files...")
        setTimeout(() => {
          const htmlPath = path.join(__dirname, "../dist/index.html");
          console.log("Loading from path:", htmlPath);
          if (state.mainWindow) {
            state.mainWindow.loadFile(htmlPath).catch((error) => {
              console.error("Failed to load HTML file on retry:", error)
            });
          }
        }, 1000)
      }
    }
  )

  // Load the HTML file using PathUtils
  try {
    if (isDev) {
      // In development, try to load from the local dev server (localhost only)
      console.log('Loading from local development server at http://localhost:54321');
      await state.mainWindow.loadURL('http://localhost:54321');
      state.mainWindow.webContents.openDevTools();
    } else {
      // In production, load the built HTML file
      const htmlPath = PathUtils.getHtmlPath();
      console.log(`Loading HTML from: ${htmlPath}`);
      
      // Check if file exists and is readable before loading
      if (PathUtils.verifyPath(htmlPath)) {
        if (htmlPath.startsWith('http')) {
          await state.mainWindow.loadURL(htmlPath);
        } else {
          await state.mainWindow.loadFile(htmlPath);
        }
        console.log('HTML loaded successfully');
      } else {
        console.error(`Could not load HTML from ${htmlPath} - file not accessible`);
        dialog.showErrorBox('Application Error', 
          `Could not load the application interface. Please reinstall the application.`);
      }
    }
  } catch (error) {
    console.error('Error loading application window:', error);
    
    // Attempt recovery if development server fails
    if (isDev) {
      try {
        console.log('Development server not available, attempting to load built files');
        const builtHtmlPath = path.join(__dirname, '../dist/index.html');
        if (fs.existsSync(builtHtmlPath)) {
          await state.mainWindow.loadFile(builtHtmlPath);
          console.log('Loaded built files successfully');
        } else {
          console.error('Built files not found either');
        }
      } catch (fallbackError) {
        console.error('Error in fallback loading:', fallbackError);
      }
    }
  }
  
  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1)
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Attempting to open URL:", url)
    // Never allow external URLs to be opened
    return { action: "deny" }
  })

  // Enhanced screen capture resistance
  state.mainWindow.setContentProtection(true)

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  })
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Prevent window from being captured in screenshots
    state.mainWindow.setHiddenInMissionControl(true)
    state.mainWindow.setWindowButtonVisibility(false)
    state.mainWindow.setBackgroundColor("#00000000")

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true)

    // Disable window shadow
    state.mainWindow.setHasShadow(false)
    
    // Additional macOS-specific screen capture resistance
    try {
      // Use NSWindow API to set special flags (if available in this Electron version)
      const nsWindow = state.mainWindow.getNativeWindowHandle();
      if (nsWindow) {
        state.mainWindow.setWindowButtonVisibility(false);
      }
    } catch (error) {
      console.log("Could not set additional native window options:", error);
    }
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(false)
  state.mainWindow.webContents.setFrameRate(60)

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove)
  state.mainWindow.on("resize", handleWindowResize)
  state.mainWindow.on("closed", handleWindowClosed)

  // Initialize window state
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.windowSize = { width: bounds.width, height: bounds.height }
  state.currentX = bounds.x
  state.currentY = bounds.y
  state.isWindowVisible = true
}

function handleWindowMove(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.currentX = bounds.x
  state.currentY = bounds.y
}

function handleWindowResize(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowSize = { width: bounds.width, height: bounds.height }
}

function handleWindowClosed(): void {
  state.mainWindow = null
  state.isWindowVisible = false
  state.windowPosition = null
  state.windowSize = null
}

// Window visibility functions
function hideMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    console.log("Hiding main window from user view (still invisible to screen capture)...");
    if (state.mainWindow.isFullScreen()) {
      state.mainWindow.setFullScreen(false)
    }

    // Store current window position and dimensions before hiding
    const bounds = state.mainWindow.getBounds()
    state.windowPosition = { x: bounds.x, y: bounds.y }
    state.windowSize = { width: bounds.width, height: bounds.height }

    // Make invisible to user but maintain screen capture protection
    state.mainWindow.setOpacity(0)
    state.mainWindow.setIgnoreMouseEvents(true)
    state.isWindowVisible = false
    
    // Ensure content protection remains active
    state.mainWindow.setContentProtection(true)
    
    console.log("Window is now hidden from user view but still invisible to screen capture");
  }
}

function showMainWindow(): void {
  try {
    console.log('Showing main window to user (still invisible to screen capture)...');
    if (!state.mainWindow) {
      console.log('Main window does not exist, creating new window');
      createWindow();
      return;
    }
    
    if (state.mainWindow.isDestroyed()) {
      console.log('Main window was destroyed, creating new window');
      createWindow();
      return;
    }
    
    // Position window based on stored position/size or default
    if (state.windowPosition && state.windowSize) {
      state.mainWindow.setBounds({
        ...state.windowPosition,
        ...state.windowSize
      })
    }
    
    // Ensure the window is properly configured for visibility to user but invisible to screen capture
    state.mainWindow.setIgnoreMouseEvents(false)
    state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    })
    
    // Ensure content protection remains active - this is critical for screen capture invisibility
    state.mainWindow.setContentProtection(true)
    
    // Force show window with much more aggressive approach in production
    if (!isDev || process.env.FORCE_SHOW_WINDOW === 'true') {
      console.log("Forcing window to show to user (production or forced mode)");
      state.mainWindow.show();
      state.mainWindow.showInactive();
      state.mainWindow.moveTop();
      state.mainWindow.focus();
      
      // On macOS, try to force activate the app but keep it hidden from dock
      if (process.platform === 'darwin') {
        try {
          // Don't show dock icon
          app.dock.hide();
          
          app.focus({steal: true});
          setTimeout(() => {
            // Dock bounce not needed and would show icon
            state.mainWindow?.setAlwaysOnTop(false);
            state.mainWindow?.setAlwaysOnTop(true, "screen-saver", 1);
            state.mainWindow?.moveTop();
            
            // Re-apply content protection to ensure screen capture invisibility
            state.mainWindow?.setContentProtection(true);
          }, 300);
        } catch (e) {
          console.error('Error activating app:', e);
        }
      }
    }
    
    // Start with opacity 0
    state.mainWindow.setOpacity(0)
    state.mainWindow.showInactive()
    
    // Use a more reliable transition effect for showing the window to the user
    let opacity = 0
    let attempts = 0
    const maxAttempts = 20  // Allow more attempts for visibility
    
    const fadeInterval = setInterval(() => {
      if (!state.mainWindow || state.mainWindow.isDestroyed()) {
        clearInterval(fadeInterval)
        return
      }
      
      attempts++
      opacity += 0.05
      
      if (opacity >= 1 || attempts >= maxAttempts) {
        opacity = 1
        clearInterval(fadeInterval)
        console.log(`Window is now fully visible to user (after ${attempts} attempts)`)
        
        // Final visibility check
        if (state.mainWindow) {
          state.mainWindow.setOpacity(1)
          state.mainWindow.moveTop()
          state.mainWindow.focus()
          
          // Re-apply content protection to ensure screen capture invisibility
          state.mainWindow.setContentProtection(true);
          
          // Ensure dock remains hidden on macOS
          if (process.platform === 'darwin') {
            app.dock.hide();
          }
        }
      }
      
      if (!state.mainWindow.isDestroyed()) {
        state.mainWindow.setOpacity(opacity)
      } else {
        clearInterval(fadeInterval)
      }
    }, 30)  // Slower fade in for better stability
    
    state.isWindowVisible = true
  } catch (error) {
    console.error('Error showing main window:', error);
    dialog.showErrorBox('Window Error', 
      'There was an error displaying the application window. Please run ./fix_visibility.sh to troubleshoot visibility issues.');
  }
}

function toggleMainWindow(): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return

  // Always ensure content protection is active before toggling user visibility
  if (state.mainWindow) {
    state.mainWindow.setContentProtection(true);
  }

  if (state.isWindowVisible) {
    hideMainWindow()
  } else {
    showMainWindow()
  }
  console.log("Window user visibility toggled. Current state:", state.isWindowVisible ? "visible to user" : "hidden from user", "(always invisible to screen capture)")
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  if (!state.mainWindow) return
  state.currentX = updateFn(state.currentX)
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  )
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  if (!state.mainWindow) return

  const newY = updateFn(state.currentY)
  // Allow window to go 2/3 off screen in either direction
  const maxUpLimit = (-(state.windowSize?.height || 0) * 2) / 3
  const maxDownLimit =
    state.screenHeight + ((state.windowSize?.height || 0) * 2) / 3

  // Log the current state and limits
  console.log({
    newY,
    maxUpLimit,
    maxDownLimit,
    screenHeight: state.screenHeight,
    windowHeight: state.windowSize?.height,
    currentY: state.currentY
  })

  // Only update if within bounds
  if (newY >= maxUpLimit && newY <= maxDownLimit) {
    state.currentY = newY
    state.mainWindow.setPosition(
      Math.round(state.currentX),
      Math.round(state.currentY)
    )
  }
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (!state.mainWindow?.isDestroyed()) {
    const [currentX, currentY] = state.mainWindow.getPosition()
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    const maxWidth = Math.floor(workArea.width * 0.5)

    state.mainWindow.setBounds({
      x: Math.min(currentX, workArea.width - maxWidth),
      y: currentY,
      width: Math.min(width + 32, maxWidth),
      height: Math.ceil(height)
    })
  }
}

// Environment setup
function loadEnvVariables() {
  if (isDev) {
    console.log("Loading env variables from:", path.join(process.cwd(), ".env"))
    dotenv.config({ path: path.join(process.cwd(), ".env") })
  } else {
    console.log(
      "Loading env variables from:",
      path.join(process.resourcesPath, ".env")
    )
    dotenv.config({ path: path.join(process.resourcesPath, ".env") })
  }
  console.log("Loaded environment variables:", {
    NO_EXTERNAL_SERVICES: process.env.NO_EXTERNAL_SERVICES ? "true" : "false",
    NO_AUTH: process.env.NO_AUTH ? "true" : "false",
    OFFLINE_ONLY: process.env.OFFLINE_ONLY ? "true" : "false"
  })
}

// Check if ImageMagick is installed
async function checkImageMagick(): Promise<boolean> {
  try {
    const { exec, execSync } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    const fs = require('fs');
    const path = require('path');
    
    // Try different ways to detect ImageMagick
    const commands = [
      'magick -version',
      'convert -version',  // Legacy ImageMagick command
      '/usr/local/bin/magick -version',
      '/opt/homebrew/bin/magick -version',  // M1 Mac Homebrew path
      '/usr/bin/magick -version'
    ];
    
    // Common installation paths on macOS
    const macPaths = [
      '/opt/homebrew/bin/magick',
      '/usr/local/bin/magick',
      '/usr/bin/magick',
      '/opt/homebrew/bin/convert'
    ];
    
    // Check if we're on macOS and try to find ImageMagick in common paths
    if (process.platform === 'darwin') {
      for (const magickPath of macPaths) {
        if (fs.existsSync(magickPath)) {
          console.log(`ImageMagick found at: ${magickPath}`);
          return true;
        }
      }
      
      // Check using 'which' command on macOS
      try {
        const whichOutput = execSync('which magick || which convert', { encoding: 'utf8' }).trim();
        if (whichOutput) {
          console.log(`ImageMagick found at: ${whichOutput}`);
          return true;
        }
      } catch (whichError) {
        console.log('Could not find ImageMagick using which command');
      }
    }
    
    // Try each command until one succeeds
    for (const cmd of commands) {
      try {
        const output = await execPromise(cmd);
        if (output.stdout && (output.stdout.includes('ImageMagick') || output.stdout.includes('Version'))) {
          console.log(`ImageMagick detected using: ${cmd}`);
          console.log(`Version info: ${output.stdout.split('\n')[0]}`);
          return true;
        }
      } catch (cmdError) {
        // Command failed, try the next one
        console.log(`Command failed: ${cmd}`);
      }
    }
    
    // If we got here, all detection methods failed
    console.warn('ImageMagick not found after trying multiple detection methods');
    return false;
  } catch (error) {
    console.warn('Error checking for ImageMagick:', error.message);
    return false;
  }
}

// Application tray
let tray: Tray | null = null;

// Initialize system tray
function initializeTray() {
  if (tray) return;
  
  try {
    // Create tray icon
    const trayIconPath = isDev 
      ? path.join(process.cwd(), 'public', 'tray_icon.png')
      : path.join(process.resourcesPath, 'public', 'tray_icon.png');
    
    // Use a fallback icon if needed
    let iconPath = trayIconPath;
    if (!fs.existsSync(trayIconPath)) {
      // Use app icon as fallback
      iconPath = isDev 
        ? path.join(process.cwd(), 'public', 'icon.png')
        : path.join(process.resourcesPath, 'public', 'icon.png');
    }

    tray = new Tray(iconPath);
    tray.setToolTip('ShellPer');
    
    // Create the context menu
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Show ShellPer', 
        click: () => { showMainWindow(); }
      },
      { type: 'separator' },
      { 
        label: 'Reset Ollama Prompts',
        click: () => {
          // Reset both flags
          store.set('ollama.promptShown', false);
          store.set('ollama.modelPromptShown', false);
          state.ollmaPromptShown = false;
          state.modelPromptShown = false;
          
          // Show confirmation dialog
          dialog.showMessageBox({
            type: 'info',
            title: 'Settings Reset',
            message: 'Ollama prompt settings have been reset. You will be prompted again the next time you restart the app.',
            buttons: ['OK']
          });
        }
      },
      { type: 'separator' },
      { 
        label: 'Quit ShellPer', 
        click: () => { app.quit(); }
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // Single click behavior - toggle the main window
    tray.on('click', () => {
      toggleMainWindow();
    });
    
    console.log("Tray menu initialized");
  } catch (error) {
    console.error("Error initializing tray:", error);
  }
}

// Initialize application
async function initializeApp() {
  try {
    console.log("Starting app initialization...");
    
    // First, initialize the electron-store
    await initializeStore();
    console.log("Store initialized");
    
    // Hide from dock on macOS
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    
    loadEnvVariables()
    console.log("Environment variables loaded");
    
    // Install dependencies
    await installDependencies();
    
    // Check for ImageMagick
    const hasImageMagick = await checkImageMagick();
    if (!hasImageMagick) {
      console.warn("ImageMagick not found. Image normalization will use fallback method.");
      
      // Show warning dialog after app is ready
      app.whenReady().then(() => {
        const { dialog } = require('electron');
        dialog.showMessageBox({
          type: 'warning',
          title: 'ImageMagick Not Found',
          message: 'ImageMagick is not installed or not in your PATH.\n\nImage processing will use a fallback method, but for optimal performance, please install ImageMagick.',
          buttons: ['OK']
        });
        
        // Try to install ImageMagick
        installImageMagick();
      });
    }
    
    initializeHelpers()
    console.log("Helpers initialized");
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step)
    })
    console.log("IPC handlers initialized");
    await createWindow()
    console.log("Main window created");
    
    // Initialize the system tray
    initializeTray();
    console.log("System tray initialized");
    
    state.shortcutsHelper?.registerGlobalShortcuts()
    console.log("Global shortcuts registered");

    // Test screenshot capturing after a short delay
    setTimeout(async () => {
      console.log("============== TESTING SCREENSHOT CAPTURE ==============")
      try {
        console.log("Getting cursor position and capturing screenshot...")
        
        // Display info about primary screen
        const primaryDisplay = screen.getPrimaryDisplay()
        console.log(`Primary display: ${JSON.stringify(primaryDisplay.bounds)}`)
        
        // Take a screenshot - this will now use the interactive method
        // For testing, we'll let it run but the user may need to select an area
        const filePath = await takeScreenshot()
        
        console.log("Screenshot result:", filePath)
        
        if (filePath) {
          console.log(`Screenshot saved to: ${filePath}`)
          
          // Check if the file exists
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath)
            console.log(`File size: ${stats.size} bytes`)
          } else {
            console.log(`File does not exist at: ${filePath}`)
          }
        } else {
          console.log("No screenshot was taken (possibly cancelled by user)")
        }
      } catch (error) {
        console.error("Error in screenshot test:", error)
      }
      console.log("============== SCREENSHOT TEST COMPLETE ==============")
    }, 3000)
  } catch (error) {
    console.error("Failed to initialize application:", error)
    app.quit()
  }
}

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

function getView(): "queue" | "solutions" | "debug" {
  return state.view
}

function setView(view: "queue" | "solutions" | "debug"): void {
  state.view = view
  state.screenshotHelper?.setView(view)
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper
}

function getProblemInfo(): any {
  return state.problemInfo
}

function setProblemInfo(problemInfo: any): void {
  state.problemInfo = problemInfo
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || []
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || []
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues()
  state.problemInfo = null
  setView("queue")
}

// Add debounce for screenshot capturing
let isScreenshotInProgress = false;
let lastScreenshotTime = 0;
const SCREENSHOT_DEBOUNCE_MS = 1000; // 1 second debounce

async function takeScreenshot(): Promise<string> {
  if (state.screenshotInProgress) {
    console.log("Screenshot in progress, debouncing...")
    return ""
  }

  try {
    notifyRenderer(state.PROCESSING_EVENTS.SCREENSHOT_IN_PROGRESS, true)
    state.screenshotInProgress = true
    logScreenshotQueue()

    // Hide the window during screenshot to avoid capturing it
    const wasVisible = isVisible()
    if (wasVisible) {
      console.log("Hiding main window...")
      hideMainWindow()
      // Wait for the window to be hidden
      await new Promise((resolve) => setTimeout(resolve, 200))
      console.log("Window is now hidden")
    }

    // Take a screenshot using the interactive method
    console.log("Taking screenshot...")
    const result = await ScreenshotHelper.takeScreenshot()
    
    // Restore window visibility if it was previously visible
    if (wasVisible) {
      console.log("Showing main window...")
      showMainWindow()
    }

    if (result.success && result.filePath) {
      console.log(`Screenshot saved successfully to ${result.filePath}`)
      // Add the normalized path to the queue
      if (state.screenshotHelper) {
        state.screenshotHelper.addToScreenshotQueue(result.filePath)
        logScreenshotQueue()
      }
      state.screenshotInProgress = false
      notifyRenderer(state.PROCESSING_EVENTS.SCREENSHOT_IN_PROGRESS, false)
      return result.filePath
    } else {
      state.screenshotInProgress = false
      notifyRenderer(state.PROCESSING_EVENTS.SCREENSHOT_IN_PROGRESS, false)
      throw new Error(result.error || "Screenshot failed")
    }
  } catch (e) {
    console.error("Error taking screenshot:", e)
    state.screenshotInProgress = false
    notifyRenderer(state.PROCESSING_EVENTS.SCREENSHOT_IN_PROGRESS, false)
    throw e
  }
}

async function getImagePreview(filepath: string): Promise<string> {
  return state.screenshotHelper?.getImagePreview(filepath) || ""
}

async function deleteScreenshot(
  path: string
): Promise<{ success: boolean; error?: string }> {
  return (
    state.screenshotHelper?.deleteScreenshot(path) || {
      success: false,
      error: "Screenshot helper not initialized"
    }
  )
}

function setHasDebugged(value: boolean): void {
  state.hasDebugged = value
}

function getHasDebugged(): boolean {
  return state.hasDebugged
}

// Add these helper functions below the existing functions (around line ~920)
function notifyRenderer(event: string, data: any) {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send(event, data);
  }
}

function logScreenshotQueue() {
  console.log("Screenshot queue:", state.screenshotHelper?.getScreenshotQueue() || []);
}

function isVisible(): boolean {
  return state.isWindowVisible;
}

// Function to check and install dependencies
async function installDependencies() {
  try {
    console.log("Checking and installing dependencies...");
    
    // Check for Node.js and npm (should already be installed as the app is running)
    console.log("Node.js and npm are installed (required to run the application)");
    
    // Check for Ollama
    await checkAndInstallOllama();
    
    // Check and pull the Shellper model
    await checkAndPullShellperModel();
    
  } catch (error) {
    console.error("Error installing dependencies:", error);
  }
}

// Function to check for and install Ollama
async function checkAndInstallOllama() {
  console.log("Checking for Ollama...");
  
  // Check both in memory and persisted flags
  const persistedPromptShown = store.get('ollama.promptShown', false) as boolean;
  
  if (state.ollmaPromptShown || persistedPromptShown) {
    console.log("Ollama prompt already shown, skipping");
    return;
  }
  
  try {
    // More reliable check for Ollama - try to find it in PATH first
    try {
      execSync('which ollama', { stdio: 'pipe' });
      console.log("Ollama is installed in PATH");
      
      // Check if Ollama is running
      try {
        await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
        console.log("Ollama service is running");
      } catch (connectionError) {
        console.warn("Ollama is installed but not running. Starting Ollama service...");
        
        // Start Ollama service
        try {
          // Run ollama serve in the background for macOS
          exec('ollama serve > /dev/null 2>&1 &');
          console.log("Started Ollama service");
          
          // Wait for Ollama to start
          let attempts = 0;
          const maxAttempts = 10;
          
          while (attempts < maxAttempts) {
            try {
              await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
              console.log("Ollama service is now running");
              break;
            } catch (e) {
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (attempts >= maxAttempts) {
            console.error("Failed to start Ollama service after multiple attempts");
          }
        } catch (startError) {
          console.error("Failed to start Ollama service:", startError);
        }
      }
      return; // Exit early - Ollama is installed
    } catch (whichError) {
      // 'which' command failed, try version check
      try {
        execSync('ollama --version', { stdio: 'pipe' });
        console.log("Ollama is already installed");
        return; // Exit early - Ollama is installed
      } catch (versionError) {
        // Both checks failed, Ollama is likely not installed
        console.warn("Ollama is not installed");
      }
    }
    
    // Only show dialog if we're pretty sure Ollama is not installed
    // and we haven't shown the prompt yet
    state.ollmaPromptShown = true; 
    // Persist this setting so we don't ask again
    store.set('ollama.promptShown', true);
    
    // Show dialog to download Ollama
    app.whenReady().then(() => {
      const { dialog } = require('electron');
      const result = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Ollama Required',
        message: 'ShellPer requires Ollama for AI functionality.\n\nPlease install Ollama from https://ollama.ai',
        buttons: ['Open Download Page', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (result === 0) {
        // Open Ollama download page
        shell.openExternal('https://ollama.ai');
      }
    });
  } catch (error) {
    console.error("Error checking for Ollama:", error);
  }
}

// Function to check and pull the Shellper model
async function checkAndPullShellperModel() {
  console.log("Checking for the Shellper model...");
  
  // Check both in memory and persisted flags
  const persistedModelPromptShown = store.get('ollama.modelPromptShown', false) as boolean;
  
  if (state.modelPromptShown || persistedModelPromptShown) {
    console.log("Model prompt already shown, skipping");
    return;
  }
  
  try {
    // Check if Ollama is running
    try {
      const response = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
      const availableModels = response.data.models || [];
      
      // Convert model names to lowercase for case-insensitive comparison
      const modelNames = availableModels.map((model: { name: string }) => model.name.toLowerCase());
      
      // Check if the SudoSaturn/Shellper model is installed
      if (!modelNames.includes('shellper') && !modelNames.includes('sudosaturn/shellper')) {
        console.log("The Shellper model is not installed. Pulling the model...");
        
        // Mark that we've shown the model prompt for this session and persist it
        state.modelPromptShown = true;
        store.set('ollama.modelPromptShown', true);
        
        // Show a dialog informing the user
        app.whenReady().then(() => {
          const { dialog } = require('electron');
          dialog.showMessageBox({
            type: 'info',
            title: 'Downloading Shellper Model',
            message: 'Downloading the required Shellper model. This may take a few minutes...',
            buttons: ['OK']
          });
        });
        
        // Pull the Shellper model
        try {
          execSync('ollama pull SudoSaturn/Shellper', { stdio: 'inherit' });
          console.log("Successfully pulled the Shellper model");
          
          // Show success dialog
          app.whenReady().then(() => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'info',
              title: 'Model Downloaded',
              message: 'The Shellper model has been successfully downloaded and is ready to use.',
              buttons: ['OK']
            });
          });
        } catch (pullError) {
          console.error("Failed to pull the Shellper model:", pullError);
          
          // Show error dialog
          app.whenReady().then(() => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'error',
              title: 'Model Download Failed',
              message: 'Failed to download the Shellper model. Please try manually with:\n\nollama pull SudoSaturn/Shellper',
              buttons: ['OK']
            });
          });
        }
      } else {
        console.log("The Shellper model is already installed");
      }
    } catch (error) {
      console.warn("Could not check for installed models. Ollama service may not be running:", error);
    }
  } catch (error) {
    console.error("Error checking for the Shellper model:", error);
  }
}

// Function to install ImageMagick
async function installImageMagick() {
  try {
    // Check if Homebrew is installed
    execSync('which brew', { stdio: 'pipe' });
    
    // Show dialog asking user if they want to install ImageMagick
    app.whenReady().then(() => {
      const { dialog } = require('electron');
      const result = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Install ImageMagick',
        message: 'ImageMagick is required for optimal performance. Would you like to install it now?',
        buttons: ['Install', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (result === 0) {
        // Show installing dialog
        dialog.showMessageBox({
          type: 'info',
          title: 'Installing ImageMagick',
          message: 'Installing ImageMagick. This may take a few minutes...',
          buttons: ['OK']
        });
        
        // Install ImageMagick
        try {
          execSync('brew install imagemagick', { stdio: 'inherit' });
          
          // Show success dialog
          dialog.showMessageBox({
            type: 'info',
            title: 'Installation Complete',
            message: 'ImageMagick has been successfully installed.',
            buttons: ['OK']
          });
        } catch (installError) {
          console.error("Failed to install ImageMagick:", installError);
          
          // Show error dialog
          dialog.showMessageBox({
            type: 'error',
            title: 'Installation Failed',
            message: 'Failed to install ImageMagick. Please try manually with:\n\nbrew install imagemagick',
            buttons: ['OK']
          });
        }
      }
    });
  } catch (error) {
    // Homebrew not installed
    console.warn("Homebrew is not installed. Cannot automatically install ImageMagick");
    
    app.whenReady().then(() => {
      const { dialog } = require('electron');
      const result = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Homebrew Required',
        message: 'Homebrew is required to install ImageMagick automatically.\n\nPlease install Homebrew first from:\nhttps://brew.sh',
        buttons: ['Open Homebrew Website', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (result === 0) {
        shell.openExternal('https://brew.sh');
      }
    });
  }
}

// Dynamically import electron-store (ES Module)
async function initializeStore() {
  try {
    console.log("Attempting to dynamically import electron-store...");
    
    // Dynamically import electron-store
    const storeModule = await import('electron-store').catch(error => {
      console.error("Import error:", error);
      return null;
    });
    
    if (!storeModule || !storeModule.default) {
      console.error("Failed to import electron-store, using in-memory store as fallback");
      return;
    }
    
    try {
      // Use any to bypass TypeScript strict checking
      const Store = storeModule.default as any;
      
      // Create the electron store instance
      const electronStore = new Store({
        name: 'shellper-settings',
        defaults: {
          ollama: {
            promptShown: false,
            modelPromptShown: false
          }
        }
      });
      
      // Create a wrapper that implements our IStore interface
      store = {
        get: (key: string, defaultValue?: any) => {
          try {
            return electronStore.get(key, defaultValue);
          } catch (error) {
            console.error(`Error getting ${key} from store:`, error);
            return defaultValue;
          }
        },
        set: (key: string, value: any) => {
          try {
            electronStore.set(key, value);
          } catch (error) {
            console.error(`Error setting ${key} in store:`, error);
          }
        }
      };
      
      // Load saved values into state
      state.ollmaPromptShown = store.get('ollama.promptShown', false);
      state.modelPromptShown = store.get('ollama.modelPromptShown', false);
      
      console.log("Electron Store initialized successfully");
      console.log("Loaded persistence values:", {
        ollmaPromptShown: state.ollmaPromptShown,
        modelPromptShown: state.modelPromptShown
      });
    } catch (initError) {
      console.error("Failed to initialize electron-store:", initError);
      // Continue using the in-memory store as fallback
    }
  } catch (error) {
    console.error("Unexpected error initializing store:", error);
  }
}

// Export state and functions for other modules
export {
  state,
  createWindow,
  hideMainWindow,
  showMainWindow,
  toggleMainWindow,
  setWindowDimensions,
  moveWindowHorizontal,
  moveWindowVertical,
  getMainWindow,
  getView,
  setView,
  getScreenshotHelper,
  getProblemInfo,
  setProblemInfo,
  getScreenshotQueue,
  getExtraScreenshotQueue,
  clearQueues,
  takeScreenshot,
  getImagePreview,
  deleteScreenshot,
  setHasDebugged,
  getHasDebugged
}

app.whenReady().then(initializeApp)
