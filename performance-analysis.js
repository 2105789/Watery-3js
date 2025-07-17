// Performance Analysis Script
// Run this in the browser console to analyze performance differences

class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      fps: [],
      memory: [],
      loadTime: 0,
      renderTime: [],
      simulationTime: []
    };
    this.isRunning = false;
    this.startTime = 0;
  }

  start() {
    this.isRunning = true;
    this.startTime = performance.now();
    this.metrics = {
      fps: [],
      memory: [],
      loadTime: 0,
      renderTime: [],
      simulationTime: []
    };
    
    console.log('Performance analysis started...');
    this.measure();
  }

  stop() {
    this.isRunning = false;
    this.metrics.loadTime = performance.now() - this.startTime;
    this.generateReport();
  }

  measure() {
    if (!this.isRunning) return;

    // Measure FPS
    if (window.stats && window.stats.domElement) {
      const fpsText = window.stats.domElement.textContent;
      const fpsMatch = fpsText.match(/(\d+)/);
      if (fpsMatch) {
        this.metrics.fps.push(parseInt(fpsMatch[1]));
      }
    }

    // Measure memory usage
    if (performance.memory) {
      this.metrics.memory.push({
        used: performance.memory.usedJSHeapSize / 1024 / 1024,
        total: performance.memory.totalJSHeapSize / 1024 / 1024,
        limit: performance.memory.jsHeapSizeLimit / 1024 / 1024
      });
    }

    // Measure render time if available
    if (window.renderer) {
      const renderInfo = window.renderer.info;
      this.metrics.renderTime.push({
        calls: renderInfo.render.calls,
        triangles: renderInfo.render.triangles,
        points: renderInfo.render.points,
        lines: renderInfo.render.lines
      });
    }

    requestAnimationFrame(() => this.measure());
  }

  generateReport() {
    const avgFps = this.metrics.fps.length > 0 ? 
      this.metrics.fps.reduce((a, b) => a + b, 0) / this.metrics.fps.length : 0;
    
    const avgMemory = this.metrics.memory.length > 0 ? 
      this.metrics.memory.reduce((sum, m) => sum + m.used, 0) / this.metrics.memory.length : 0;

    const maxMemory = this.metrics.memory.length > 0 ? 
      Math.max(...this.metrics.memory.map(m => m.used)) : 0;

    console.log('=== PERFORMANCE ANALYSIS REPORT ===');
    console.log(`Load Time: ${this.metrics.loadTime.toFixed(2)}ms`);
    console.log(`Average FPS: ${avgFps.toFixed(2)}`);
    console.log(`Average Memory Usage: ${avgMemory.toFixed(2)}MB`);
    console.log(`Peak Memory Usage: ${maxMemory.toFixed(2)}MB`);
    console.log(`Sample Count: ${this.metrics.fps.length} frames`);
    
    if (this.metrics.renderTime.length > 0) {
      const lastRender = this.metrics.renderTime[this.metrics.renderTime.length - 1];
      console.log(`Render Calls: ${lastRender.calls}`);
      console.log(`Triangles: ${lastRender.triangles}`);
    }

    // Performance grade
    let grade = 'A';
    if (avgFps < 30) grade = 'C';
    else if (avgFps < 45) grade = 'B';
    else if (avgFps < 55) grade = 'A-';
    
    console.log(`Performance Grade: ${grade}`);
    console.log('=====================================');

    return {
      loadTime: this.metrics.loadTime,
      avgFps,
      avgMemory,
      maxMemory,
      grade
    };
  }
}

// Bundle size analyzer
function analyzeBundleSize() {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  let totalSize = 0;
  
  console.log('=== BUNDLE SIZE ANALYSIS ===');
  scripts.forEach(script => {
    const url = script.src;
    if (url.includes('three') || url.includes('dat.gui')) {
      console.log(`External: ${url}`);
    } else {
      console.log(`Local: ${url}`);
    }
  });
  
  // Estimate based on typical sizes
  const estimates = {
    'three.js': '~600KB',
    'OrbitControls': '~20KB',
    'OBJLoader': '~15KB',
    'dat.gui': '~50KB',
    'stats.js': '~10KB',
    'index.js': '~26KB (original)',
    'index-optimized.js': '~35KB (optimized)'
  };
  
  console.log('Estimated bundle sizes:', estimates);
  console.log('==============================');
}

// Memory leak detector
function detectMemoryLeaks() {
  if (!performance.memory) {
    console.log('Memory API not available');
    return;
  }

  const initialMemory = performance.memory.usedJSHeapSize;
  
  setTimeout(() => {
    const currentMemory = performance.memory.usedJSHeapSize;
    const memoryIncrease = currentMemory - initialMemory;
    
    console.log('=== MEMORY LEAK DETECTION ===');
    console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Current memory: ${(currentMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    
    if (memoryIncrease > 10 * 1024 * 1024) { // 10MB threshold
      console.log('⚠️  Potential memory leak detected!');
    } else {
      console.log('✅ No significant memory leak detected');
    }
    console.log('==============================');
  }, 10000); // Check after 10 seconds
}

// Performance comparison tool
function comparePerformance() {
  console.log('=== PERFORMANCE COMPARISON ===');
  console.log('Original vs Optimized:');
  console.log('');
  console.log('Original:');
  console.log('- Water resolution: 512x512');
  console.log('- Floor resolution: 128x128');
  console.log('- Rock count: 100');
  console.log('- Foam enabled: true');
  console.log('- Antialiasing: enabled');
  console.log('- Estimated FPS: 30-45');
  console.log('');
  console.log('Optimized:');
  console.log('- Water resolution: 256x256');
  console.log('- Floor resolution: 64x64');
  console.log('- Rock count: 50');
  console.log('- Foam enabled: false (optional)');
  console.log('- Antialiasing: disabled');
  console.log('- Estimated FPS: 50-60');
  console.log('');
  console.log('Improvements:');
  console.log('- 75% reduction in water simulation pixels');
  console.log('- 75% reduction in floor geometry');
  console.log('- 50% reduction in rock count');
  console.log('- Optional foam rendering');
  console.log('- Object pooling for vectors');
  console.log('- Reduced render target sizes');
  console.log('- Frame rate limiting for simulation');
  console.log('==============================');
}

// Export for use in console
window.PerformanceAnalyzer = PerformanceAnalyzer;
window.analyzeBundleSize = analyzeBundleSize;
window.detectMemoryLeaks = detectMemoryLeaks;
window.comparePerformance = comparePerformance;

// Auto-run analysis after page load
window.addEventListener('load', () => {
  setTimeout(() => {
    console.log('Performance analysis tools loaded. Use:');
    console.log('- new PerformanceAnalyzer().start() to begin analysis');
    console.log('- analyzeBundleSize() to check bundle sizes');
    console.log('- detectMemoryLeaks() to check for memory leaks');
    console.log('- comparePerformance() to see optimization details');
  }, 2000);
});