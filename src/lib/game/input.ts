import { LANE_KEYS } from '@/lib/game/config';
import type { Lane } from '@/lib/game/types';

export type InputHit = { lane: Lane; at: number };

/**
 * 입력을 게임 시계(ms) 기준으로 모아두고 rAF 루프가 꺼내 가도록 한다.
 * 판정에 프레임 시각을 쓰면 최대 16ms 오차가 그대로 들어가므로
 * 실제 입력 시각인 event.timeStamp를 기준으로 삼는다.
 */
export class InputQueue {
  private queue: InputHit[] = [];

  constructor(private readonly originPerf: number) {}

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  /** 터치 패드 등 키보드 외 입력용. 키보드와 같은 시각 보정을 태운다. */
  press(lane: Lane, timeStamp?: number) {
    this.queue.push({ lane, at: this.toGameTime(timeStamp ?? performance.now()) });
  }

  drain(): InputHit[] {
    const drained = this.queue;
    this.queue = [];
    return drained;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // 키를 누른 채 유지할 때의 자동 반복은 입력이 아니다.
    if (event.repeat) return;
    const lane = LANE_KEYS[event.code];
    if (!lane) return;
    event.preventDefault();
    this.queue.push({ lane, at: this.toGameTime(event.timeStamp) });
  };

  /**
   * event.timeStamp는 보통 performance.now()와 같은 time origin을 쓰지만,
   * 다른 기준으로 들어오는 환경이 있어 현재 시각과 크게 어긋나면 폴백한다.
   */
  private toGameTime(timeStamp: number) {
    const now = performance.now();
    const trusted = Math.abs(timeStamp - now) < 1000;
    return (trusted ? timeStamp : now) - this.originPerf;
  }
}
