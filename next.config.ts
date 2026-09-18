import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

/**
 * 개발 서버는 localhost 외의 출처에서 오는 /_next/* 요청을 막는다(403).
 * 같은 공유기에 붙은 폰으로 열어보려면 이 기기의 LAN 주소를 허용해야 하는데,
 * DHCP 로 바뀌니 하드코딩하지 않고 서버가 뜰 때 읽는다. 주소가 바뀌면 dev 서버를 다시 띄운다.
 */
function localAddresses(): string[] {
  const addresses: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: localAddresses(),
};

export default nextConfig;
