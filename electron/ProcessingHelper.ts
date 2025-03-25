// ProcessingHelper.ts
import fs from "node:fs"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import axios from "axios"
import { app } from "electron"
import { BrowserWindow } from "electron"
import path from "path"
import { exec, execSync } from "child_process"
import util from "util"

const isDev = !app.isPackaged
// Ollama API endpoint - LOCAL ONLY, no external network connection
// This is exclusively for local Ollama instance running on localhost
const OLLAMA_API_URL = "http://localhost:11434/api"
// Only use SudoSaturn/Shellper model
const OLLAMA_MODEL = "SudoSaturn/Shellper"
// Flag to determine if the model requires a prompt (shellper doesn't)
const MODEL_NO_PROMPT_NEEDED = ["shellper", "SudoSaturn/Shellper"];

// Helper functions for extracting fields when JSON parsing fails
// Add these functions before the ProcessingHelper class

function extractField(text: string, fieldName: string): string | null {
  const regex = new RegExp(`"?${fieldName}"?\\s*:\\s*"?(.*?)"?[,}]`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractExamples(text: string): any[] {
  const examples = [];
  
  // Try to find examples section
  const examplesMatch = text.match(/examples.*?:.*?\[(.*?)\]/is);
  if (examplesMatch && examplesMatch[1]) {
    try {
      // Try to parse examples array
      const examplesJson = JSON.parse(`[${examplesMatch[1]}]`);
      return examplesJson;
    } catch (e) {
      // Failed to parse JSON, continue with regex approach
    }
  }
  
  // Look for examples with regex
  const exampleMatches = text.matchAll(/example\s*\d*\s*:?\s*\n?input\s*:([^]*?)output\s*:([^]*?)(?:explanation\s*:([^]*?))?(?=example|\n\n|$)/gi);
  
  for (const match of exampleMatches) {
    examples.push({
      input: match[1]?.trim() || "",
      output: match[2]?.trim() || "",
      explanation: match[3]?.trim() || ""
    });
  }
  
  return examples.length > 0 ? examples : [{ input: "Example input", output: "Example output" }];
}

function extractList(text: string, fieldName: string): string[] {
  const regex = new RegExp(`"?${fieldName}"?\\s*:\\s*\\[(.*?)\\]`, 'is');
  const match = text.match(regex);
  
  if (match && match[1]) {
    try {
      // Try to parse as JSON array
      const list = JSON.parse(`[${match[1]}]`);
      return list;
    } catch (e) {
      // If parsing fails, split by commas
      return match[1].split(',').map(item => item.trim().replace(/^["']|["']$/g, ''));
    }
  }
  
  // If no match found, look for numbered or bulleted list
  const listRegex = new RegExp(`${fieldName}[^]*?(?:(?:\\d+[\\.\\)\\-]|[\\.\\*\\-])\\s*([^\\n]+))+`, 'i');
  const listMatch = text.match(listRegex);
  
  if (listMatch) {
    const listItems = text.match(/(?:\d+[\.\)\-]|[\.\*\-])\s*([^\n]+)/g);
    if (listItems) {
      return listItems.map(item => item.replace(/^\d+[\.\)\-]|[\.\*\-]\s*/, '').trim());
    }
  }
  
  return [];
}

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getLanguage(): Promise<string> {
    // Let shellper handle language detection automatically
    console.log("Using auto language detection from shellper model");
    return "auto";
  }

  public async processScreenshots(): Promise<void> {
    if (this.currentProcessingAbortController) {
      console.log("Already processing screenshots, aborting previous operation");
      this.currentProcessingAbortController.abort();
    }

    this.currentProcessingAbortController = new AbortController();
    const signal = this.currentProcessingAbortController.signal;

    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.log("Main window not available for processing");
      return;
    }

    try {
      // Get the screenshot queue
      const screenshotQueue = this.deps.getScreenshotQueue();
      console.log(`Screenshot queue: ${JSON.stringify(screenshotQueue)}`);

      if (!screenshotQueue.length) {
        console.log("No screenshots to process");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS
        );
        return;
      }

      // Notify that processing has started
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START);

      // Array to gather screenshots and text from OCR
      const screenshotDataArray = [];

      // Process each screenshot with OCR
      for (const path of screenshotQueue) {
        console.log(`Processing screenshot: ${path}`);
        
        // Get the original screenshot path (from the normalized path)
        // The normalized paths are in /normalized/ directory, while originals are in /screenshots/
        const originalPath = path.replace('/normalized/', '/screenshots/');
        console.log(`Using original screenshot path for OCR: ${originalPath}`);
        
        // Verify original exists
        if (!fs.existsSync(originalPath)) {
          console.log(`Original screenshot not found at ${originalPath}, using normalized path`);
          // Fallback to normalized if original not found
          const { createWorker } = require('tesseract.js');
          const worker = await createWorker('eng');
          console.log(`Performing OCR on: ${path}`);
          
          // Configure parameters that can be set after initialization
          await worker.setParameters({
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:(){}[]<>=+-*/\\\'"`_|&$#@!?% \t\n',
            tessedit_pageseg_mode: '6', // Assume single uniform block of text
            preserve_interword_spaces: '1'
          });
          
          const { data: { text } } = await worker.recognize(path);
          console.log(`OCR extracted text (first 100 chars): ${text.substring(0, 100)}...`);
          
          await worker.terminate();
          
          // Add the extracted text to our array
          screenshotDataArray.push({ path, data: text });
        } else {
          // Use the original screenshot for better OCR results
          console.log(`Original screenshot found, size: ${fs.statSync(originalPath).size} bytes`);
          const { createWorker } = require('tesseract.js');
          const worker = await createWorker('eng');
          console.log(`Performing OCR on original: ${originalPath}`);
          
          // Configure parameters that can be set after initialization
          await worker.setParameters({
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:(){}[]<>=+-*/\\\'"`_|&$#@!?% \t\n',
            tessedit_pageseg_mode: '6', // Assume single uniform block of text
            preserve_interword_spaces: '1'
          });
          
          const { data: { text } } = await worker.recognize(originalPath);
          console.log(`OCR extracted text from original (first 100 chars): ${text.substring(0, 100)}...`);
          
          await worker.terminate();
          
          // Add the extracted text to our array
          screenshotDataArray.push({ path: originalPath, data: text });
        }
      }
      
      // Now convert the array of OCR results into a combined text for analysis
      let combinedText = screenshotDataArray.map(item => item.data).join('\n\n');
      
      // Use the shellper model to analyze the OCR text - no prompt needed
      const modelInfo = { name: OLLAMA_MODEL, requiresPrompt: false };
      
      // Create the request payload without any prompt
      const requestPayload = {
        model: modelInfo.name,
        prompt: combinedText, // Just pass the OCR text directly without any system prompt
        stream: false,
        options: {
          temperature: 0.1
        }
      };

      // Call Ollama API to generate the structured analysis
      console.log("Sending OCR text to Ollama for analysis");
      const response = await axios.post(
        `${OLLAMA_API_URL}/generate`,
        requestPayload,
        {
          signal,
          timeout: 90000 // 90 second timeout
        }
      );

      const responseText = response.data.response;
      console.log(`Got analysis response (first 100 chars): ${responseText.substring(0, 100)}...`);

      // First try to parse as JSON, but handle raw text responses gracefully
      let problemInfo;
      try {
        // Try to extract JSON from the response
        problemInfo = this.extractJSONFromResponse(responseText);
        
        // If no valid JSON found, create a structured object from the raw text
        if (!problemInfo) {
          console.log("No valid JSON found in response, creating structured object from raw text");
          
          // Extract information from the raw text
          const title = this.extractTitle(responseText) || "Code Analysis";
          const description = this.extractDescription(responseText) || responseText;
          const code = this.extractCodeBlocks(responseText) || "";
          
          // Create a structured problem info object
          problemInfo = {
            title: title,
            description: description,
            code: code,
            examples: extractExamples(responseText),
            constraints: extractList(responseText, "constraints"),
            function_signature: extractField(responseText, "function_signature") || "",
            original_problem: responseText
          };
          
          console.log("Successfully created problem info from raw text");
        } else {
          console.log("Successfully parsed JSON from response");
        }
        
        // Notify about the extracted problem
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );
        
        // Store the problem info for later use
        this.deps.setProblemInfo(problemInfo);
        
        // Change view to solutions
        this.deps.setView("solutions");
        
        // Generate solutions
        await this.generateSolutionsHelper(signal);
      } catch (error) {
        console.error("Error processing response:", error);
        
        // Create a very basic representation as last resort
        const title = "Code Analysis";
        const description = responseText.substring(0, 1000); // First 1000 chars as description
        
        const problemInfo = {
          title: title,
          description: description,
          code: "",
          examples: [],
          constraints: [],
          function_signature: "",
          original_problem: responseText
        };
        
        console.log("Created basic problem representation as fallback");
        
        // Notify and store
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );
        
        this.deps.setProblemInfo(problemInfo);
        this.deps.setView("solutions");
        
        // Generate solutions
        await this.generateSolutionsHelper(signal);
      }
    } catch (error) {
      console.error("Error in processScreenshots:", error);
      
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error.message
        );
      }
    }
  }

  // Helper method to extract JSON from response text
  private extractJSONFromResponse(text: string): any {
    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Error parsing JSON match:", e);
        return null;
      }
    }
    return null;
  }

  // Helper method to extract title from text
  private extractTitle(text: string): string | null {
    // Try to extract a title from the text
    const titleRegex = /(?:Title:|Problem:|Question:|Exercise:)\s*([^\n]+)/i;
    const match = text.match(titleRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // If no explicit title, look for header-like text at the beginning
    const lines = text.split('\n');
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      if (line && line.length < 100 && line.length > 10) {
        return line;
      }
    }
    
    return null;
  }

  // Helper method to extract description from text
  private extractDescription(text: string): string | null {
    // Try to extract a description section
    const descRegex = /(?:Description:|Problem Statement:|Instructions:)\s*([^]*?)(?=Examples:|Input:|Output:|Constraints:|Code:|Function|$)/is;
    const match = text.match(descRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // If no explicit description, take the text up to the first code block or examples
    const codeIndex = text.indexOf('```');
    const examplesIndex = text.search(/Examples:|Example \d+:|Input:|Output:/i);
    
    let endIndex = text.length;
    if (codeIndex > 0) endIndex = Math.min(endIndex, codeIndex);
    if (examplesIndex > 0) endIndex = Math.min(endIndex, examplesIndex);
    
    // Take the first portion of the text, but not too much
    return text.substring(0, endIndex).trim();
  }

  // Helper method to extract code blocks from text
  private extractCodeBlocks(text: string): string {
    const codeBlockRegex = /```(?:[\w\-+.]+)?\s*([^]*?)```/gs;
    const matches = Array.from(text.matchAll(codeBlockRegex));
    
    if (matches.length > 0) {
      // Join all code blocks with separators
      return matches.map(match => match[1].trim()).join('\n\n');
    }
    
    // If no code blocks with markdown syntax, look for indented code
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeBlocks = [];
    let currentBlock = [];
    
    for (const line of lines) {
      const isIndented = line.startsWith('    ') || line.startsWith('\t');
      const looksCodish = /[{};=\[\]<>]/.test(line);
      
      if (isIndented || looksCodish) {
        if (!inCodeBlock) {
          inCodeBlock = true;
        }
        currentBlock.push(line);
      } else if (inCodeBlock && line.trim() === '') {
        // Empty line within code block
        currentBlock.push(line);
      } else if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        if (currentBlock.length > 1) {
          codeBlocks.push(currentBlock.join('\n'));
        }
        currentBlock = [];
      }
    }
    
    // Add the last block if we ended in a code block
    if (inCodeBlock && currentBlock.length > 1) {
      codeBlocks.push(currentBlock.join('\n'));
    }
    
    return codeBlocks.join('\n\n');
  }

  public async processExtraScreenshots(): Promise<void> {
    this.cancelOngoingRequests();

    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.log("Main window not available for processing extra screenshots");
      return;
    }

    try {
      // Wait for app to initialize
      await this.waitForInitialization(mainWindow);

      // Get screenshots from extra queue
      const extraScreenshots = this.screenshotHelper?.getExtraScreenshotQueue() || [];
      
      console.log("Processing extra screenshots:", extraScreenshots);

      if (!extraScreenshots || extraScreenshots.length === 0) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          "No extra screenshots to process. Please take additional screenshots first."
        );
        return;
      }

      // Create controller for cancelling requests
      this.currentExtraProcessingAbortController = new AbortController();
      
      // Begin processing
      console.log("Processing extra screenshots:", extraScreenshots);
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.DEBUG_START
      );

      // Convert screenshots to base64
      const screenshotsData = await Promise.all(
        extraScreenshots.map(async (screenshotPath) => {
          try {
            const data = fs.readFileSync(screenshotPath, "base64");
            return { path: screenshotPath, data };
          } catch (err) {
            console.error(`Error reading extra screenshot ${screenshotPath}:`, err);
            return { path: screenshotPath, data: "" };
          }
        })
      );

      // Process extra screenshots
      await this.processExtraScreenshotsHelper(
        screenshotsData.filter((s) => s.data), // Filter out any with empty data
        this.currentExtraProcessingAbortController.signal
      );

      console.log("Extra screenshot processing complete");
    } catch (error) {
      console.error("Error in processExtraScreenshots:", error);
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          error?.message || "Unknown error processing extra screenshots"
        );
      }
    } finally {
      this.currentExtraProcessingAbortController = null;
    }
  }

  private async normalizeImage(inputPath: string): Promise<string> {
    try {
      console.log(`Normalizing image: ${inputPath}`);
      
      // Create the target filename in the normalized directory
      const normalizedDir = ScreenshotHelper.getNormalizedDir();
      const filename = path.basename(inputPath);
      const normalizedPath = path.join(normalizedDir, filename);
      
      // If file already exists in normalized directory, return its path
      if (fs.existsSync(normalizedPath)) {
        console.log(`Image already normalized: ${normalizedPath}`);
        return normalizedPath;
      }
      
      console.log(`Normalizing to: ${normalizedPath}`);
      
      try {
        // Enhanced image normalization specifically for text and code OCR
        console.log('Applying text/code-optimized image processing with ImageMagick...');
        
        // First, check the input image dimensions
        const { stdout: dimensions } = await util.promisify(exec)(`magick identify -format "%wx%h" "${inputPath}"`);
        console.log(`Original image dimensions: ${dimensions}`);
        
        // Parse dimensions
        const [width, height] = dimensions.split('x').map(Number);
        
        // Specialized text processing for OCR
        // Text-specific preprocessing for better OCR results
        // 1. Convert to grayscale (better for text)
        // 2. Increase contrast to make text more defined
        // 3. Sharpen to enhance character edges
        // 4. Apply threshold to binarize text (black text on white background)
        
        const targetSize = 1600; // Larger size for better text detail preservation
        
        if (width <= targetSize && height <= targetSize) {
          // For smaller images, enhance for OCR without resizing
          execSync(`magick "${inputPath}" -colorspace gray -auto-level -sharpen 0x1.2 -contrast-stretch 0%x25% -despeckle "${normalizedPath}"`);
        } else {
          // For larger images, resize while optimizing for text readability
          execSync(`magick "${inputPath}" -resize ${targetSize}x${targetSize} -colorspace gray -auto-level -sharpen 0x1.5 -contrast-stretch 0%x30% -despeckle "${normalizedPath}"`);
        }
        
        // Verify the normalized image exists
        if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).size > 0) {
          console.log(`Image optimized for text/code OCR: ${normalizedPath}`);
          return normalizedPath;
        } else {
          throw new Error('Normalized image file does not exist or is empty');
        }
      } catch (magickError) {
        console.error('ImageMagick normalization failed:', magickError);
        console.log('Falling back to basic image processing...');
        
        try {
          // Simpler fallback processing
          execSync(`magick "${inputPath}" -resize 1000x1000 -colorspace gray -contrast -sharpen 0x1.0 "${normalizedPath}"`);
          console.log(`Applied simplified image processing: ${normalizedPath}`);
          return normalizedPath;
        } catch (fallbackError) {
          console.error('Fallback image processing failed:', fallbackError);
          console.log('Copying original image as last resort...');
          
          // Last resort: copy the original
          fs.copyFileSync(inputPath, normalizedPath);
          console.log(`Image copied to normalized path: ${normalizedPath}`);
          return normalizedPath;
        }
      }
    } catch (error) {
      console.error("Error in image normalization:", error);
      return inputPath; // Return original if normalization fails
    }
  }

  private async checkOllamaModels(): Promise<{name: string, requiresPrompt: boolean}> {
    try {
      console.log("Checking if local Ollama models are available...");
      
      try {
        const response = await axios.get(`${OLLAMA_API_URL}/tags`);
        const availableModels = response.data.models.map(model => model.name) || [];
        
        console.log("Available local Ollama models:", availableModels);
        
        // Check specifically for the SudoSaturn/Shellper model (case insensitive)
        const hasModel = availableModels.some(model => 
          model.toLowerCase() === OLLAMA_MODEL.toLowerCase() || 
          model.toLowerCase().startsWith(`${OLLAMA_MODEL.toLowerCase()}:`)
        );
        
        if (hasModel) {
          console.log(`Using local ${OLLAMA_MODEL} model`);
          
          const requiresPrompt = !MODEL_NO_PROMPT_NEEDED.includes(OLLAMA_MODEL);
          return { name: OLLAMA_MODEL, requiresPrompt };
        } else {
          console.log(`Local ${OLLAMA_MODEL} model not available, please run 'ollama pull ${OLLAMA_MODEL}'`);
          
          // Attempt to pull the model automatically if not found
          try {
            console.log(`Attempting to pull ${OLLAMA_MODEL} model...`);
            const { execSync } = require('child_process');
            execSync(`ollama pull ${OLLAMA_MODEL}`, { stdio: 'inherit' });
            console.log(`Successfully pulled ${OLLAMA_MODEL} model`);
            return { name: OLLAMA_MODEL, requiresPrompt: false };
          } catch (pullError) {
            console.error(`Failed to pull ${OLLAMA_MODEL} model:`, pullError);
          }
        }
      } catch (error) {
        console.error("Error checking local Ollama models:", error);
      }
      
      // Default to using shellper model even if it's not confirmed to be available
      return { name: OLLAMA_MODEL, requiresPrompt: false };
    } catch (error) {
      console.error("Error checking for Ollama models:", error);
      return { name: OLLAMA_MODEL, requiresPrompt: false };
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      if (signal.aborted) {
        console.log("Processing was aborted before it started")
        return { success: false, error: "Processing was aborted" }
      }

      console.log("============ PROCESSING SCREENSHOTS ============");
      console.log(`Starting to process ${screenshots.length} screenshots`);

      // Get the main window and check if it's available
        const mainWindow = this.deps.getMainWindow()
      if (!mainWindow) {
        console.warn("Main window not available")
        return { success: false, error: "Main window not available" }
      }

      // Process each screenshot
      for (const screenshot of screenshots) {
        if (signal.aborted) {
          console.log("Processing was aborted during screenshot processing")
          return { success: false, error: "Processing was aborted" }
        }

        // Get the original path
        const { path } = screenshot
        console.log(`=========== PROCESSING SCREENSHOT: ${path} ===========`);
        console.log(`Original screenshot path: ${path}`);
        console.log(`Original screenshot exists: ${fs.existsSync(path)}`);
        console.log(`Original screenshot size: ${fs.existsSync(path) ? fs.statSync(path).size : 'N/A'} bytes`);
        
        // Also create normalized version for UI display if needed
        const normalizedPath = await this.normalizeImage(path);
        console.log(`Normalized version created at: ${normalizedPath} (but will not be used for OCR)`);
        console.log(`Normalized version exists: ${fs.existsSync(normalizedPath)}`);
        console.log(`Normalized version size: ${fs.existsSync(normalizedPath) ? fs.statSync(normalizedPath).size : 'N/A'} bytes`);
        
        // Read the ORIGINAL image file for OCR
        console.log('Reading original image for better text extraction...');
        const imageBase64 = await fs.promises.readFile(path, { encoding: 'base64' });
        console.log(`Original image read successfully, base64 length: ${imageBase64.length}`);
        
        // Perform enhanced OCR on the ORIGINAL screenshot using Tesseract.js with code optimizations
        console.log('Performing specialized OCR for code recognition on original image...');
        const { createWorker } = require('tesseract.js');
        
        const worker = await createWorker('eng');
        console.log('Tesseract worker created');
        
        // Configure parameters that can be set after initialization
        await worker.setParameters({
          tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:(){}[]<>=+-*/\\\'"`_|&$#@!?% \t\n',
          tessedit_pageseg_mode: '6', // Assume single uniform block of text
          preserve_interword_spaces: '1'
        });
        
        console.log('Running OCR on original image...');
        const { data: { text } } = await worker.recognize(path);
        console.log(`OCR completed, extracted ${text.length} characters`);
        console.log('OCR extracted text from original (first 300 chars):', text.substring(0, 300));
        
        await worker.terminate();
        console.log('Tesseract worker terminated');
        
        // Clean up OCR results to improve code formatting
        const cleanedText = this.cleanCodeText(text);
        console.log(`Cleaned text has ${cleanedText.length} characters`);
        console.log('Cleaned text (first 300 chars):', cleanedText.substring(0, 300));
        
        // Process the image with the local Ollama API - no prompt, just send the image
        // We'll use the original image here as well for better results
        const payload = {
          model: OLLAMA_MODEL,
          images: [imageBase64], // Send the original image directly
          stream: false,
        };
        
        console.log(`Sending original image to local Ollama API...`);
        try {
          // This API call is to localhost only - no external network connection
          const response = await axios.post(`${OLLAMA_API_URL}/generate`, payload);
          console.log('Local Ollama API response received');
          const responseText = response.data.response;
          console.log(`Response contains ${responseText.length} characters`);
          console.log('Response (first 300 chars):', responseText.substring(0, 300));
          
          // Extract structured data from the response
          const title = this.extractTitle(responseText) || "Code Analysis";
          const description = this.extractDescription(responseText) || responseText;
          const code = this.extractCodeBlocks(responseText);
          
          console.log(`Extracted title: ${title}`);
          console.log(`Extracted description length: ${description.length} chars`);
          console.log(`Extracted code length: ${code ? code.length : 0} chars`);
          
          // Create a problem info object
          const problemInfo = {
            title: title,
            description: description,
            code: code || "",
                examples: [],
                constraints: [],
                function_signature: "",
                original_problem: responseText
          };
          
          // Set the problem info in the app state
          this.deps.setProblemInfo(problemInfo);
          console.log('Problem info set successfully');
          
          // Notify the UI
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
              problemInfo
          );
          console.log('UI notified with problem info');
          
          // Continue with solution generation
          console.log('Moving to solution generation...');
          return await this.generateSolutionsHelper(signal);
        } catch (apiError) {
          console.error('Error calling local Ollama API:', apiError);
          throw apiError;
        }
      }
    } catch (error) {
      console.error("Error in processScreenshotsHelper:", error);
      return { success: false, error: error.message };
    }
  }
  
  // Helper method to clean OCR results for code
  private cleanCodeText(text: string): string {
    // Remove random non-ASCII characters that often appear in OCR results
    let cleaned = text.replace(/[^\x00-\x7F]+/g, '');
    
    // Fix common OCR code errors
    cleaned = cleaned.replace(/＝/g, '=');  // Replace full-width equals with standard equals
    cleaned = cleaned.replace(/［/g, '[');  // Replace full-width brackets
    cleaned = cleaned.replace(/］/g, ']');
    cleaned = cleaned.replace(/（/g, '(');  // Replace full-width parentheses
    cleaned = cleaned.replace(/）/g, ')');
    cleaned = cleaned.replace(/；/g, ';');  // Replace full-width semicolon
    cleaned = cleaned.replace(/：/g, ':');  // Replace full-width colon
    cleaned = cleaned.replace(/，/g, ',');  // Replace full-width comma
    
    // Fix common indentation issues
    const lines = cleaned.split('\n');
    
    // Look for common indentation patterns
    const indentationMatch = lines.join('\n').match(/^( {2,4}|\t)+/m);
    const commonIndent = indentationMatch ? indentationMatch[0].length : 2;
    
    // Process each line
    const processedLines = lines.map(line => {
      // Fix space-mangled indentation
      const leadingSpaces = line.match(/^[ ]+/);
      if (leadingSpaces) {
        const spaceCount = leadingSpaces[0].length;
        const indentLevel = Math.round(spaceCount / commonIndent);
        return ' '.repeat(indentLevel * commonIndent) + line.trimLeft();
      }
      return line;
    });
    
    return processedLines.join('\n');
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    if (signal.aborted) return;

    console.log("Generating solutions");
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.log("Main window not available for generating solutions");
      return;
    }

    try {
      // Get problem info from window
      const problemInfo = this.deps.getProblemInfo();
      if (!problemInfo) {
        console.log("No problem info available");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, 
          "No problem information available. Please process screenshots first.");
        return;
      }

      // Auto-detect language
      const language = await this.getLanguage();
      console.log("Auto-detected language:", language);

      // Use the shellper model
      console.log("Generating solution for problem:", problemInfo.title);
      console.log("Using model:", OLLAMA_MODEL);

      // Create problem statement with minimal context - just the essential information
      const minimalContext = {
        title: problemInfo.title,
        description: problemInfo.description,
        code: problemInfo.code,
        // Let the model auto-detect the language
      };
      
      // Pass just the minimal context as JSON
      const contextJson = JSON.stringify(minimalContext);

      // Create API request with just the problem context and no prompt
      const response = await axios.post(
        `${OLLAMA_API_URL}/generate`,
        {
          model: OLLAMA_MODEL,
          prompt: contextJson, // Just pass the context, no system prompt
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 2048
          }
        },
        {
          signal,
          timeout: 180000 // 180 second timeout
        }
      );

      // Extract response
      let generatedSolution = response.data.response;

      // Remove "My Thoughts" section from the response
      generatedSolution = this.removeMyThoughtsSection(generatedSolution);

      // Send solution to renderer
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS, {
        solution: generatedSolution,
        language,
        problem: problemInfo
      });

      // Set view to solutions
      this.deps.setView("solutions");
    } catch (error) {
      if (signal.aborted) {
        console.log("Solution generation aborted");
        return;
      }

      console.error("Error generating solutions:", error);
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error?.response?.data?.error || error.message || "Unknown error"
        );
      }
    }
  }
  
  // Helper method to remove "My Thoughts" section from the solution
  private removeMyThoughtsSection(solution: string): string {
    console.log("[DEBUG] Removing 'My Thoughts' sections from solution");
    
    // Match common patterns for "My Thoughts" sections
    const myThoughtsPatterns = [
      /# My Thoughts[\s\S]*?(?=# |## |$)/i,
      /## My Thoughts[\s\S]*?(?=# |## |$)/i,
      /My Thoughts:[\s\S]*?(?=\n\n|$)/i,
      /My Analysis:[\s\S]*?(?=\n\n|$)/i,
      /My Approach:[\s\S]*?(?=\n\n|$)/i,
      /Thoughts:[\s\S]*?(?=\n\n|$)/i,
      /Problem Understanding:[\s\S]*?(?=\n\n|$)/i,
      /Problem Analysis:[\s\S]*?(?=\n\n|$)/i
    ];
    
    // Replace all matching patterns
    let cleanedSolution = solution;
    for (const pattern of myThoughtsPatterns) {
      const beforeLength = cleanedSolution.length;
      cleanedSolution = cleanedSolution.replace(pattern, '');
      if (beforeLength !== cleanedSolution.length) {
        console.log("[DEBUG] Removed a 'My Thoughts' section matching pattern:", pattern);
      }
    }
    
    // Trim any excess whitespace that might have been left
    cleanedSolution = cleanedSolution.trim();
    
    console.log("[DEBUG] Solution cleaning complete");
    return cleanedSolution;
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    if (signal.aborted) return;

    console.log("Processing extra screenshots");
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.log("Main window not available for processing extra screenshots");
      return;
    }

    try {
      // Get the current problem info
      const currentProblemInfo = this.deps.getProblemInfo();
      if (!currentProblemInfo) {
        console.log("No problem info available");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          "No problem information available to enhance."
        );
        return;
      }

      // Process each screenshot individually
      const extraInfoResults = [];
      for (let i = 0; i < screenshots.length; i++) {
        const { path, data } = screenshots[i];
        console.log(`Processing extra screenshot ${i + 1} of ${screenshots.length}: ${path}`);

        // Normalize image
        const normalizedPath = await this.normalizeImage(path);
        const imageData = fs.readFileSync(normalizedPath, { encoding: "base64" });

        // Create the request payload for shellper model - no prompt
        const requestPayload = {
          model: OLLAMA_MODEL,
          images: [imageData], // Just send the image
          stream: false,
          options: {
            temperature: 0.1
          }
        };

        // Call Ollama API to analyze the extra screenshot
        console.log(`Analyzing extra screenshot ${i + 1}`);
        const response = await axios.post(
          `${OLLAMA_API_URL}/generate`,
          requestPayload,
        {
          signal,
            timeout: 90000 // 90 second timeout
          }
        );

        // Extract and store the relevant information
        const analysisResult = response.data.response;
        extraInfoResults.push({
          path: normalizedPath,
          analysis: analysisResult
        });
        console.log(`Got analysis for extra screenshot ${i + 1}`);
      }

      // Combine all results
      const combinedExtraInfo = extraInfoResults.map(info => info.analysis).join("\n\n");
      
      // Update the problem info with the extra information
      const updatedProblemInfo = {
        ...currentProblemInfo,
        extraInfo: combinedExtraInfo
      };
      
      // Store the updated problem info
      this.deps.setProblemInfo(updatedProblemInfo);
      
      // Send success event
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
        updatedProblemInfo
      );
    } catch (error) {
      if (signal.aborted) {
        console.log("Extra screenshot processing aborted");
        return;
      }

      console.error("Error processing extra screenshots:", error);
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          error?.response?.data?.error || error.message || "Error processing extra screenshots"
        );
      }
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    // Reset hasDebugged flag
    this.deps.setHasDebugged(false)

    // Clear any pending state
    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      // Send a clear message that processing was cancelled
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}
