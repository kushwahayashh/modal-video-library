import { useState, useEffect, useRef, type ReactNode } from "react";

const SEEN_KEY = "luna-auth-seen";

export default function PasswordGate({ children }: { children: ReactNode }) {
  // Returning users (cookie almost certainly still valid) render the app
  // optimistically so there's no login flash; we verify in the background.
  const [status, setStatus] = useState<"checking" | "locked" | "ok">(() =>
    localStorage.getItem(SEEN_KEY) === "1" ? "ok" : "checking"
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/check")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => {
        if (!active) return;
        if (data?.authenticated) {
          localStorage.setItem(SEEN_KEY, "1");
          setStatus("ok");
        } else {
          localStorage.removeItem(SEEN_KEY);
          setStatus("locked");
        }
      })
      .catch(() => active && setStatus("locked"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status === "locked") inputRef.current?.focus();
  }, [status]);

  if (status === "ok") {
    return <>{children}</>;
  }

  if (status === "checking") {
    return (
      <div className="pw-gate">
        <div className="pw-term">
          <div className="pw-line pw-dim">LUNA SYSTEM [v1.0]</div>
          <div className="pw-line pw-dim">
            establishing connection
            <span className="pw-cursor" />
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        localStorage.setItem(SEEN_KEY, "1");
        setStatus("ok");
        return;
      }
      setError(true);
      setInput("");
    } catch {
      setError(true);
      setInput("");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const focusInput = () => inputRef.current?.focus();

  return (
    <div className="pw-gate" onClick={focusInput}>
      <form className="pw-term" onSubmit={handleSubmit} autoComplete="off">
        <div className="pw-line pw-dim">LUNA SYSTEM [v1.0]</div>
        <div className="pw-line pw-dim">authentication required</div>
        <div className="pw-line pw-spacer" />
        <div className="pw-line pw-input-line">
          <span className="pw-prompt">luna@system:~$</span>
          <span className="pw-typed">
            {"*".repeat(input.length)}
            <span className="pw-cursor" />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="pw-hidden-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(false);
            }}
            disabled={submitting}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            aria-label="access key"
          />
        </div>
        {error && (
          <div className="pw-line pw-err">
            access denied: invalid credentials
          </div>
        )}
      </form>
    </div>
  );
}
