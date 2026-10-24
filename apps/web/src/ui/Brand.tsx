/** U5: the product mark — three stacked frames, one master artwork becoming many sizes. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="sc-brand__mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="sc-brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#sc-brand-g)" />
      <rect x="8" y="8" width="11" height="16" rx="2.5" fill="#fff" fillOpacity="0.95" />
      <rect x="15" y="12" width="10" height="7" rx="2" fill="#fff" fillOpacity="0.7" />
      <rect x="15" y="21" width="6" height="4" rx="1.5" fill="#fff" fillOpacity="0.5" />
    </svg>
  );
}

export const PRODUCT_NAME = 'Smart Canvas';
