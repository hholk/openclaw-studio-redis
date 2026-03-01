import { Suspense } from "react";
import StudioPageInner from "../StudioPageInner";

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">Loading Studio...</div>}>
      <StudioPageInner />
    </Suspense>
  );
}
