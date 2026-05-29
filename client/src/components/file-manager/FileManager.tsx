import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { toast } from "sonner";
import {
  IconFolderFilled,
  IconFileFilled,
  IconArrowLeft,
  IconChevronRight,
  IconLoader,
  IconFolderPlus,
  IconSignature,
  IconTrash,
  IconFolderOpen,
  IconDownload,
  IconAlertSquareRoundedFilled,
  IconTrashFilled,
} from "@tabler/icons-react";
import "./FileManager.css";
import "../video-library/ContextMenu.css";

type FileItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeFormatted: string;
  modifiedAt: string;
};

export default function FileManager({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const [currentPath, setCurrentPath] = useState("/");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<FileItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [infoData, setInfoData] = useState<Record<string, string> | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; item: FileItem | null }>({ visible: false, x: 0, y: 0, item: null });
  const [ctxClosing, setCtxClosing] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);
  const ctxCloseTimer = useRef<number | null>(null);

  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async (dirPath: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/files?path=" + encodeURIComponent(dirPath));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load files");
      }
      const data = await res.json();
      setCurrentPath(data.path);
      setParentPath(data.parentPath);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
      setItems([]);
      toast.error(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!embedded) document.title = "Files";
    fetchFiles("/");
  }, []);

  useEffect(() => {
    if (creatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [creatingFolder]);

  useEffect(() => {
    if (renamingPath) {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        // Select only the stem (before extension) so the extension is editable but not selected by default
        const item = items.find((i) => i.path === renamingPath);
        if (item && !item.isDirectory) {
          const dotIndex = renameValue.lastIndexOf(".");
          if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
          } else {
            input.select();
          }
        } else {
          input.select();
        }
      }
    }
  }, [renamingPath]);

  const navigateTo = (dirPath: string) => {
    setCreatingFolder(false);
    setRenamingPath(null);
    setDeleteConfirm(null);
    fetchFiles(dirPath);
  };

  const goUp = () => {
    if (parentPath) navigateTo(parentPath);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    try {
      const res = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create folder");
      }
      setCreatingFolder(false);
      fetchFiles(currentPath, true);
      toast.success("Folder created");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getExtension = (name: string) => {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i) : "";
  };

  const handleConfirmRename = async () => {
    if (!renamingPath) return;
    const item = items.find((i) => i.path === renamingPath);
    if (!item) return;

    const newName = renameValue.trim();
    if (!newName || newName === item.name) {
      setRenamingPath(null);
      return;
    }

    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path, newName }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to rename");
      }
      setRenamingPath(null);
      fetchFiles(currentPath, true);
      toast.success("Renamed successfully");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: deleteConfirm.path }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete");
      }
      setDeleteConfirm(null);
      fetchFiles(currentPath, true);
      toast.success("Deleted successfully");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const openCtxMenu = useCallback((e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (ctxCloseTimer.current !== null) {
      window.clearTimeout(ctxCloseTimer.current);
      ctxCloseTimer.current = null;
    }
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, item });
    setCtxClosing(false);
  }, []);

  const closeCtxMenu = useCallback(() => {
    setCtxClosing(true);
    ctxCloseTimer.current = window.setTimeout(() => {
      setCtxMenu((prev) => ({ ...prev, visible: false, item: null }));
      setCtxClosing(false);
      ctxCloseTimer.current = null;
    }, 140);
  }, []);

  useLayoutEffect(() => {
    if (!ctxMenu.visible || !ctxRef.current) return;
    const rect = ctxRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    const x = Math.min(Math.max(ctxMenu.x, 8), Math.max(maxX, 8));
    const y = Math.min(Math.max(ctxMenu.y, 8), Math.max(maxY, 8));
    if (x !== ctxMenu.x || y !== ctxMenu.y) {
      setCtxMenu((prev) => ({ ...prev, x, y }));
    }
  }, [ctxMenu.visible, ctxMenu.x, ctxMenu.y]);

  useEffect(() => {
    if (!ctxMenu.visible) return;
    const handleClick = (e: PointerEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtxMenu();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCtxMenu(); };
    const handleScroll = () => closeCtxMenu();
    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [ctxMenu.visible, closeCtxMenu]);

  useEffect(() => {
    return () => { if (ctxCloseTimer.current !== null) window.clearTimeout(ctxCloseTimer.current); };
  }, []);

  const handleDownload = (item: FileItem) => {
    if (item.isDirectory) {
      toast.error("Cannot download a directory");
      return;
    }
    const a = document.createElement("a");
    a.href = "/api/files/download?path=" + encodeURIComponent(item.path);
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleShowInfo = async (item: FileItem) => {
    setInfoLoading(true);
    setInfoData(null);
    try {
      const res = await fetch("/api/files/info?path=" + encodeURIComponent(item.path));
      if (!res.ok) throw new Error("Failed to load info");
      const data = await res.json();
      const info: Record<string, string> = {
        Name: data.name,
        Path: data.path,
        Type: data.isDirectory ? "Folder" : "File",
      };
      if (!data.isDirectory) {
        info["Size"] = data.sizeFormatted;
        info["Extension"] = data.extension;
      }
      if (data.isDirectory && data.itemCount !== undefined) {
        info["Items"] = String(data.itemCount);
      }
      info["Created"] = formatDate(data.createdAt);
      info["Modified"] = formatDate(data.modifiedAt);
      setInfoData(info);
    } catch (e: any) {
      toast.error(e.message);
      setInfoData(null);
    } finally {
      setInfoLoading(false);
    }
  };

  const handleCtxAction = (action: string, item: FileItem) => {
    closeCtxMenu();
    switch (action) {
      case "rename":
        setRenamingPath(item.path);
        setRenameValue(item.name);
        break;
      case "delete":
        setDeleteConfirm(item);
        break;
      case "download":
        handleDownload(item);
        break;
      case "info":
        handleShowInfo(item);
        break;
    }
  };

  const ctxMenuItems = [
    { id: "rename", label: "Rename", icon: IconSignature, stroke: 2.5 },
    { id: "download", label: "Download", icon: IconDownload, stroke: 2.5 },
    { id: "info", label: "Properties", icon: IconAlertSquareRoundedFilled },
    { id: "delete", label: "Delete", icon: IconTrashFilled, danger: true },
  ];

  const breadcrumbs = currentPath === "/" ? ["/"] : ["/", ...currentPath.split("/").filter(Boolean)];
  const breadcrumbPaths = breadcrumbs.map((_, i) => {
    if (i === 0) return "/";
    return "/" + breadcrumbs.slice(1, i + 1).join("/");
  });

  return (
    <div className={`fm-app ${embedded ? "fm-app-embedded" : ""}`}>
      {!embedded && (
        <nav className="nav">
          <div className="container nav-content">
            <a className="nav-logo" href="/cf">
              VIDEO<span>LIB</span>
            </a>
            <div className="nav-right">
              <a href="/" className="nav-btn nav-btn-terminal">
                Video Library
              </a>
              <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn nav-btn-terminal">
                Terminal
              </a>
            </div>
          </div>
        </nav>
      )}

      <div className="fm-container">
        <div className="fm-toolbar">
          <div className="fm-toolbar-left">
            <button
              className="fm-toolbar-btn"
              onClick={goUp}
              disabled={!parentPath}
              title="Go up"
            >
              <IconArrowLeft size={22} />
            </button>
            <div className="fm-breadcrumbs">
              {breadcrumbs.map((seg, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <span className="fm-breadcrumb-sep">
                        <IconChevronRight size={16} />
                      </span>
                    )}
                    <span className="fm-breadcrumb-segment">
                      <button
                        className={`fm-breadcrumb-btn ${isLast ? "active" : ""}`}
                        onClick={() => navigateTo(breadcrumbPaths[i])}
                        disabled={isLast}
                      >
                        {seg === "/" ? "root" : seg}
                      </button>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <div className="fm-toolbar-right">
            <button
              className="fm-toolbar-btn"
              onClick={() => fetchFiles(currentPath)}
              title="Refresh"
            >
              <IconLoader size={22} />
            </button>
            <button
              className="fm-toolbar-btn"
              onClick={() => {
                setCreatingFolder(true);
                setNewFolderName("");
              }}
            >
              <IconFolderPlus size={22} /> <span>New Folder</span>
            </button>
          </div>
        </div>

        <div className="fm-list">
          <div className="fm-row fm-row-header">
            <div className="fm-col-name">Name</div>
            <div className="fm-col-size">Size</div>
            <div className="fm-col-modified">Modified</div>
            <div className="fm-col-actions"></div>
          </div>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="fm-row fm-row-skeleton">
                <div className="fm-col-name">
                  <div
                    className="fm-skeleton-bar"
                    style={{ width: `${40 + Math.random() * 40}%` }}
                  />
                </div>
                <div className="fm-col-size">
                  <div className="fm-skeleton-bar" style={{ width: "50%" }} />
                </div>
                <div className="fm-col-modified">
                  <div className="fm-skeleton-bar" style={{ width: "60%" }} />
                </div>
                <div className="fm-col-actions"></div>
              </div>
            ))
          ) : error ? (
            <div className="fm-empty">
              <p>{error}</p>
              <button
                className="fm-empty-btn"
                onClick={() => fetchFiles(currentPath)}
              >
                Retry
              </button>
            </div>
          ) : items.length === 0 && !creatingFolder ? (
            <div className="fm-empty">
              <IconFolderOpen size={48} className="fm-empty-icon" />
              <p style={{ marginTop: "16px" }}>This folder is empty</p>
            </div>
          ) : (
            <>
              {creatingFolder && (
                <div className="fm-row fm-row-item fm-row-new-folder">
                  <div className="fm-col-name">
                    <IconFolderFilled size={22} className="fm-icon-folder" />
                    <input
                      ref={newFolderInputRef}
                      className="fm-inline-input new-folder"
                      placeholder="Folder name"
                      value={newFolderName}
                      spellCheck="false"
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateFolder();
                        }
                        if (e.key === "Escape") {
                          setCreatingFolder(false);
                        }
                      }}
                      onBlur={() => {
                        if (!newFolderName.trim()) setCreatingFolder(false);
                        else handleCreateFolder();
                      }}
                    />
                  </div>
                  <div className="fm-col-size"></div>
                  <div className="fm-col-modified"></div>
                  <div className="fm-col-actions"></div>
                </div>
              )}

              {items.map((item, idx) => {
                const Icon = item.isDirectory ? IconFolderFilled : IconFileFilled;
                const iconClass = item.isDirectory ? "fm-icon-folder" : "fm-icon-file";

                return (
                  <div
                    key={idx}
                    className={`fm-row fm-row-item ${item.isDirectory ? "fm-row-dir" : ""} ${ctxMenu.visible && ctxMenu.item?.path === item.path ? "fm-row-selected" : ""}`}
                    onClick={() => {
                      if (item.isDirectory) navigateTo(item.path);
                    }}
                    onContextMenu={(e) => openCtxMenu(e, item)}
                  >
                    <div className="fm-col-name">
                      <Icon size={22} className={iconClass} />
                      {renamingPath === item.path ? (
                        <input
                          ref={renameInputRef}
                          className="fm-inline-input rename"
                          value={renameValue}
                          spellCheck="false"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleConfirmRename();
                            }
                            if (e.key === "Escape") {
                              setRenamingPath(null);
                            }
                          }}
                          onBlur={handleConfirmRename}
                        />
                      ) : (
                        <span className="fm-name">{item.name}</span>
                      )}
                    </div>
                    <div className="fm-col-size">{item.sizeFormatted}</div>
                    <div className="fm-col-modified">{formatDate(item.modifiedAt)}</div>
                    <div
                      className="fm-col-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="fm-row-btn"
                        onClick={() => {
                          setRenamingPath(item.path);
                          setRenameValue(item.name);
                        }}
                      >
                        <IconSignature size={20} /> Rename
                      </button>
                      <button
                        className="fm-row-btn danger"
                        onClick={() => setDeleteConfirm(item)}
                      >
                        <IconTrash size={20} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {ctxMenu.visible && ctxMenu.item && (
        <div
          ref={ctxRef}
          className={`context-menu ${ctxClosing ? "closing" : ""}`}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
        >
          {ctxMenuItems.map((mi, i) => (
            <div key={mi.id}>
              {i > 0 && <div className="context-menu-divider" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`context-menu-item ${mi.danger ? "danger" : ""}`}
                onClick={() => handleCtxAction(mi.id, ctxMenu.item!)}
              >
                <mi.icon size={18} stroke={mi.stroke} />
                <span>{mi.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div
          className="fm-overlay"
          onClick={() => setDeleteConfirm(null)}
        >
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-title">
              Delete {deleteConfirm.isDirectory ? "Folder" : "File"}
            </div>
            <div className="fm-modal-message">
              Are you sure you want to delete <strong>"{deleteConfirm.name}"</strong>?
              {deleteConfirm.isDirectory && (
                <>
                  <br />
                  <span className="fm-text-muted">
                    All contents will be permanently removed.
                  </span>
                </>
              )}
              <br />
              <span className="fm-text-muted">This action cannot be undone.</span>
            </div>
            <div className="fm-modal-actions">
              <button
                className="fm-action-btn secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="fm-action-btn danger"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(infoData || infoLoading) && (
        <div className="fm-overlay" onClick={() => { setInfoData(null); setInfoLoading(false); }}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-title">Properties</div>
            {infoLoading ? (
              <div className="fm-modal-message" style={{ textAlign: "center", padding: "24px 0" }}>Loading…</div>
            ) : infoData ? (
              <div className="fm-modal-message">
                {Object.entries(infoData).map(([key, val]) => (
                  <div key={key} className="fm-info-row">
                    <span className="fm-info-label">{key}</span>
                    <span className="fm-info-value">{val}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="fm-modal-actions">
              <button className="fm-action-btn secondary" onClick={() => { setInfoData(null); setInfoLoading(false); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
