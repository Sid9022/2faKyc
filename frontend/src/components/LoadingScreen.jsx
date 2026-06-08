import { ShieldCheck } from "lucide-react";

export default function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/80 p-8 text-center shadow-xl shadow-gray-200/70 backdrop-blur">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white">
          <ShieldCheck size={26} />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-gray-950">
          Opening your secure KYC link
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-500">
          Please wait while we verify your secure access link.
        </p>

        <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gray-950" />
        </div>
      </div>
    </div>
  );
}
