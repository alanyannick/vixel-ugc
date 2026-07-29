export function IconMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 36 36"
      fill="none"
    >
      <path
        d="M4 7.5 18 2l14 5.5v14L18 34 4 21.5v-14Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m10 10 8 14 8-14M12.5 15h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

