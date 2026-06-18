import type { Recommendation } from '../types/analysis';

export function getRecommendation(score: number): Recommendation {
  if (score >= 8) {
    return 'Strong Apply';
  }

  if (score >= 6) {
    return 'Apply';
  }

  if (score >= 4) {
    return 'Stretch';
  }

  return 'Skip';
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}
