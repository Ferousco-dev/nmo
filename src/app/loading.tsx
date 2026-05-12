// Rendered during route transitions / server component loads.
// A centered spinner — same style we use elsewhere in the app
// (welcome search, signup celebration, questionnaire submit).

import { Logo } from '@/components/Logo';

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      {/* Soft glow behind the spinner so it doesn't look bare */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <div className="relative">
        {/* Subtle brand mark behind the spinner */}
        <div className="absolute inset-0 m-auto h-7 w-7 opacity-60">
          <Logo size={28} />
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-accent/30 border-t-accent animate-spin" />
      </div>
    </div>
  );
}
