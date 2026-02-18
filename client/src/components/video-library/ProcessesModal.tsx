import { useId, useRef } from "react";
import type { SpriteProgressJob } from "../../hooks/useSpriteProgress";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";

interface ProcessesModalProps {
  open: boolean;
  jobs: SpriteProgressJob[];
  onClose: () => void;
}

function formatStatus(job: SpriteProgressJob) {
  if (job.status === "extracting") {
    return "Extracting";
  }
  if (job.status === "tiling") {
    return "Tiling";
  }
  return "Running";
}

function formatDetail(job: SpriteProgressJob) {
  if (job.status === "extracting") {
    if (job.total > 0) {
      return `${job.current}/${job.total} frames`;
    }
    return `${job.current} frames`;
  }
  return "Building sprite sheet";
}

function getProgress(job: SpriteProgressJob) {
  if (job.status !== "extracting" || job.total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((job.current / job.total) * 100)));
}

export default function ProcessesModal({ open, jobs, onClose }: ProcessesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap({ active: open, containerRef: dialogRef });
  if (!open) return null;

  return (
    <div className="action-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="action-modal processes-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} className="action-modal-title">Processes</div>
        <div className="processes-meta">
          {jobs.length === 0 ? "No active jobs" : `${jobs.length} active ${jobs.length === 1 ? "job" : "jobs"}`}
        </div>

        <div className="processes-list">
          {jobs.length === 0 ? (
            <div className="processes-empty">Nothing running right now.</div>
          ) : (
            jobs.map((job) => {
              const progress = getProgress(job);
              return (
                <div key={job.videoId} className="process-item">
                  <div className="process-item-head">
                    <div className="process-title">{job.title}</div>
                    <div className="process-status">{formatStatus(job)}</div>
                  </div>
                  <div className="process-detail">
                    {formatDetail(job)}
                    {progress != null && <span className="process-progress-value">{progress}%</span>}
                  </div>
                  {progress != null && (
                    <div className="process-progress-line" style={{ width: `${progress}%` }} />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="action-modal-actions">
          <button type="button" className="action-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
