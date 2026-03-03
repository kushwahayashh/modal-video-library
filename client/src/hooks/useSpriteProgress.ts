import { useCallback, useEffect, useRef, useState } from "react";

export interface SpriteProgressJob {
  videoId: string;
  title: string;
  status: string;
  current: number;
  total: number;
  error: string | null;
}

const ACTIVE_POLL_INTERVAL = 1000;
const IDLE_POLL_INTERVAL = 30000;

export function useSpriteProgress(onJobSettled?: (job: SpriteProgressJob) => void) {
  const [activeSpriteJobs, setActiveSpriteJobs] = useState<SpriteProgressJob[]>([]);
  const seenActiveJobIdsRef = useRef(new Set<string>());
  const notifiedSettledIdsRef = useRef(new Set<string>());
  const onJobSettledRef = useRef(onJobSettled);
  onJobSettledRef.current = onJobSettled;

  const activeRef = useRef(true);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => void>(() => {});

  pollRef.current = async () => {
    let hasRunning = false;

    try {
      const res = await fetch("/api/sprites/progress");
      if (!res.ok || !activeRef.current) return;

      const data = (await res.json()) as { jobs?: SpriteProgressJob[] };
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];

      if (!activeRef.current) return;

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

      hasRunning = runningJobs.length > 0;
      setActiveSpriteJobs(runningJobs);
    } catch {
      // Ignore polling errors; next tick retries.
    } finally {
      if (activeRef.current) {
        const delay = hasRunning ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
        timeoutIdRef.current = setTimeout(() => pollRef.current(), delay);
      }
    }
  };

  useEffect(() => {
    activeRef.current = true;
    pollRef.current();

    return () => {
      activeRef.current = false;
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    pollRef.current();
  }, []);

  return { activeSpriteJobs, refresh };
}
