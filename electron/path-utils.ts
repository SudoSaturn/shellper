import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Path utilities for resolving file paths in both development and production environments
 */
export class PathUtils {
  /**
   * Get the base directory for the application resources
   * In development: project root
   * In production: either app.getAppPath() or process.resourcesPath
   */
  static getBaseDir(): string {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      return process.cwd();
    }
    
    // Try multiple approaches for production
    const resourcesPath = process.resourcesPath || 
                         (app ? app.getAppPath() : null) || 
                         path.join(__dirname, '..');
    
    console.log(`Base directory resolved as: ${resourcesPath}`);
    return resourcesPath;
  }

  /**
   * Resolve a path relative to the base directory
   * @param relativePath - Path relative to the base directory
   */
  static resolvePathFromBase(relativePath: string): string {
    const baseDir = this.getBaseDir();
    const fullPath = path.join(baseDir, relativePath);
    
    console.log(`Resolved path: ${relativePath} -> ${fullPath}`);
    return fullPath;
  }

  /**
   * Resolve a path for app assets that works in both dev and prod
   * @param assetPath - Path relative to the assets or public directory
   */
  static resolveAssetPath(assetPath: string): string {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      return path.join(process.cwd(), 'public', assetPath);
    }
    
    // For production, check multiple possible locations
    const possiblePaths = [
      path.join(this.getBaseDir(), 'dist', assetPath),
      path.join(this.getBaseDir(), 'public', assetPath),
      path.join(this.getBaseDir(), 'assets', assetPath),
      path.join(path.dirname(this.getBaseDir()), 'dist', assetPath)
    ];
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        console.log(`Asset found at: ${testPath}`);
        return testPath;
      }
    }
    
    console.warn(`Asset not found: ${assetPath}, using fallback path`);
    return path.join(this.getBaseDir(), 'dist', assetPath);
  }

  /**
   * Verify that a path exists and is accessible
   * @param filePath - Path to verify
   * @returns boolean indicating if path exists and is accessible
   */
  static verifyPath(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      console.warn(`Path verification failed for: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Create a directory if it doesn't exist
   * @param dirPath - Directory path to create
   * @returns boolean indicating success
   */
  static ensureDirectoryExists(dirPath: string): boolean {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
      return true;
    } catch (error) {
      console.error(`Failed to create directory: ${dirPath}`, error);
      return false;
    }
  }

  /**
   * Get the HTML file path for the main window
   * Handles both development and production environments
   */
  static getHtmlPath(): string {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      return 'http://localhost:54321/';
    }
    
    // For production, check multiple possible locations including ASAR paths
    const possiblePaths = [
      path.join(this.getBaseDir(), 'dist', 'index.html'),
      path.join(this.getBaseDir(), 'app.asar', 'dist', 'index.html'),
      path.join(this.getBaseDir(), '..', 'app.asar', 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(__dirname, '../dist/index.html'),
      path.join(path.dirname(this.getBaseDir()), 'dist', 'index.html')
    ];
    
    for (const testPath of possiblePaths) {
      if (this.verifyPath(testPath)) {
        return testPath;
      }
    }
    
    // Attempt to find the ASAR path if all other paths fail
    // Check if we're in an ASAR archive
    const appPath = app.getAppPath();
    if (appPath.includes('app.asar')) {
      return path.join(appPath, 'dist', 'index.html');
    }
    
    // Final fallback
    return path.join(app.getAppPath(), 'dist', 'index.html');
  }
} 