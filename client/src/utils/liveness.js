/**
 * Liveness Detection Utility
 * Analyzes brightness changes between flash frames to detect real faces vs photos
 */

// Optimal variance threshold for real skin response
const VARIANCE_THRESHOLD = 18;

// Minimum brightness change between frames
const MIN_BRIGHTNESS_CHANGE = 10;

// Maximum allowed sudden jump (photos/screens have abrupt changes)
const MAX_SUDDEN_JUMP = 80;

/**
 * Calculate average brightness of an image/frame
 * @param {Uint8ClampedArray} imageData - Image data array
 * @returns {number} Average brightness (0-255)
 */
export function calculateBrightness(imageData) {
  const pixels = imageData.data;
  let totalBrightness = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    // Luminance formula: 0.299R + 0.587G + 0.114B
    const brightness = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    totalBrightness += brightness;
  }
  
  return totalBrightness / (pixels.length / 4);
}

/**
 * Calculate variance of brightness changes
 * @param {number[]} brightnessValues - Array of brightness values from frames
 * @returns {number} Variance value
 */
export function calculateVariance(brightnessValues) {
  if (brightnessValues.length < 2) return 0;
  
  const mean = brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length;
  const squaredDiffs = brightnessValues.map(b => Math.pow(b - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Check for sudden jumps between consecutive frames
 * @param {number[]} brightnessValues - Array of brightness values
 * @returns {{ hasSuddenJump: boolean, maxJump: number }}
 */
export function detectSuddenJumps(brightnessValues) {
  let maxJump = 0;
  
  for (let i = 1; i < brightnessValues.length; i++) {
    const jump = Math.abs(brightnessValues[i] - brightnessValues[i - 1]);
    maxJump = Math.max(maxJump, jump);
  }
  
  return {
    hasSuddenJump: maxJump > MAX_SUDDEN_JUMP,
    maxJump
  };
}

/**
 * Check if brightness changes are smooth (real face characteristic)
 * @param {number[]} brightnessValues - Array of brightness values
 * @returns {{ isSmooth: boolean, smoothness: number }}
 */
export function checkSmoothness(brightnessValues) {
  if (brightnessValues.length < 3) return { isSmooth: false, smoothness: 0 };
  
  // Calculate differences between consecutive frames
  const differences = [];
  for (let i = 1; i < brightnessValues.length; i++) {
    differences.push(brightnessValues[i] - brightnessValues[i - 1]);
  }
  
  // Check if differences follow a pattern (gradual change)
  // Real faces show gradual transitions, photos show random/flat patterns
  let consistentChanges = 0;
  for (let i = 1; i < differences.length; i++) {
    // Check if the change direction is consistent or gradually reversing
    const prevDiff = differences[i - 1];
    const currDiff = differences[i];
    
    // Allow for gradual reversal (flash sequence goes through different colors)
    if (Math.abs(currDiff) > MIN_BRIGHTNESS_CHANGE) {
      consistentChanges++;
    }
  }
  
  const smoothness = consistentChanges / (differences.length - 1 || 1);
  return {
    isSmooth: smoothness >= 0.5,
    smoothness
  };
}

/**
 * Main liveness detection function
 * @param {Array} frames - Array of frame data with imageData
 * @returns {{ isLive: boolean, score: number, details: Object }}
 */
export function detectLiveness(frames) {
  if (frames.length < 4) {
    return {
      isLive: false,
      score: 0,
      details: { error: 'Need at least 4 frames for liveness detection' }
    };
  }
  
  // Calculate brightness for each frame
  const brightnessValues = frames.map(frame => {
    if (frame.imageData) {
      return calculateBrightness(frame.imageData);
    }
    // Fallback: use pre-calculated brightness
    return frame.brightness || 128;
  });
  
  console.log('Liveness brightness values:', brightnessValues);
  
  // Calculate variance
  const variance = calculateVariance(brightnessValues);
  
  // Check for sudden jumps
  const { hasSuddenJump, maxJump } = detectSuddenJumps(brightnessValues);
  
  // Check smoothness
  const { isSmooth, smoothness } = checkSmoothness(brightnessValues);
  
  // Calculate liveness score (0-1)
  let score = 0;
  
  // Variance component (real faces have moderate variance from flash response)
  const varianceScore = Math.min(1, variance / VARIANCE_THRESHOLD);
  
  // No sudden jumps component
  const jumpScore = hasSuddenJump ? 0 : 1;
  
  // Smoothness component
  const smoothnessScore = smoothness;
  
  // Weighted combination
  score = (varianceScore * 0.4 + jumpScore * 0.35 + smoothnessScore * 0.25);
  
  // Additional check: ensure there's meaningful brightness change
  const brightnessRange = Math.max(...brightnessValues) - Math.min(...brightnessValues);
  if (brightnessRange < MIN_BRIGHTNESS_CHANGE * 2) {
    // Flat response likely indicates a photo/screen
    score *= 0.5;
  }
  
  const isLive = score >= 0.5 && !hasSuddenJump;
  
  return {
    isLive,
    score: Math.round(score * 100) / 100,
    details: {
      variance,
      varianceThreshold: VARIANCE_THRESHOLD,
      maxJump,
      smoothness: Math.round(smoothness * 100) / 100,
      brightnessRange,
      brightnessValues
    }
  };
}

/**
 * Get image data from video frame for liveness analysis
 * @param {HTMLVideoElement} video - Video element
 * @param {Object} faceBox - Face bounding box
 * @returns {ImageData | null}
 */
export function captureFrameImageData(video, faceBox) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Get face region with padding
    const padding = 30;
    const x = Math.max(0, faceBox.x - padding);
    const y = Math.max(0, faceBox.y - padding);
    const width = Math.min(canvas.width - x, faceBox.width + padding * 2);
    const height = Math.min(canvas.height - y, faceBox.height + padding * 2);
    
    return ctx.getImageData(x, y, width, height);
  } catch (e) {
    console.error('Error capturing frame for liveness:', e);
    return null;
  }
}

export default {
  VARIANCE_THRESHOLD,
  calculateBrightness,
  calculateVariance,
  detectSuddenJumps,
  checkSmoothness,
  detectLiveness,
  captureFrameImageData
};
