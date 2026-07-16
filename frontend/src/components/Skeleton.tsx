import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer rounded bg-gray-200 dark:bg-gray-700 ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-4/5", "w-3/4", "w-5/6", "w-2/3"];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${className}`}>
      <Skeleton className="mb-3 h-4 w-2/3" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonList({ count = 5, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6, cols = 6 }: { count?: number; cols?: number }) {
  const colClasses: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    6: "grid-cols-2 md:grid-cols-4 lg:grid-cols-6",
  };
  return (
    <div className={`grid gap-6 ${colClasses[cols] || "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[3/4] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      className={`rounded-full`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonChatMessage({
  role,
}: {
  role: "user" | "assistant";
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg p-4 ${
          isUser
            ? "bg-blue-100 dark:bg-blue-900/30"
            : "bg-gray-100 dark:bg-gray-800"
        }`}
      >
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

export default Skeleton;
