import { formatTime } from '@/lib/format';
import { comboMultiplier } from '@/lib/game/score';

type HudProps = {
  score: number;
  best: number;
  combo: number;
  lives: number;
  maxLives: number;
  elapsedMs: number;
  /** 플레이 중일 때만 넘어온다. 게임오버 화면에는 별도 버튼이 있다. */
  onExit?: () => void;
};

export function Hud({ score, best, combo, lives, maxLives, elapsedMs, onExit }: HudProps) {
  const multiplier = comboMultiplier(combo);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 font-mono sm:p-6">
      <div>
        <p className="text-3xl tabular-nums sm:text-4xl">{score.toLocaleString()}</p>
        {best > 0 && (
          <p className="mt-1 text-sm tracking-[0.15em] text-white/50 tabular-nums">
            BEST {best.toLocaleString()}
          </p>
        )}
        {combo >= 2 && (
          <p className="mt-1 text-sm tracking-[0.15em] text-white/50">
            {combo} COMBO{multiplier > 1 && ` ×${multiplier}`}
          </p>
        )}
      </div>
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          // 판 중에 엄지가 닿지 않는 위쪽 가운데. 하단은 터치 패드가 쓴다.
          className="pointer-events-auto min-h-11 px-3 font-sans text-base text-white/50 transition-colors hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          나가기
        </button>
      )}
      <div className="flex flex-col items-end gap-2.5">
        <p className="text-lg text-white/70 tabular-nums sm:text-xl">{formatTime(elapsedMs)}</p>
        <div className="flex gap-2">
          {Array.from({ length: maxLives }, (_, index) => (
            <div key={index} className={`size-3 ${index < lives ? 'bg-ink' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
