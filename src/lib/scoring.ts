import type { EffortLevel, Recommendation } from '../types/analysis';

export function getRecommendation(score: number, effortLevel: EffortLevel = 'Low'): Recommendation {
  if (score >= 8) {
    return 'Strong Apply ✅';
  }

  if (score >= 7) {
    if (effortLevel === 'High' || effortLevel === 'Very High') {
      return 'Borderline ⚠️';
    }

    return 'Apply ✅';
  }

  if (score >= 6) {
    if (effortLevel === 'Low') {
      return 'Apply ✅';
    }

    return 'Borderline ⚠️';
  }

  if (score >= 4) {
    return 'Skip ❌';
  }

  return 'Hard Skip ❌❌';
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
}
