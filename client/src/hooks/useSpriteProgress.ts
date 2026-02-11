import { useEffect, useRef, useState } from "react";

export interface SpriteProgressJob {
  videoId: string;
  title: string;
  status: string;
  current: number;
  total: number;
  error: string | null;
}

export function useSpriteProgress(onJobSettled?: (job: SpriteProgressJob) => void) {
  const [activeSpriteJobs, setActiveSpriteJobs] = useState<SpriteProgressJob[]>([]);
  const seenActiveJobIdsRef = useRef(new Set<string>());
  const notifiedSettledIdsRef = useRef(new Set<string>());
  const onJobSettledRef = useRef(onJobSettled);
  onJobSettledRef.current = onJobSettled;

  useEffect(() => {
    let active = true;

    const pollProgress = async () => {
      try {
        const res = await fetch("/api/sprites/progress");
        if (!res.ok) return;

        const data = (await res.json()) as { jobs?: SpriteProgressJob[] };
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];

        if (!active) return;

        const runningJobs: SpriteProgressJob[] = [];
        for (const job of jobs) {
          if (job.status === "extracting" || job.status === "tiling") {
            runningJobs.push(job);
            seenActiveJobIdsRef.current.add(job.videoId);
            notifiedSettledIdsRef.current.delete(job.videoId);
            continue;
          }

          if (job.status !== "done" && job.status !== "error") continue;
          if (!seenActiveJobIdsRef.current.has(job.videoId)) continue;
          if (notifiedSettledIdsRef.current.has(job.videoId)) continue;
          notifiedSettledIdsRef.current.add(job.videoId);
          onJobSettledRef.current?.(job);
        }

        setActiveSpriteJobs(runningJobs);
      } catch {
        // Ignore polling errors; next tick retries.
      }
    };

    pollProgress();
    const interval = setInterval(pollProgress, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return activeSpriteJobs;
}
