import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as childProcess from 'child_process';
import { detectExecutionLanguage, TestCaseItem } from '@smartcareer/shared';

export interface SingleCaseExecutionResult {
  caseIndex: number;
  isHidden: boolean;
  input: string;
  expectedOutput: string;
  actualOutput: string | null;
  stderr: string | null;
  passed: boolean;
  statusDescription: string;
  executionTimeMs?: number;
}

export interface AutomatedRunResponse {
  engineAvailable: boolean;
  systemError: boolean;
  errorMessage?: string;
  language: 'javascript' | 'python';
  judge0LanguageId: 63 | 71;
  passedCount: number;
  totalCount: number;
  results: SingleCaseExecutionResult[];
}

export interface OpenEndedExecutionResponse {
  engineAvailable: boolean;
  systemError: boolean;
  errorMessage?: string;
  language: 'javascript' | 'python';
  judge0LanguageId: 63 | 71;
  stdout: string | null;
  stderr: string | null;
  statusDescription: string;
}

@Injectable()
export class Judge0Client {
  validateSourceLength(sourceCode: string) {
    if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
      throw new BadRequestException('sourceCode cannot be empty.');
    }
    if (sourceCode.length > 64 * 1024) {
      throw new BadRequestException('sourceCode exceeds the 64 KiB character limit.');
    }
  }

  private getBaseUrl(): string | null {
    const url = (process.env.JUDGE0_BASE_URL || process.env.JUDGE0_API_URL || '').trim();
    return url ? url.replace(/\/+$/, '') : null;
  }

  private isOutageSimulated(): boolean {
    return process.env.JUDGE0_SIMULATE_OUTAGE === 'true';
  }

  private isFixtureWorkerEnabled(): boolean {
    if (this.isOutageSimulated()) return false;
    return (
      process.env.JUDGE0_FIXTURE_MODE === 'true' ||
      process.env.ENABLE_DEV_MOCK_AUTH === 'true'
    );
  }

  compareOutputs(actualRaw: string | null | undefined, expectedRaw: string): boolean {
    if (actualRaw === null || actualRaw === undefined) return false;
    const actual = String(actualRaw).trim();
    const expected = String(expectedRaw).trim();

    if (actual === expected) return true;
    if (actual.toLowerCase() === expected.toLowerCase()) return true;

    // Numeric equivalence
    const numA = Number(actual);
    const numB = Number(expected);
    if (
      actual !== '' &&
      expected !== '' &&
      Number.isFinite(numA) &&
      Number.isFinite(numB) &&
      Math.abs(numA - numB) < 1e-9
    ) {
      return true;
    }

    // JSON structural equivalence
    try {
      const parsedA = JSON.parse(actual);
      const parsedB = JSON.parse(expected);
      return JSON.stringify(parsedA) === JSON.stringify(parsedB);
    } catch {
      return false;
    }
  }

  private buildJavaScriptHarness(sourceCode: string, inputRaw: string): string {
    return `
${sourceCode}

;(async () => {
  try {
    const rawInput = ${JSON.stringify(inputRaw)};
    let args = [];
    try {
      const parsed = JSON.parse(rawInput);
      args = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      args = [rawInput];
    }
    if (typeof solution !== 'function') {
      throw new Error('Function solution(...) is not defined');
    }
    const result = await solution(...args);
    if (typeof result === 'object' && result !== null) {
      process.stdout.write(JSON.stringify(result));
    } else if (result !== undefined) {
      process.stdout.write(String(result));
    }
  } catch (err) {
    process.stderr.write(err && err.stack ? String(err.stack) : String(err));
    process.exit(1);
  }
})();
`;
  }

  private buildPythonHarness(sourceCode: string, inputRaw: string): string {
    return `import json, sys

${sourceCode}

if __name__ == '__main__':
    try:
        raw_input = ${JSON.stringify(inputRaw)}
        try:
            parsed = json.loads(raw_input)
            args = parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            args = [raw_input]
        if 'solution' not in globals():
            raise RuntimeError('Function solution(...) is not defined')
        res = solution(*args)
        if isinstance(res, (dict, list, bool)):
            sys.stdout.write(json.dumps(res, separators=(',', ':')))
        elif res is not None:
            sys.stdout.write(str(res))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
`;
  }

  private async executeInIsolatedSubprocess(
    language: 'javascript' | 'python',
    harnessCode: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      const cmd = language === 'python' ? 'python' : process.execPath;
      const args = language === 'python' ? ['-I', '-c', harnessCode] : ['-e', harnessCode];

      const child = childProcess.execFile(
        cmd,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 256 * 1024,
          env: { PATH: process.env.PATH },
        },
        (error, stdout, stderr) => {
          const timedOut = Boolean((error as any)?.killed || (error as any)?.signal === 'SIGTERM');
          const exitCode = error ? (typeof (error as any).code === 'number' ? (error as any).code : 1) : 0;
          resolve({
            stdout: String(stdout || ''),
            stderr: String(stderr || (error && !stderr ? error.message : '')),
            exitCode,
            timedOut,
          });
        },
      );

      child.stdin?.end();
    });
  }

  private async submitToRemoteJudge0(
    baseUrl: string,
    languageId: 63 | 71,
    harnessCode: string,
    cpuTimeLimitSec: number,
  ): Promise<{
    engineAvailable: boolean;
    stdout: string | null;
    stderr: string | null;
    statusId: number;
    statusDescription: string;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = process.env.JUDGE0_API_KEY || process.env.RAPIDAPI_KEY;
    const authHeader = process.env.JUDGE0_AUTH_HEADER || 'X-RapidAPI-Key';
    if (apiKey) {
      headers[authHeader] = apiKey;
      if (baseUrl.includes('rapidapi.com')) {
        headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
      }
    }

    const res = await axios.post(
      `${baseUrl}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: harnessCode,
        language_id: languageId,
        cpu_time_limit: cpuTimeLimitSec,
        memory_limit: 128000,
      },
      { headers, timeout: 15000 },
    );

    const data = res.data || {};
    const statusId = Number(data.status?.id ?? 0);
    const statusDescription = String(data.status?.description || 'Unknown');

    // Judge0 status ID 13 = Internal Error
    if (statusId === 13 || statusId === 0) {
      return {
        engineAvailable: false,
        stdout: null,
        stderr: data.message || 'Judge0 internal error',
        statusId,
        statusDescription,
      };
    }

    return {
      engineAvailable: true,
      stdout: data.stdout ?? null,
      stderr: data.stderr || data.compile_output || null,
      statusId,
      statusDescription,
    };
  }

  async runAutomatedTestCases(
    sourceCode: string,
    starterCode: string | null | undefined,
    testCases: TestCaseItem[],
  ): Promise<AutomatedRunResponse> {
    this.validateSourceLength(sourceCode);
    const { language, judge0LanguageId } = detectExecutionLanguage(starterCode);

    if (this.isOutageSimulated()) {
      return {
        engineAvailable: false,
        systemError: true,
        errorMessage: 'Judge0 execution service is temporarily unavailable.',
        language,
        judge0LanguageId,
        passedCount: 0,
        totalCount: testCases.length,
        results: [],
      };
    }

    const baseUrl = this.getBaseUrl();
    const useFixture = this.isFixtureWorkerEnabled();

    if (!baseUrl && !useFixture) {
      return {
        engineAvailable: false,
        systemError: true,
        errorMessage: 'Judge0 endpoint is not configured.',
        language,
        judge0LanguageId,
        passedCount: 0,
        totalCount: testCases.length,
        results: [],
      };
    }

    const results: SingleCaseExecutionResult[] = [];
    let passedCount = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const harness =
        language === 'python'
          ? this.buildPythonHarness(sourceCode, tc.input)
          : this.buildJavaScriptHarness(sourceCode, tc.input);

      if (baseUrl) {
        try {
          const remote = await this.submitToRemoteJudge0(baseUrl, judge0LanguageId, harness, 3);
          if (!remote.engineAvailable) {
            return {
              engineAvailable: false,
              systemError: true,
              errorMessage: remote.stderr || 'Judge0 sandbox internal error.',
              language,
              judge0LanguageId,
              passedCount: 0,
              totalCount: testCases.length,
              results: [],
            };
          }

          const passed =
            remote.statusId === 3 && this.compareOutputs(remote.stdout, tc.expectedOutput);
          if (passed) passedCount += 1;

          results.push({
            caseIndex: i,
            isHidden: Boolean(tc.isHidden),
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            actualOutput: remote.stdout !== null ? String(remote.stdout).trim() : null,
            stderr: remote.stderr,
            passed,
            statusDescription: passed
              ? 'Accepted'
              : remote.statusId === 3
                ? 'Wrong Answer'
                : remote.statusDescription,
          });
          continue;
        } catch (err: any) {
          if (!useFixture) {
            return {
              engineAvailable: false,
              systemError: true,
              errorMessage: err?.message || 'Judge0 connection failed.',
              language,
              judge0LanguageId,
              passedCount: 0,
              totalCount: testCases.length,
              results: [],
            };
          }
        }
      }

      // Isolated subprocess execution in dev/test fixture mode (3000ms CPU limit)
      const startMs = Date.now();
      const sub = await this.executeInIsolatedSubprocess(language, harness, 3000);
      const elapsed = Date.now() - startMs;

      if (sub.timedOut) {
        results.push({
          caseIndex: i,
          isHidden: Boolean(tc.isHidden),
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: null,
          stderr: 'Time Limit Exceeded (3000ms)',
          passed: false,
          statusDescription: 'Time Limit Exceeded',
          executionTimeMs: elapsed,
        });
        continue;
      }

      const passed =
        sub.exitCode === 0 && this.compareOutputs(sub.stdout, tc.expectedOutput);
      if (passed) passedCount += 1;

      results.push({
        caseIndex: i,
        isHidden: Boolean(tc.isHidden),
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: sub.stdout.trim(),
        stderr: sub.stderr ? sub.stderr.trim() : null,
        passed,
        statusDescription: passed
          ? 'Accepted'
          : sub.exitCode !== 0
            ? 'Runtime Error'
            : 'Wrong Answer',
        executionTimeMs: elapsed,
      });
    }

    return {
      engineAvailable: true,
      systemError: false,
      language,
      judge0LanguageId,
      passedCount,
      totalCount: testCases.length,
      results,
    };
  }

  async runOpenEndedRaw(
    sourceCode: string,
    starterCode?: string | null,
  ): Promise<OpenEndedExecutionResponse> {
    this.validateSourceLength(sourceCode);
    const { language, judge0LanguageId } = detectExecutionLanguage(starterCode);

    if (this.isOutageSimulated()) {
      return {
        engineAvailable: false,
        systemError: true,
        errorMessage: 'Judge0 execution service is temporarily unavailable.',
        language,
        judge0LanguageId,
        stdout: null,
        stderr: null,
        statusDescription: 'SYSTEM_ERROR',
      };
    }

    const baseUrl = this.getBaseUrl();
    const useFixture = this.isFixtureWorkerEnabled();

    if (!baseUrl && !useFixture) {
      return {
        engineAvailable: false,
        systemError: true,
        errorMessage: 'Judge0 endpoint is not configured.',
        language,
        judge0LanguageId,
        stdout: null,
        stderr: null,
        statusDescription: 'SYSTEM_ERROR',
      };
    }

    if (baseUrl) {
      try {
        const remote = await this.submitToRemoteJudge0(baseUrl, judge0LanguageId, sourceCode, 5);
        if (!remote.engineAvailable) {
          return {
            engineAvailable: false,
            systemError: true,
            errorMessage: remote.stderr || 'Judge0 internal error.',
            language,
            judge0LanguageId,
            stdout: null,
            stderr: remote.stderr,
            statusDescription: 'SYSTEM_ERROR',
          };
        }
        return {
          engineAvailable: true,
          systemError: false,
          language,
          judge0LanguageId,
          stdout: remote.stdout,
          stderr: remote.stderr,
          statusDescription: remote.statusDescription,
        };
      } catch (err: any) {
        if (!useFixture) {
          return {
            engineAvailable: false,
            systemError: true,
            errorMessage: err?.message || 'Judge0 connection failed.',
            language,
            judge0LanguageId,
            stdout: null,
            stderr: null,
            statusDescription: 'SYSTEM_ERROR',
          };
        }
      }
    }

    const sub = await this.executeInIsolatedSubprocess(language, sourceCode, 5000);
    return {
      engineAvailable: true,
      systemError: false,
      language,
      judge0LanguageId,
      stdout: sub.stdout.trim() || null,
      stderr: sub.stderr.trim() || null,
      statusDescription: sub.timedOut
        ? 'Time Limit Exceeded'
        : sub.exitCode === 0
          ? 'Accepted'
          : 'Runtime Error',
    };
  }
}
