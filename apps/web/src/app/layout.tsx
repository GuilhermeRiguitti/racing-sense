import type { ReactNode } from 'react';

export const metadata = {
  title: 'Telemetry Analysis',
  description: 'Análise de telemetria do iRacing',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
