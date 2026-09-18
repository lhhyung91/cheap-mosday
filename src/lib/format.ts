/** 0:38.2 형태. 엔들리스 한 판이 시간 단위로 갈 일은 없어 분까지만 쓴다. */
export function formatTime(ms: number) {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
