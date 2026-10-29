import { ChildProcess, SpawnOptions, spawn } from 'child_process';

export async function openJobVirtualDisplay(
  env: Record<string, string>,
  start: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess = spawn,
): Promise<{ display: string; close: () => Promise<void> }> {
  let child: ChildProcess;
  try {
    child = start(
      'Xvfb',
      ['-displayfd', '3', '-screen', '0', '1280x720x24', '-nolisten', 'tcp'],
      {
        env,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
      },
    );
  } catch {
    throw new Error(
      'SOURCE_DISPLAY_UNAVAILABLE: เปิดจอชั่วคราวสำหรับเบราว์เซอร์ไม่ได้',
    );
  }
  const close = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000);
      child.once('exit', done);
      if (!child.kill('SIGTERM')) done();
    });
  };
  try {
    const display = await new Promise<string>((resolve, reject) => {
      let settled = false;
      let value = '';
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(`:${value.trim()}`);
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'SOURCE_DISPLAY_TIMEOUT: เปิดจอชั่วคราวไม่ทันเวลาที่กำหนด',
            ),
          ),
        5000,
      );
      child.on('error', () =>
        finish(
          new Error(
            'SOURCE_DISPLAY_UNAVAILABLE: เปิดจอชั่วคราวสำหรับเบราว์เซอร์ไม่ได้',
          ),
        ),
      );
      child.on('exit', () =>
        finish(
          new Error(
            'SOURCE_DISPLAY_UNAVAILABLE: จอชั่วคราวหยุดทำงานก่อนพร้อม',
          ),
        ),
      );
      const pipe = child.stdio[3];
      if (!pipe || !('on' in pipe)) {
        finish(
          new Error(
            'SOURCE_DISPLAY_UNAVAILABLE: จอชั่วคราวไม่ส่งสถานะพร้อม',
          ),
        );
        return;
      }
      pipe.on('data', (chunk) => {
        value += chunk.toString();
        if (value.length > 16 || !/^\d*\n?$/.test(value)) {
          finish(
            new Error(
              'SOURCE_DISPLAY_UNAVAILABLE: สถานะจอชั่วคราวไม่ถูกต้อง',
            ),
          );
          return;
        }
        if (value.endsWith('\n')) {
          if (!/^\d+\n$/.test(value) || Number(value.trim()) > 65535) {
            finish(
              new Error(
                'SOURCE_DISPLAY_UNAVAILABLE: สถานะจอชั่วคราวไม่ถูกต้อง',
              ),
            );
          } else {
            finish();
          }
        }
      });
      pipe.on('error', () =>
        finish(
          new Error(
            'SOURCE_DISPLAY_UNAVAILABLE: อ่านสถานะจอชั่วคราวไม่ได้',
          ),
        ),
      );
    });
    return { display, close };
  } catch (error) {
    await close();
    throw error;
  }
}
