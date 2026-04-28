import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <path d="M15 26c-5-1-8-5-9-10 6 .5 10 3 12 7 4-4 9-6 14-6s10 2 14 6c2-4 6-6.5 12-7-1 5-4 9-9 10 2 4 3 8 3 12 0 11-9 20-20 20S12 49 12 38c0-4 1-8 3-12Z" fill="currentColor" opacity=".22" />
      <path d="M19 29c3-6 8-9 13-9s10 3 13 9c2 3 3 6 3 10 0 9-7 16-16 16s-16-7-16-16c0-4 1-7 3-10Z" fill="currentColor" />
      <path d="M21 14c5 1 9 4 11 8M43 14c-5 1-9 4-11 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M25 38h.01M39 38h.01" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <path d="M29 45h6" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}