// ScreenshotHelper.ts

import path from 'path';
import fs from 'fs';
import { app, screen } from 'electron';
import { exec, execSync } from 'child_process';
import { PathUtils } from './path-utils';
import { v4 as uuidv4 } from "uuid"
import util from 'util';

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 2
  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string
  private view: "queue" | "solutions" | "debug" = "queue"

  constructor(view: "queue" | "solutions" | "debug" = "queue") {
    this.view = view

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true })
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir, { recursive: true })
    }
  }

  public getView(): "queue" | "solutions" | "debug" {
    return this.view
  }

  public setView(view: "queue" | "solutions" | "debug"): void {
    console.log("Setting view in ScreenshotHelper:", view)
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue
  }

  public addToScreenshotQueue(filepath: string): void {
    // Prevent duplicates
    if (!this.screenshotQueue.includes(filepath)) {
      console.log(`Adding to ${this.view === "queue" ? "main" : "extra"} screenshot queue: ${filepath}`)
      
      if (this.view === "queue") {
        // When in queue view, add to main queue
        // If at max capacity, remove oldest
        if (this.screenshotQueue.length >= this.MAX_SCREENSHOTS) {
          const oldestScreenshot = this.screenshotQueue.shift()
          if (oldestScreenshot) {
            console.log(`Queue at capacity, removing oldest screenshot: ${oldestScreenshot}`)
          }
        }
        this.screenshotQueue.push(filepath)
      } else {
        // When in solutions view, add to extra queue
        this.extraScreenshotQueue.push(filepath)
      }
    } else {
      console.log(`Screenshot already in queue: ${filepath}`)
    }
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  static getScreenshotsDir(): string {
    const userDataPath = app.getPath('userData');
    const dir = path.join(userDataPath, 'screenshots');
    
    // Ensure directory exists
    PathUtils.ensureDirectoryExists(dir);
    
    return dir;
  }
  
  static getNormalizedDir(): string {
    const userDataPath = app.getPath('userData');
    const dir = path.join(userDataPath, 'normalized');
    
    // Ensure directory exists
    PathUtils.ensureDirectoryExists(dir);
    
    return dir;
  }

  static async takeScreenshot(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    // Create a unique filename for the screenshot
    const uniqueId = uuidv4();
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `screenshot-${timestamp}-${uniqueId}.png`;
    const outputPath = path.join(this.getScreenshotsDir(), filename);
    
    let success = false;
    let error = null;
    
    try {
      // For macOS - Take full-screen screenshot with no user interaction
      console.log("Taking automatic macOS full-screen screenshot...");
      
      // Use screencapture without any flags for selection - just capture entire screen
      // -x prevents screenshot sound
      const cmd = `screencapture -x "${outputPath}"`;
      console.log(`Executing command: ${cmd}`);
      
      // Execute the command and wait for it to complete
      try {
        await new Promise((resolve, reject) => {
          exec(cmd, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              console.error(`Screenshot capture error: ${error.message}`);
              reject(error);
            } else {
              if (stderr) console.log(`Command stderr: ${stderr}`);
              console.log(`Screenshot command completed successfully`);
              resolve(stdout);
            }
          });
        });
        
        // Check if the file was created successfully
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          console.log(`Screenshot file exists: ${outputPath}, Size: ${stats.size} bytes`);
          
          if (stats.size > 0) {
            console.log(`Screenshot saved successfully to ${outputPath}`);
            
            // Normalize the image
            const normalizedPath = await ScreenshotHelper.normalizeImage(outputPath);
            success = true;
            return { 
              success: true, 
              filePath: normalizedPath 
            };
          } else {
            error = "Screenshot file is empty (0 bytes)";
            console.error(error);
          }
        } else {
          error = "Screenshot file was not created";
          console.error(error);
        }
      } catch (execErr) {
        console.error(`Error executing screenshot command:`, execErr);
        error = execErr.message;
      }
      
      // If we get here, something went wrong
      return { 
        success: false, 
        error: error || "Unknown error taking screenshot" 
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Screenshot capture failed: ${errorMessage}`);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }
  
  static async normalizeImage(inputPath: string): Promise<string> {
    try {
      console.log(`Normalizing image: ${inputPath}`);
      
      // Create the target filename in the normalized directory
      const normalizedDir = this.getNormalizedDir();
      const filename = path.basename(inputPath);
      const normalizedPath = path.join(normalizedDir, filename);
      
      // If file already exists in normalized directory, return its path
      if (fs.existsSync(normalizedPath)) {
        console.log(`Image already normalized: ${normalizedPath}`);
        return normalizedPath;
      }
      
      console.log(`Normalizing to: ${normalizedPath}`);
      
      try {
        // Improved image normalization to preserve text quality
        console.log('Attempting to normalize with ImageMagick...');
        
        // First, check the input image dimensions
        const { stdout: dimensions } = await util.promisify(exec)(`magick identify -format "%wx%h" "${inputPath}"`);
        console.log(`Original image dimensions: ${dimensions}`);
        
        // Parse dimensions
        const [width, height] = dimensions.split('x').map(Number);
        
        // If the image is already smaller than our target size, don't upscale
        const targetSize = 896;
        
        if (width <= targetSize && height <= targetSize) {
          // Image is already small enough, just center it on a white canvas
          execSync(`magick "${inputPath}" -background white -gravity center -extent ${targetSize}x${targetSize} "${normalizedPath}"`);
        } else {
          // For larger images, use high-quality resizing with text sharpening
          execSync(`magick "${inputPath}" -resize ${targetSize}x${targetSize} -background white -gravity center -extent ${targetSize}x${targetSize} -sharpen 0x1.0 -quality 100 "${normalizedPath}"`);
        }
        
        // Verify the normalized image exists
        if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).size > 0) {
          console.log(`Image normalized successfully: ${normalizedPath}`);
          return normalizedPath;
        } else {
          throw new Error('Normalized image file does not exist or is empty');
        }
      } catch (magickError) {
        console.error('ImageMagick normalization failed:', magickError);
        console.log('Falling back to copying original image...');
        
        // Fallback: Copy the original image to the normalized path
        fs.copyFileSync(inputPath, normalizedPath);
        console.log(`Image copied to normalized path: ${normalizedPath}`);
        return normalizedPath;
      }
    } catch (error) {
      console.error('Error in normalizeImage:', error);
      // Return the original path if normalization fails
      return inputPath;
    }
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.promises.unlink(path)
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: error.message }
    }
  }

  public clearExtraScreenshotQueue(): void {
    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }
}

