// Performance Analysis Script for ThreeJS Caustics
// This script provides utilities to measure and analyze performance

class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      fps: [],
      memory: [],
      renderTime: [],
      loadTime: 0,
      frameCount: 0,
      startTime: 0
    };
    
    this.isRunning = false;
    this.analysisDuration = 10000; // 10 seconds
  }

  start() {
    this.isRunning = true;
    this.metrics.startTime = performance.now();
    this.metrics.frameCount = 0;
    this.metrics.fps = [];
    this.metrics.memory = [];
    this.metrics.renderTime = [];
    
    console.log('Performance analysis started...');
    
    // Start monitoring
    this.monitor();
  }

  stop() {
    this.isRunning = false;
    this.generateReport();
  }

  monitor() {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const elapsed = currentTime - this.metrics.startTime;

    // Record FPS
    if (this.metrics.frameCount > 0) {
      const fps = 1000 / (currentTime - this.lastFrameTime);
      this.metrics.fps.push(fps);
    }
    this.lastFrameTime = currentTime;
    this.metrics.frameCount++;

    // Record memory usage if available
    if (performance.memory) {
      this.metrics.memory.push({
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      });
    }

    // Stop after duration
    if (elapsed >= this.analysisDuration) {
      this.stop();
      return;
    }

    requestAnimationFrame(() => this.monitor());
  }

  recordRenderTime(time) {
    if (this.isRunning) {
      this.metrics.renderTime.push(time);
    }
  }

  generateReport() {
    const avgFPS = this.metrics.fps.reduce((a, b) => a + b, 0) / this.metrics.fps.length;
    const minFPS = Math.min(...this.metrics.fps);
    const maxFPS = Math.max(...this.metrics.fps);
    
    const avgRenderTime = this.metrics.renderTime.length > 0 
      ? this.metrics.renderTime.reduce((a, b) => a + b, 0) / this.metrics.renderTime.length 
      : 0;

    let memoryReport = '';
    if (this.metrics.memory.length > 0) {
      const lastMemory = this.metrics.memory[this.metrics.memory.length - 1];
      const avgMemory = this.metrics.memory.reduce((sum, m) => sum + m.used, 0) / this.metrics.memory.length;
      memoryReport = `
Memory Usage:
- Average: ${(avgMemory / 1024 / 1024).toFixed(2)} MB
- Peak: ${(lastMemory.used / 1024 / 1024).toFixed(2)} MB
- Total Available: ${(lastMemory.limit / 1024 / 1024).toFixed(2)} MB`;
    }

    const report = `
=== Performance Analysis Report ===
Duration: ${this.analysisDuration / 1000} seconds
Total Frames: ${this.metrics.frameCount}

FPS Statistics:
- Average: ${avgFPS.toFixed(2)} FPS
- Minimum: ${minFPS.toFixed(2)} FPS
- Maximum: ${maxFPS.toFixed(2)} FPS
- FPS Stability: ${((maxFPS - minFPS) / avgFPS * 100).toFixed(2)}% variation

Render Performance:
- Average Render Time: ${avgRenderTime.toFixed(2)}ms
- Frames per Second: ${(1000 / avgRenderTime).toFixed(2)} FPS (calculated)${memoryReport}

Performance Grade: ${this.getPerformanceGrade(avgFPS, avgRenderTime)}
`;

    console.log(report);
    
    // Save to localStorage for comparison
    const timestamp = new Date().toISOString();
    const performanceData = {
      timestamp,
      avgFPS,
      minFPS,
      maxFPS,
      avgRenderTime,
      memory: this.metrics.memory.length > 0 ? this.metrics.memory[this.metrics.memory.length - 1] : null
    };
    
    const savedData = JSON.parse(localStorage.getItem('performanceData') || '[]');
    savedData.push(performanceData);
    localStorage.setItem('performanceData', JSON.stringify(savedData));
    
    return report;
  }

  getPerformanceGrade(avgFPS, avgRenderTime) {
    if (avgFPS >= 55 && avgRenderTime < 16) return 'A+ (Excellent)';
    if (avgFPS >= 45 && avgRenderTime < 22) return 'A (Very Good)';
    if (avgFPS >= 35 && avgRenderTime < 28) return 'B (Good)';
    if (avgFPS >= 25 && avgRenderTime < 40) return 'C (Acceptable)';
    if (avgFPS >= 15 && avgRenderTime < 66) return 'D (Poor)';
    return 'F (Unacceptable)';
  }

  compareWithBaseline() {
    const savedData = JSON.parse(localStorage.getItem('performanceData') || '[]');
    if (savedData.length < 2) {
      console.log('Need at least 2 performance runs to compare');
      return;
    }

    const latest = savedData[savedData.length - 1];
    const baseline = savedData[savedData.length - 2];

    const fpsImprovement = ((latest.avgFPS - baseline.avgFPS) / baseline.avgFPS * 100).toFixed(2);
    const renderTimeImprovement = ((baseline.avgRenderTime - latest.avgRenderTime) / baseline.avgRenderTime * 100).toFixed(2);

    console.log(`
=== Performance Comparison ===
FPS: ${baseline.avgFPS.toFixed(2)} → ${latest.avgFPS.toFixed(2)} (${fpsImprovement}% ${fpsImprovement > 0 ? 'improvement' : 'degradation'})
Render Time: ${baseline.avgRenderTime.toFixed(2)}ms → ${latest.avgRenderTime.toFixed(2)}ms (${renderTimeImprovement}% ${renderTimeImprovement > 0 ? 'improvement' : 'degradation'})
`);
  }
}

// Bundle size analyzer
class BundleAnalyzer {
  static async analyzeBundleSize() {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    let totalSize = 0;
    
    console.log('=== Bundle Size Analysis ===');
    
    for (const script of scripts) {
      try {
        const response = await fetch(script.src);
        const size = response.headers.get('content-length');
        if (size) {
          const sizeKB = (parseInt(size) / 1024).toFixed(2);
          totalSize += parseInt(size);
          console.log(`${script.src}: ${sizeKB} KB`);
        }
      } catch (error) {
        console.log(`${script.src}: Unable to measure size`);
      }
    }
    
    console.log(`Total Bundle Size: ${(totalSize / 1024).toFixed(2)} KB`);
    return totalSize;
  }
}

// Load time analyzer
class LoadTimeAnalyzer {
  static analyzeLoadTime() {
    const navigation = performance.getEntriesByType('navigation')[0];
    const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
    const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
    
    console.log(`
=== Load Time Analysis ===
DOM Content Loaded: ${domContentLoaded.toFixed(2)}ms
Page Load Complete: ${loadTime.toFixed(2)}ms
Total Navigation Time: ${(navigation.loadEventEnd - navigation.fetchStart).toFixed(2)}ms
`);
    
    return { loadTime, domContentLoaded };
  }
}

// WebGL performance analyzer
class WebGLAnalyzer {
  static analyzeWebGLPerformance(renderer) {
    if (!renderer || !renderer.getContext) return;
    
    const gl = renderer.getContext();
    const info = {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
    };
    
    console.log(`
=== WebGL Performance Analysis ===
Vendor: ${info.vendor}
Renderer: ${info.renderer}
Version: ${info.version}
Max Texture Size: ${info.maxTextureSize}x${info.maxTextureSize}
Max Viewport: ${info.maxViewportDims[0]}x${info.maxViewportDims[1]}
Max Renderbuffer: ${info.maxRenderbufferSize}x${info.maxRenderbufferSize}
`);
    
    return info;
  }
}

// Global performance analyzer instance
window.performanceAnalyzer = new PerformanceAnalyzer();

// Auto-start analysis after 2 seconds
setTimeout(() => {
  window.performanceAnalyzer.start();
}, 2000);

// Auto-stop after 12 seconds
setTimeout(() => {
  window.performanceAnalyzer.stop();
}, 12000);

// Export for use in main script
window.BundleAnalyzer = BundleAnalyzer;
window.LoadTimeAnalyzer = LoadTimeAnalyzer;
window.WebGLAnalyzer = WebGLAnalyzer;