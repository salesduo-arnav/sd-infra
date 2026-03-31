import { useEffect } from 'react';

interface PageTitleProps {
  title: string;
  children: React.ReactNode;
}

const BASE_TITLE = 'SalesDuo';

export function PageTitle({ title, children }: PageTitleProps) {
  useEffect(() => {
    document.title = `${title} — ${BASE_TITLE}`;
    return () => { document.title = BASE_TITLE; };
  }, [title]);

  return <>{children}</>;
}
