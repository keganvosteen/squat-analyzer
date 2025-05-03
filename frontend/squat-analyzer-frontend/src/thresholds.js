// src/thresholds.js
// Centralized threshold constants for squat form classification
// Spine angle (degrees) and depth ratio thresholds
export const SPINE_THRESH = {
  good: 45, // ≤45° good
  warn: 55, // >45° & ≤55° warn, >55° bad
};

export const DEPTH_THRESH = {
  good: 0.85, // ≥0.85 good
  warn: 0.6,  // 0.6–0.85 warn, <0.6 bad
};
