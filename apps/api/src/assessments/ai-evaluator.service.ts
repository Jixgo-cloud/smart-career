import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { OpenEndedExecutionResponse } from './judge0.client';

export interface AiRubricEvaluationResult {
  available: boolean;
  status: 'EVALUATED' | 'EVALUATION_PENDING' | 'EVALUATION_FAILED';
  overallScore: number | null;
  evaluatorProvider: string;
  evaluatorModel: string;
  promptVersion: string;
  rubricBreakdown: {
    functionalCorrectness: number;
    codeQuality: number;
    efficiency: number;
    errorHandling: number;
  } | null;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
}

export const DEFAULT_AI_RUBRIC_WEIGHTS = {
  functionalCorrectness: 0.4,
  codeQuality: 0.25,
  efficiency: 0.2,
  errorHandling: 0.15,
};

@Injectable()
export class AiEvaluatorService {
  private readonly promptVersion = 'v1.0-rubric-2026';

  async evaluateOpenEndedSubmission(params: {
    questionTitle: string;
    questionPrompt: string;
    sourceCode: string;
    candidateExplanation?: string | null;
    customRubric?: any;
    executionReport: OpenEndedExecutionResponse;
  }): Promise<AiRubricEvaluationResult> {
    const configuredModel = process.env.AI_EVALUATOR_MODEL || 'gemini-3.6-flash';
    const candidateModels = Array.from(
      new Set([
        configuredModel,
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
      ]),
    );
    const model = configuredModel;

    // Section 16 requirement: If Judge0 sandbox failed with a system outage, do NOT let AI grade it as a candidate runtime error!
    if (!params.executionReport.engineAvailable || params.executionReport.systemError) {
      return {
        available: false,
        status: 'EVALUATION_PENDING',
        overallScore: null,
        evaluatorProvider: 'GOOGLE_GENAI',
        evaluatorModel: model,
        promptVersion: this.promptVersion,
        rubricBreakdown: null,
        feedback:
          'Sandbox execution was unavailable during submission. Score is held pending full verification.',
        strengths: [],
        improvements: [],
      };
    }

    if (process.env.GEMINI_SIMULATE_OUTAGE === 'true') {
      return {
        available: false,
        status: 'EVALUATION_PENDING',
        overallScore: null,
        evaluatorProvider: 'GOOGLE_GENAI',
        evaluatorModel: model,
        promptVersion: this.promptVersion,
        rubricBreakdown: null,
        feedback: 'AI evaluation service is temporarily unavailable. Placed in EVALUATION_PENDING.',
        strengths: [],
        improvements: [],
      };
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (apiKey) {
      try {
        const promptText = `You are a technical code evaluator. Grade the following submission on a 0-100 scale for each dimension:
1. functionalCorrectness (weight 40%)
2. codeQuality (weight 25%)
3. efficiency (weight 20%)
4. errorHandling (weight 15%)

Question: ${params.questionTitle}
Prompt: ${params.questionPrompt}
Custom Rubric: ${JSON.stringify(params.customRubric || {})}
Execution Status: ${params.executionReport.statusDescription}
Stdout: ${params.executionReport.stdout || ''}
Stderr: ${params.executionReport.stderr || ''}
Candidate Explanation: ${params.candidateExplanation || ''}
Submitted Code:
${params.sourceCode}

Respond ONLY in valid JSON with keys: functionalCorrectness, codeQuality, efficiency, errorHandling, feedback, strengths (array), improvements (array).`;

        let parsed: any = null;
        let usedModel = model;
        let lastErr: any = null;
        for (const candidateModel of candidateModels) {
          try {
            const res = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                candidateModel,
              )}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.1,
                },
              },
              { timeout: 20000 },
            );
            const rawText =
              res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = rawText
              .replace(/^```json\s*/i, '')
              .replace(/```\s*$/i, '')
              .trim();
            parsed = JSON.parse(cleanText);
            usedModel = candidateModel;
            break;
          } catch (e: any) {
            lastErr = e;
          }
        }
        if (!parsed) {
          throw lastErr || new Error('All Gemini models failed');
        }
        const fc = Math.max(0, Math.min(100, Number(parsed.functionalCorrectness ?? 70)));
        const cq = Math.max(0, Math.min(100, Number(parsed.codeQuality ?? 70)));
        const ef = Math.max(0, Math.min(100, Number(parsed.efficiency ?? 70)));
        const eh = Math.max(0, Math.min(100, Number(parsed.errorHandling ?? 70)));

        const overallScore = Math.round(
          fc * DEFAULT_AI_RUBRIC_WEIGHTS.functionalCorrectness +
            cq * DEFAULT_AI_RUBRIC_WEIGHTS.codeQuality +
            ef * DEFAULT_AI_RUBRIC_WEIGHTS.efficiency +
            eh * DEFAULT_AI_RUBRIC_WEIGHTS.errorHandling,
        );

        return {
          available: true,
          status: 'EVALUATED',
          overallScore,
          evaluatorProvider: 'GOOGLE_GENAI',
          evaluatorModel: usedModel,
          promptVersion: this.promptVersion,
          rubricBreakdown: {
            functionalCorrectness: fc,
            codeQuality: cq,
            efficiency: ef,
            errorHandling: eh,
          },
          feedback: String(parsed.feedback || 'Evaluated by Gemini rubric.'),
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 5) : [],
        };
      } catch {
        return {
          available: false,
          status: 'EVALUATION_PENDING',
          overallScore: null,
          evaluatorProvider: 'GOOGLE_GENAI',
          evaluatorModel: model,
          promptVersion: this.promptVersion,
          rubricBreakdown: null,
          feedback: 'AI evaluation provider request failed. Placed in EVALUATION_PENDING.',
          strengths: [],
          improvements: [],
        };
      }
    }

    // Deterministic fixture mode when AI_FIXTURE_MODE=true in automated tests
    if (process.env.AI_FIXTURE_MODE === 'true') {
      const hasRuntimeError = params.executionReport.statusDescription === 'Runtime Error';
      const fc = hasRuntimeError ? 40 : 80;
      const cq = 80;
      const ef = 75;
      const eh = params.sourceCode.includes('if') || params.sourceCode.includes('try') ? 85 : 65;
      const overallScore = Math.round(
        fc * DEFAULT_AI_RUBRIC_WEIGHTS.functionalCorrectness +
          cq * DEFAULT_AI_RUBRIC_WEIGHTS.codeQuality +
          ef * DEFAULT_AI_RUBRIC_WEIGHTS.efficiency +
          eh * DEFAULT_AI_RUBRIC_WEIGHTS.errorHandling,
      );

      return {
        available: true,
        status: 'EVALUATED',
        overallScore,
        evaluatorProvider: 'GOOGLE_GENAI',
        evaluatorModel: model,
        promptVersion: this.promptVersion,
        rubricBreakdown: {
          functionalCorrectness: fc,
          codeQuality: cq,
          efficiency: ef,
          errorHandling: eh,
        },
        feedback: 'Evaluated using deterministic rubric fixture.',
        strengths: ['Clear function structure'],
        improvements: ['Add more edge-case validations'],
      };
    }

    return {
      available: false,
      status: 'EVALUATION_PENDING',
      overallScore: null,
      evaluatorProvider: 'GOOGLE_GENAI',
      evaluatorModel: model,
      promptVersion: this.promptVersion,
      rubricBreakdown: null,
      feedback: 'GEMINI_API_KEY is not configured. Submission is held in EVALUATION_PENDING.',
      strengths: [],
      improvements: [],
    };
  }
}
