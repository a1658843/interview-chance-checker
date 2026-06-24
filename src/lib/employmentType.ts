import type { EmploymentType } from '../types/analysis';

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length ?? 0), 0);
}

export function extractEmploymentType(jobDescriptionText: string): EmploymentType | null {
  const contractToHireCount = countMatches(jobDescriptionText, [
    /\bcontract\s*[-/]?\s*to\s*[-/]?\s*hire\b/gi,
    /\bcontract-to-hire\b/gi,
    /\btemp\s*[-/]?\s*to\s*[-/]?\s*perm(?:anent)?\b/gi,
  ]);
  if (contractToHireCount > 0) {
    return 'Contract-to-Hire';
  }

  const textWithoutContractToHire = jobDescriptionText.replace(
    /\b(?:contract\s*[-/]?\s*to\s*[-/]?\s*hire|contract-to-hire|temp\s*[-/]?\s*to\s*[-/]?\s*perm(?:anent)?)\b/gi,
    ' ',
  );
  const fullTimeCount = countMatches(jobDescriptionText, [/\bfull\s*[- ]?\s*time\b/gi, /\bfte\b/gi]);
  const partTimeCount = countMatches(jobDescriptionText, [/\bpart\s*[- ]?\s*time\b/gi]);
  const contractCount = countMatches(textWithoutContractToHire, [
    /\bcontract(?:or)?\b/gi,
    /\b1099\b/gi,
    /\bc2c\b/gi,
    /\bw2 contract\b/gi,
  ]);

  if (contractCount > 0 && partTimeCount > 0 && fullTimeCount === 0) {
    return 'Part-Time Contract';
  }

  if (contractCount > 0 && fullTimeCount > 0 && partTimeCount === 0) {
    return 'Full-Time Contract';
  }

  const counts: Array<{ type: EmploymentType; count: number }> = [
    {
      type: 'Full-Time' as const,
      count: fullTimeCount,
    },
    {
      type: 'Part-Time' as const,
      count: partTimeCount,
    },
    {
      type: 'Contract' as const,
      count: contractCount,
    },
    {
      type: 'Internship' as const,
      count: countMatches(jobDescriptionText, [/\binternship\b/gi, /\bintern\b/gi]),
    },
  ].filter((item) => item.count > 0);

  if (counts.length === 0) {
    return null;
  }

  const sorted = counts.sort((a, b) => b.count - a.count);
  if (sorted.length > 1 && sorted[0].count === sorted[1].count) {
    return null;
  }

  return sorted[0].type;
}
