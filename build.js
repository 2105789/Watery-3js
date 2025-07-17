#!/usr/bin/env node

/**
 * Build script for ThreeJS Caustics optimization
 * This script helps prepare the application for production deployment
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  inputDir: '.',
  outputDir: './dist',
  files: [
    'index-optimized.html',
    'index-optimized.js',
    'module/stats.js',
    'performance-analysis.js',
    'OPTIMIZATION_GUIDE.md'
  ],
  assets: [
    'assets/',
    'shaders/'
  ],
  exclude: [
    'node_modules',
    '.git',
    'dist',
    '*.log'
  ]
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// File operations
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logSuccess(`Created directory: ${dirPath}`);
  }
}

function copyFile(src, dest) {
  try {
    const destDir = path.dirname(dest);
    ensureDirectoryExists(destDir);
    
    fs.copyFileSync(src, dest);
    logSuccess(`Copied: ${src} → ${dest}`);
    return true;
  } catch (error) {
    logError(`Failed to copy ${src}: ${error.message}`);
    return false;
  }
}

function copyDirectory(src, dest) {
  try {
    if (!fs.existsSync(src)) {
      logWarning(`Source directory doesn't exist: ${src}`);
      return false;
    }

    ensureDirectoryExists(dest);
    
    const items = fs.readdirSync(src);
    let success = true;
    
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      
      if (fs.statSync(srcPath).isDirectory()) {
        success = copyDirectory(srcPath, destPath) && success;
      } else {
        success = copyFile(srcPath, destPath) && success;
      }
    }
    
    return success;
  } catch (error) {
    logError(`Failed to copy directory ${src}: ${error.message}`);
    return false;
  }
}

// Asset optimization
function optimizeHTML(htmlPath) {
  try {
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Remove comments for production
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    
    // Minify inline CSS
    html = html.replace(/<style>([\s\S]*?)<\/style>/g, (match, css) => {
      const minifiedCSS = css
        .replace(/\s+/g, ' ')
        .replace(/;\s*}/g, '}')
        .replace(/{\s*/g, '{')
        .replace(/;\s*/g, ';')
        .trim();
      return `<style>${minifiedCSS}</style>`;
    });
    
    return html;
  } catch (error) {
    logError(`Failed to optimize HTML ${htmlPath}: ${error.message}`);
    return null;
  }
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main build function
function build() {
  log('🚀 Starting ThreeJS Caustics optimization build...', 'bright');
  
  // Clean output directory
  if (fs.existsSync(config.outputDir)) {
    fs.rmSync(config.outputDir, { recursive: true, force: true });
    logInfo('Cleaned output directory');
  }
  
  ensureDirectoryExists(config.outputDir);
  
  let totalSize = 0;
  let successCount = 0;
  let errorCount = 0;
  
  // Copy main files
  log('\n📁 Copying main files...', 'cyan');
  for (const file of config.files) {
    const srcPath = path.join(config.inputDir, file);
    const destPath = path.join(config.outputDir, file);
    
    if (fs.existsSync(srcPath)) {
      if (file.endsWith('.html')) {
        // Optimize HTML files
        const optimizedHTML = optimizeHTML(srcPath);
        if (optimizedHTML) {
          const destDir = path.dirname(destPath);
          ensureDirectoryExists(destDir);
          fs.writeFileSync(destPath, optimizedHTML);
          logSuccess(`Optimized and copied: ${file}`);
          totalSize += getFileSize(destPath);
          successCount++;
        } else {
          errorCount++;
        }
      } else {
        // Copy other files as-is
        if (copyFile(srcPath, destPath)) {
          totalSize += getFileSize(destPath);
          successCount++;
        } else {
          errorCount++;
        }
      }
    } else {
      logWarning(`File not found: ${file}`);
    }
  }
  
  // Copy assets
  log('\n🎨 Copying assets...', 'cyan');
  for (const asset of config.assets) {
    const srcPath = path.join(config.inputDir, asset);
    const destPath = path.join(config.outputDir, asset);
    
    if (copyDirectory(srcPath, destPath)) {
      // Calculate directory size
      const dirSize = calculateDirectorySize(destPath);
      totalSize += dirSize;
      successCount++;
    } else {
      errorCount++;
    }
  }
  
  // Generate build report
  log('\n📊 Build Report:', 'bright');
  log(`Total files processed: ${successCount + errorCount}`, 'blue');
  log(`Successful: ${successCount}`, 'green');
  log(`Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
  log(`Total size: ${formatFileSize(totalSize)}`, 'blue');
  log(`Output directory: ${config.outputDir}`, 'blue');
  
  if (errorCount === 0) {
    log('\n🎉 Build completed successfully!', 'green');
    log('You can now deploy the contents of the dist/ directory.', 'blue');
  } else {
    log('\n⚠️  Build completed with errors. Please check the output above.', 'yellow');
  }
  
  return errorCount === 0;
}

function calculateDirectorySize(dirPath) {
  let totalSize = 0;
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += calculateDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    logError(`Error calculating directory size for ${dirPath}: ${error.message}`);
  }
  
  return totalSize;
}

// Performance analysis
function analyzePerformance() {
  log('\n🔍 Performance Analysis:', 'bright');
  
  const analysis = {
    bundleSize: 0,
    assetCount: 0,
    optimizationOpportunities: []
  };
  
  // Analyze JavaScript files
  const jsFiles = ['index-optimized.js', 'module/stats.js', 'performance-analysis.js'];
  for (const file of jsFiles) {
    const filePath = path.join(config.inputDir, file);
    if (fs.existsSync(filePath)) {
      const size = getFileSize(filePath);
      analysis.bundleSize += size;
      analysis.assetCount++;
      log(`JavaScript: ${file} - ${formatFileSize(size)}`, 'blue');
    }
  }
  
  // Analyze assets
  if (fs.existsSync('assets')) {
    const assetSize = calculateDirectorySize('assets');
    analysis.bundleSize += assetSize;
    log(`Assets: ${formatFileSize(assetSize)}`, 'blue');
  }
  
  // Recommendations
  log('\n💡 Optimization Recommendations:', 'cyan');
  
  if (analysis.bundleSize > 1024 * 1024) { // > 1MB
    logWarning('Bundle size is large. Consider:');
    log('  - Compressing textures to WebP format', 'yellow');
    log('  - Using a CDN for Three.js libraries', 'yellow');
    log('  - Implementing lazy loading', 'yellow');
  }
  
  if (analysis.assetCount > 20) {
    logWarning('Many assets detected. Consider:');
    log('  - Using texture atlases', 'yellow');
    log('  - Implementing asset bundling', 'yellow');
  }
  
  log(`\nTotal estimated bundle size: ${formatFileSize(analysis.bundleSize)}`, 'bright');
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    log('ThreeJS Caustics Build Script', 'bright');
    log('Usage: node build.js [options]', 'blue');
    log('\nOptions:', 'cyan');
    log('  --analyze, -a    Analyze performance without building', 'blue');
    log('  --help, -h       Show this help message', 'blue');
    return;
  }
  
  if (args.includes('--analyze') || args.includes('-a')) {
    analyzePerformance();
    return;
  }
  
  build();
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { build, analyzePerformance };