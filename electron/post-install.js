/**
 * Post-install script for the ShellPer application
 * This script runs after installation from DMG to correct common issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// This function will be called by electron-builder's afterPack hook
module.exports = function(context) {
  console.log('Running post-installation setup...');
  
  // Get paths from context if available (when called as afterPack hook)
  let appOutDir, resourcesPath, appPath;
  
  if (context && context.appOutDir) {
    // Running as afterPack hook
    appOutDir = context.appOutDir;
    resourcesPath = path.join(appOutDir, 'Contents/Resources');
    appPath = appOutDir;
    console.log('Running in afterPack hook context');
  } else {
    // Running as standalone script
    appOutDir = process.env.APP_OUT_DIR || process.cwd();
    resourcesPath = path.join(appOutDir, 'Resources');
    appPath = appOutDir;
    console.log('Running as standalone script');
  }

  // Log paths for debugging
  console.log(`App Path: ${appPath}`);
  console.log(`Resources Path: ${resourcesPath}`);

  // Fix permissions for the app folders
  try {
    console.log('Setting correct permissions for application folders...');
    
    if (process.platform === 'darwin') {
      // On macOS
      try {
        execSync(`chmod -R 755 "${appPath}"`, { stdio: 'inherit' });
        console.log('Permissions updated successfully');
      } catch (error) {
        console.error('Error updating permissions:', error.message);
      }
      
      // Update Info.plist to hide dock icon
      try {
        // Find the correct Info.plist path for the main app
        let plistPath = path.join(appPath, 'Contents', 'Info.plist');
        
        // Check if we're in the app.asar context or the full app bundle
        if (!fs.existsSync(plistPath)) {
          // We might be in the build output directory structure
          if (appPath.includes('release/mac-arm64')) {
            plistPath = path.join(appPath, 'ShellPer.app', 'Contents', 'Info.plist');
          } else if (appPath.includes('ShellPer.app')) {
            // We might already be in the app bundle
            plistPath = path.join(appPath, 'Contents', 'Info.plist');
          }
        }
        
        // One more fallback if nothing else works
        if (!fs.existsSync(plistPath) && process.platform === 'darwin') {
          // Try to find the app in the Applications folder
          const appsPath = '/Applications/ShellPer.app/Contents/Info.plist';
          if (fs.existsSync(appsPath)) {
            plistPath = appsPath;
          }
        }
        
        if (fs.existsSync(plistPath)) {
          // Using PlistBuddy to set LSUIElement to true
          execSync(`/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "${plistPath}" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "${plistPath}"`, { stdio: 'inherit' });
          console.log(`Info.plist updated to hide dock icon at: ${plistPath}`);
        } else {
          console.error(`Info.plist not found at ${plistPath}`);
        }
      } catch (error) {
        console.error('Error updating Info.plist:', error.message);
      }
    }
  } catch (error) {
    console.error('Failed to update permissions:', error);
  }

  // Create a default .env file if needed
  try {
    // Create .env in multiple potential locations to ensure it's found
    const possibleEnvPaths = [
      path.join(resourcesPath, '.env'),
      path.join(resourcesPath, 'app', '.env'),
      path.join(appPath, '.env'),
      path.join(appOutDir, 'Contents', 'Resources', '.env')
    ];
    
    const envContent = `NO_EXTERNAL_SERVICES=true
NO_AUTH=true
OFFLINE_ONLY=true`;
    
    // Try to create .env in all possible locations
    let envCreated = false;
    for (const envPath of possibleEnvPaths) {
      try {
        // Create directory if it doesn't exist
        const envDir = path.dirname(envPath);
        if (!fs.existsSync(envDir)) {
          fs.mkdirSync(envDir, { recursive: true });
        }
        
        // Only create if doesn't exist
        if (!fs.existsSync(envPath)) {
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log(`.env file created at: ${envPath}`);
          envCreated = true;
        } else {
          console.log(`.env file already exists at: ${envPath}`);
          envCreated = true;
        }
      } catch (err) {
        console.log(`Failed to create .env at ${envPath}:`, err.message);
      }
    }
    
    if (!envCreated) {
      console.error('Failed to create .env file in any location');
    }
  } catch (error) {
    console.error('Failed to create .env file:', error);
  }

  // Check if ImageMagick is installed
  try {
    console.log('Checking for ImageMagick...');
    
    let imagemagickInstalled = false;
    
    // Common ImageMagick commands to try
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
          imagemagickInstalled = true;
          break;
        }
      }
      
      // Check using 'which' command on macOS if not found yet
      if (!imagemagickInstalled) {
        try {
          const whichOutput = execSync('which magick || which convert', { encoding: 'utf8', stdio: 'pipe' }).trim();
          if (whichOutput) {
            console.log(`ImageMagick found at: ${whichOutput}`);
            imagemagickInstalled = true;
          }
        } catch (whichError) {
          console.log('Could not find ImageMagick using which command');
        }
      }
    }
    
    // Try each command if still not found
    if (!imagemagickInstalled) {
      for (const cmd of commands) {
        try {
          execSync(cmd, { stdio: 'pipe' });
          console.log(`ImageMagick detected using: ${cmd}`);
          imagemagickInstalled = true;
          break;
        } catch (cmdError) {
          // Command failed, try the next one
          console.log(`Command failed: ${cmd}`);
        }
      }
    }
    
    if (imagemagickInstalled) {
      console.log('ImageMagick is installed');
    } else {
      console.log('ImageMagick is not installed');
      
      // We can't install it automatically in a packaged app, but we can write a warning file
      const warningPaths = [
        path.join(appPath, 'IMPORTANT_READ_ME.txt'),
        path.join(resourcesPath, 'IMPORTANT_READ_ME.txt')
      ];
      
      const warningContent = `
IMPORTANT: ShellPer requires ImageMagick to function correctly
================================================

The application has detected that ImageMagick is not installed on your system.
This will cause issues with image processing and screenshot handling.

Please install ImageMagick using one of the following methods:

For macOS:
  brew install imagemagick

For Windows:
  Download and install from: https://imagemagick.org/script/download.php#windows

For Linux:
  sudo apt-get install imagemagick    (Debian/Ubuntu)
  sudo dnf install imagemagick        (Fedora)
  sudo yum install imagemagick        (RHEL/CentOS)

After installing ImageMagick, restart ShellPer for the changes to take effect.
`;
      
      let warningCreated = false;
      for (const warningPath of warningPaths) {
        try {
          fs.writeFileSync(warningPath, warningContent, 'utf8');
          console.log(`Created warning file about missing ImageMagick at: ${warningPath}`);
          warningCreated = true;
          break;
        } catch (writeError) {
          console.error(`Failed to write warning file to ${warningPath}:`, writeError.message);
        }
      }
      
      if (!warningCreated) {
        console.error('Failed to create warning file in any location');
      }
    }
  } catch (error) {
    console.error('Failed to check for ImageMagick:', error);
  }

  console.log('Post-installation setup completed');
  
  // Return a promise for electron-builder
  return Promise.resolve();
}; 