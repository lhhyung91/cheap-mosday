'use client';

import type { Lane } from '@/lib/game/types';

type TouchPadsProps = {
  onPress: (lane: Lane, timeStamp: number) => void;
};

/** 키보드가 없는 기기용 입력. 표시 여부는 globals.css의 미디어 쿼리가 정한다. */
export function TouchPads({ onPress }: TouchPadsProps) {
  return (
    <div className="touch-pads pointer-events-none absolute inset-x-0 bottom-0 h-36 gap-3 p-3">
      {(['left', 'right'] as const).map((lane) => (
        <button
          key={lane}
          type="button"
          aria-label={lane === 'left' ? '왼쪽 레인' : '오른쪽 레인'}
          // click 은 손을 뗄 때 오므로 판정이 늦는다. 누르는 순간을 쓴다.
          onPointerDown={(event) => {
            event.preventDefault();
            onPress(lane, event.timeStamp);
          }}
          className="pointer-events-auto flex flex-1 touch-none items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-4xl text-white/45 select-none active:bg-white/15"
        >
          {lane === 'left' ? '←' : '→'}
        </button>
      ))}
    </div>
  );
}
