'use client';

import { GameCanvas } from '@/components/GameCanvas';
import { Hud } from '@/components/Hud';
import { ResultOverlay } from '@/components/ResultOverlay';
import { TitleScreen } from '@/components/TitleScreen';
import { RULESETS, type Difficulty } from '@/lib/game/config';
import { applyJudge, createRun } from '@/lib/game/score';
import type { JudgeEvent } from '@/lib/game/types';
import { getBestServerSnapshot, getBestSnapshot, recordBest, subscribeBest } from '@/lib/storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** 타이머 갱신 간격 (ms). 0.1초까지만 보여주므로 이보다 자주 그릴 필요가 없다. */
const TICK_MS = 100;

export function Game() {
  const best = useSyncExternalStore(subscribeBest, getBestSnapshot, getBestServerSnapshot);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  // 판 시작 시점의 기록. 판 도중에 숫자가 바뀌지 않도록 고정해 둔다.
  const [target, setTarget] = useState(0);
  const [run, setRun] = useState(() => createRun(RULESETS.normal.lives));
  // 판을 새로 시작할 때 엔진을 통째로 새로 만들기 위한 키.
  const [runId, setRunId] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const rules = RULESETS[difficulty ?? 'normal'];
  const over = run.lives === 0;
  const playing = difficulty !== null && !over;

  useEffect(() => {
    if (!playing) return;

    const startedAt = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - startedAt), TICK_MS);
    return () => clearInterval(id);
  }, [playing, runId]);

  useEffect(() => {
    if (over && difficulty !== null) recordBest(difficulty, run.score);
  }, [over, difficulty, run.score]);

  const handleJudge = useCallback((event: JudgeEvent) => {
    setRun((prev) => applyJudge(prev, event));
  }, []);

  const start = useCallback((level: Difficulty) => {
    setDifficulty(level);
    setTarget(getBestSnapshot()[level] ?? 0);
    setRun(createRun(RULESETS[level].lives));
    setRunId((id) => id + 1);
    setElapsed(0);
  }, []);

  const restart = useCallback(() => {
    if (difficulty !== null) start(difficulty);
  }, [difficulty, start]);

  /** 중간에 나가도 그때까지의 점수는 기록에 반영한다. */
  const exit = useCallback(() => {
    if (difficulty !== null) recordBest(difficulty, run.score);
    setDifficulty(null);
  }, [difficulty, run.score]);

  useEffect(() => {
    if (!playing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      exit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playing, exit]);

  if (difficulty === null) {
    return (
      <div className="relative h-full w-full">
        <TitleScreen best={best} onStart={start} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <GameCanvas key={runId} running={playing} rules={rules} onJudge={handleJudge} />
      <Hud
        score={run.score}
        best={target}
        combo={run.combo}
        lives={run.lives}
        maxLives={rules.lives}
        elapsedMs={elapsed}
        onExit={playing ? exit : undefined}
      />
      {over ? (
        <ResultOverlay
          score={run.score}
          best={target}
          isNewBest={run.score > target}
          bestCombo={run.bestCombo}
          // 죽은 정확한 시각은 엔진이 판정 이벤트로 알려준 값을 쓴다.
          survivedMs={run.endedAt ?? elapsed}
          difficulty={difficulty}
          onRestart={restart}
          onChangeDifficulty={exit}
        />
      ) : (
        <p className="key-hint pointer-events-none absolute inset-x-0 bottom-6 text-center font-mono text-sm tracking-[0.25em] text-white/40">
          ← A F &nbsp;/&nbsp; → D J
        </p>
      )}
    </div>
  );
}
