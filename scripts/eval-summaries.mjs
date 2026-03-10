import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SummarizationService } from '../backend/dist/modules/summarization/summarization.service.js';
import { buildSummaryEvidenceSelection } from '../backend/dist/modules/search/evidence-pipeline.js';

const TOKEN_PATTERN = /[a-z0-9]+/g;
const SENTENCE_PATTERN = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);
const LOW_INFORMATION_PATTERN =
  /\b(sign in|signin|log in|login|register|create account|subscribe|cookie policy|privacy policy|terms|access denied|404|page unavailable|javascript required|enable cookies|learn more|read more)\b/i;

const THRESHOLDS = {
  minAverageEvidenceRelevance: 0.24,
  minAverageSourceDiversity: 0.65,
  maxLowInformationRate: 0.15,
  minSummaryComplianceRate: 0.9,
};

function tokenize(text) {
  const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  return new Set(matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function overlapRatio(queryTokens, candidateTokens) {
  if (queryTokens.size === 0 || candidateTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

function toSummarySources(results) {
  return results.map((result) => ({
    id: result.id,
    title: result.title,
    url: result.url,
    description: result.description,
  }));
}

function getSentenceCount(summary) {
  if (!summary) {
    return 0;
  }

  const matches = summary.match(SENTENCE_PATTERN) ?? [];
  return matches.filter((sentence) => sentence.trim().length > 0).length;
}

function isDefinitionStyleQuery(query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('define ')) {
    return true;
  }
  if (trimmed.includes('definition of') || trimmed.includes('meaning of')) {
    return true;
  }
  return /^[a-z]+$/.test(trimmed) && trimmed.length >= 2;
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

async function loadFixtures() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const fixturePath = path.resolve(currentDir, '../eval/queries.json');
  const raw = await readFile(fixturePath, 'utf-8');
  return JSON.parse(raw);
}

async function run() {
  const fixtures = await loadFixtures();
  const summarizationService = new SummarizationService({ openAiApiKey: '' });

  const queryMetrics = [];

  for (const fixture of fixtures.queries) {
    const results = fixture.results.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      description: item.description,
      source: 'brave',
    }));

    const selection = buildSummaryEvidenceSelection(fixture.query, results);
    const summaryResult = await summarizationService.summarize(
      fixture.query,
      toSummarySources(selection.selectedEvidence),
    );

    const queryTokens = tokenize(fixture.query);
    const evidenceOverlaps = selection.selectedEvidence.map((item) =>
      overlapRatio(queryTokens, tokenize(`${item.title} ${item.description}`)),
    );
    const evidenceRelevance = mean(evidenceOverlaps);

    const uniqueDomains = new Set(
      selection.selectedEvidence.map((item) => {
        try {
          return new URL(item.url).hostname;
        } catch {
          return item.url;
        }
      }),
    );
    const sourceDiversity =
      selection.selectedCount > 0 ? uniqueDomains.size / selection.selectedCount : 0;

    const lowInformationCount = selection.selectedEvidence.filter((item) =>
      LOW_INFORMATION_PATTERN.test(`${item.title} ${item.description}`),
    ).length;
    const lowInformationRate =
      selection.selectedCount > 0 ? lowInformationCount / selection.selectedCount : 0;

    const sentenceCount = getSentenceCount(summaryResult.summary);
    const maxSentences = isDefinitionStyleQuery(fixture.query) ? 3 : 4;
    const summaryCompliant = sentenceCount >= 1 && sentenceCount <= maxSentences;

    queryMetrics.push({
      id: fixture.id,
      query: fixture.query,
      retrievedCount: selection.retrievedCount,
      selectedCount: selection.selectedCount,
      evidenceRelevance,
      sourceDiversity,
      lowInformationRate,
      summarySentenceCount: sentenceCount,
      summaryCompliant,
    });
  }

  const averageEvidenceRelevance = mean(queryMetrics.map((item) => item.evidenceRelevance));
  const averageSourceDiversity = mean(queryMetrics.map((item) => item.sourceDiversity));
  const averageLowInformationRate = mean(queryMetrics.map((item) => item.lowInformationRate));
  const summaryComplianceRate =
    queryMetrics.filter((item) => item.summaryCompliant).length / queryMetrics.length;

  console.log('Summary Eval Metrics');
  console.log(`- Queries evaluated: ${queryMetrics.length}`);
  console.log(`- Avg evidence relevance: ${averageEvidenceRelevance.toFixed(3)}`);
  console.log(`- Avg source diversity: ${averageSourceDiversity.toFixed(3)}`);
  console.log(`- Avg low-info source rate: ${averageLowInformationRate.toFixed(3)}`);
  console.log(`- Summary length compliance: ${(summaryComplianceRate * 100).toFixed(1)}%`);

  const failing = [];
  if (averageEvidenceRelevance < THRESHOLDS.minAverageEvidenceRelevance) {
    failing.push(
      `averageEvidenceRelevance ${averageEvidenceRelevance.toFixed(3)} < ${THRESHOLDS.minAverageEvidenceRelevance.toFixed(3)}`,
    );
  }
  if (averageSourceDiversity < THRESHOLDS.minAverageSourceDiversity) {
    failing.push(
      `averageSourceDiversity ${averageSourceDiversity.toFixed(3)} < ${THRESHOLDS.minAverageSourceDiversity.toFixed(3)}`,
    );
  }
  if (averageLowInformationRate > THRESHOLDS.maxLowInformationRate) {
    failing.push(
      `averageLowInformationRate ${averageLowInformationRate.toFixed(3)} > ${THRESHOLDS.maxLowInformationRate.toFixed(3)}`,
    );
  }
  if (summaryComplianceRate < THRESHOLDS.minSummaryComplianceRate) {
    failing.push(
      `summaryComplianceRate ${summaryComplianceRate.toFixed(3)} < ${THRESHOLDS.minSummaryComplianceRate.toFixed(3)}`,
    );
  }

  if (failing.length > 0) {
    console.error('Summary eval failed thresholds:');
    for (const failure of failing) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Summary eval failed to run:', error);
  process.exit(1);
});
