/** U5: the product mark — three stacked frames, one master artwork becoming many sizes. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="sc-brand__mark flex-none [filter:drop-shadow(0_4px_10px_rgb(79_140_255/0.35))]" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
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

/** The mark and the product name side by side. */
const BRAND_TEXT = 'items-center gap-10 text-[15px] font-[700] tracking-[-0.02em]';
export const BRAND = `sc-brand inline-flex ${BRAND_TEXT} text-fg`;
/** On the sign-in screen's dark brand panel. */
export const BRAND_ON_DARK = `sc-brand inline-flex ${BRAND_TEXT} text-[white]`;
/** Above the sign-in form, only where the brand panel is hidden (900 px and narrower). */
export const BRAND_MOBILE = `sc-brand sc-auth__mobile-brand hidden ${BRAND_TEXT} text-fg max-lg:inline-flex max-lg:justify-self-center`;
