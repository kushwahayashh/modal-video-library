import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      toastOptions={{
        style: {
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "0px",
          fontFamily: "var(--font-sans)",
          fontSize: "0.8125rem",
          boxShadow: "none",
        },
        classNames: {
          description: "!text-[var(--text-secondary)]",
          actionButton: "!bg-[var(--accent)] !text-[var(--bg-primary)]",
          cancelButton: "!bg-[var(--bg-tertiary)] !text-[var(--text-secondary)]",
          success: "!border-[var(--border)] !text-[var(--success)]",
          error: "!border-[var(--border)] !text-[var(--danger)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
