import { CULL_AFTER_MS, type Ruleset } from '@/lib/game/config';
import { InputQueue } from '@/lib/game/input';
import { resolveInput } from '@/lib/game/judge';
import { drawField, layoutField } from '@/lib/game/render';
import { Spawner } from '@/lib/game/spawner';
import type { Cue, JudgeEvent, Lane } from '@/lib/game/types';

/** 화면에 남겨둘 판정 이벤트의 수명 (ms). 이펙트 표시에만 쓴다. */
const EVENT_TTL_MS = 1000;

/** devicePixelRatio를 그대로 쓰면 고밀도 화면에서 픽셀 수가 과해진다. */
const MAX_DPR = 2;

/**
 * 게임 시계와 판정을 React 밖에서 돌린다.
 * 매 프레임 바뀌는 값을 React state에 올리면 60fps 리렌더가 되므로
 * 큐/판정 상태는 이 안의 mutable 필드로만 들고 있고,
 * 밖에는 판정이 났을 때만 onJudge로 알린다.
 */
export class GameEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly spawner: Spawner;

  private input: InputQueue | null = null;
  private cues: Cue[] = [];
  private events: JudgeEvent[] = [];
  private raf = 0;
  private running = false;
  private originPerf = 0;
  private lastNow = 0;
  private width = 0;
  private height = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rules: Ruleset,
    private readonly onJudge: (event: JudgeEvent) => void,
  ) {
    this.spawner = new Spawner(rules);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d 컨텍스트를 만들 수 없습니다');
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  start() {
    this.running = true;
    this.originPerf = performance.now();
    this.input = new InputQueue(this.originPerf);
    this.input.attach();
    this.resize();
    this.resizeObserver.observe(this.canvas);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 터치 패드처럼 키보드 밖에서 들어오는 입력. */
  press(lane: Lane, timeStamp: number) {
    this.input?.press(lane, timeStamp);
  }

  /** 게임오버용. 마지막 화면은 그대로 두고 시계와 입력만 멈춘다. */
  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input?.detach();
  }

  stop() {
    this.pause();
    this.resizeObserver.disconnect();
    this.input = null;
  }

  private frame = (perfNow: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const now = perfNow - this.originPerf;
    this.lastNow = now;

    this.cues.push(...this.spawner.take(now));
    this.judgeInputs(now);
    this.expireCues(now);
    this.events = this.events.filter((event) => now - event.at < EVENT_TTL_MS);

    this.draw(now);
  };

  private judgeInputs(now: number) {
    for (const hit of this.input?.drain() ?? []) {
      const resolution = resolveInput(this.rules, this.cues, hit.lane, hit.at);
      if (resolution.kind === 'empty') {
        this.emit({ type: 'empty', lane: hit.lane, at: now });
        continue;
      }
      if (resolution.kind === 'clash') {
        // 적과 부딪혔으니 쳐내지 못한 것으로 두고 그대로 날아가게 한다.
        resolution.cue.outcome = 'passed';
        this.emit({ type: 'miss', lane: hit.lane, at: now, cause: 'clash' });
        continue;
      }
      if (resolution.kind === 'strike') {
        resolution.cue.outcome = 'destroyed';
        this.emit({ type: 'miss', lane: hit.lane, at: now, cause: 'ally' });
        continue;
      }
      resolution.cue.outcome = 'destroyed';
      this.emit({
        type: 'hit',
        lane: hit.lane,
        at: now,
        grade: resolution.grade,
        delta: resolution.delta,
      });
    }
  }

  private expireCues(now: number) {
    for (const cue of this.cues) {
      if (cue.outcome !== 'pending' || now <= cue.hitAt + this.rules.goodWindow) continue;
      cue.outcome = 'passed';
      if (cue.kind === 'decoy') this.emit({ type: 'spare', lane: cue.lane, at: now });
      else this.emit({ type: 'miss', lane: cue.lane, at: now, cause: 'missed' });
    }
    // 쳐서 없앤 큐는 즉시, 지나친 큐는 플레이어를 통과한 뒤 사라진다.
    this.cues = this.cues.filter(
      (cue) => cue.outcome !== 'destroyed' && now <= cue.hitAt + CULL_AFTER_MS,
    );
  }

  private emit(event: JudgeEvent) {
    this.events.push(event);
    this.onJudge(event);
  }

  private draw(now: number) {
    if (this.width <= 0 || this.height <= 0) return;
    drawField(this.ctx, layoutField(this.width, this.height), {
      now,
      cues: this.cues,
      events: this.events,
      rules: this.rules,
    });
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    // canvas.width 대입이 컨텍스트 상태를 초기화하므로 그 뒤에 스케일을 다시 건다.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    // 멈춘 동안 리사이즈되면 캔버스가 비어버리므로 마지막 화면을 다시 그린다.
    if (!this.running) this.draw(this.lastNow);
  }
}
