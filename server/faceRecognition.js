// Face recognition matching with improved accuracy
// Uses multiple descriptors per user for better matching

function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Match against all stored descriptors for a user (not just average)
function findMatch(descriptor, employees) {
  try {
    // Stricter threshold for higher security
    const threshold = 0.5;
    let bestMatch = null;
    let bestDistance = threshold;
    let bestMatchDetails = null;

    for (const employee of employees) {
      // Get all descriptors for this employee
      const descriptors = employee.faceDescriptors || [employee.averageDescriptor];
      
      // Compare against each stored descriptor
      for (const storedDescriptor of descriptors) {
        const distance = euclideanDistance(descriptor, storedDescriptor);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = employee;
          bestMatchDetails = {
            distance: distance,
            descriptorIndex: descriptors.indexOf(storedDescriptor)
          };
        }
      }
    }

    console.log(`Best match: ${bestMatch?.name || 'None'}, Distance: ${bestDistance?.toFixed(4) || 'N/A'}`);
    
    return {
      match: bestMatch,
      distance: bestDistance,
      confidence: bestDistance < threshold ? ((threshold - bestDistance) / threshold * 100).toFixed(1) : 0
    };
  } catch (error) {
    console.error('Error finding match:', error);
    return { match: null, distance: Infinity, confidence: 0 };
  }
}

// Compare two descriptors and return match result
function verifyIdentity(descriptor1, descriptor2, threshold = 0.5) {
  const distance = euclideanDistance(descriptor1, descriptor2);
  return {
    isMatch: distance < threshold,
    distance: distance,
    confidence: distance < threshold ? ((threshold - distance) / threshold * 100).toFixed(1) : 0
  };
}

module.exports = {
  euclideanDistance,
  findMatch,
  verifyIdentity,
  THRESHOLD: 0.5 // Stricter than default 0.6
};
