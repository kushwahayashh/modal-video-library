import { useState, useEffect, useCallback } from "react";
import { Folder, File, Pencil, Trash2, FolderOpen } from "lucide-react";
import "./FileManager.css";

const formatSize = (bytes) => {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function FileManager() {
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [modal, setModal] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchFiles = useCallback(async (path) => {
    setLoading(true);
    try {
      const apiPath = path === "/" ? "" : path.replace(/^\//, "");
      const res = await fetch(`/api/files?path=${encodeURIComponent(apiPath)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setFiles(data);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  const navigateTo = (path) => setCurrentPath(path);

  const breadcrumbParts = currentPath.split("/").filter(Boolean);

  const openRename = (file) => {
    setSelectedFile(file);
    setRenameValue(file.name);
    setModal("rename");
  };

  const openDelete = (file) => {
    setSelectedFile(file);
    setModal("delete");
  };

  const closeModal = () => {
    setModal(null);
    setSelectedFile(null);
    setRenameValue("");
  };

  const confirmRename = async () => {
    if (!renameValue.trim() || !selectedFile) return;
    const pathParts = selectedFile.path.split("/");
    pathParts.pop();
    const newPath = [...pathParts, renameValue.trim()].join("/");

    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: selectedFile.path, newPath }),
      });
      if (!res.ok) throw new Error();
      closeModal();
      fetchFiles(currentPath);
    } catch {
      alert("Failed to rename");
    }
  };

  const confirmDelete = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(selectedFile.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      closeModal();
      fetchFiles(currentPath);
    } catch {
      alert("Failed to delete");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeModal();
  };

  return (
    <div className="fm-app">
      <header className="fm-header">
        <div className="fm-title">File Manager</div>
      </header>

      <div className="fm-toolbar">
        <div className="fm-breadcrumb">
          <button className="fm-crumb" onClick={() => navigateTo("")}>/</button>
          {breadcrumbParts.map((part, i) => {
            const path = breadcrumbParts.slice(0, i + 1).join("/");
            return (
              <span key={path}>
                <span className="fm-crumb-sep">/</span>
                <button className="fm-crumb" onClick={() => navigateTo(path)}>{part}</button>
              </span>
            );
          })}
        </div>
      </div>

      <div className="fm-list-container">
        {loading ? (
          <div className="fm-loading">Loading...</div>
        ) : files.length === 0 ? (
          <div className="fm-empty">
            <FolderOpen size={48} strokeWidth={1} />
            <span>This folder is empty</span>
          </div>
        ) : (
          <div className="fm-list">
            {files.map((file) => (
              <div
                key={file.path}
                className={`fm-item ${file.isFolder ? "folder" : ""}`}
                onClick={() => file.isFolder && navigateTo(file.path)}
              >
                <div className="fm-name">
                  {file.isFolder ? (
                    <Folder size={18} className="fm-icon folder" />
                  ) : (
                    <File size={18} className="fm-icon" />
                  )}
                  <span className="fm-name-text">{file.name}</span>
                </div>
                <div className="fm-size">{file.isFolder ? "-" : formatSize(file.size)}</div>
                <div className="fm-date">{formatDate(file.modified)}</div>
                <div className="fm-actions">
                  <button
                    className="fm-action-btn"
                    onClick={(e) => { e.stopPropagation(); openRename(file); }}
                    title="Rename"
                  >
                    <Pencil size={20} />
                  </button>
                  <button
                    className="fm-action-btn delete"
                    onClick={(e) => { e.stopPropagation(); openDelete(file); }}
                    title="Delete"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fm-modal-overlay" onClick={closeModal}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            {modal === "rename" ? (
              <>
                <div className="fm-modal-title">Rename</div>
                <input
                  className="fm-modal-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <div className="fm-modal-actions">
                  <button className="fm-btn secondary" onClick={closeModal}>Cancel</button>
                  <button className="fm-btn primary" onClick={confirmRename}>Rename</button>
                </div>
              </>
            ) : (
              <>
                <div className="fm-modal-title">Delete</div>
                <div className="fm-modal-message">
                  Are you sure you want to delete "{selectedFile?.name}"?
                </div>
                <div className="fm-modal-actions">
                  <button className="fm-btn secondary" onClick={closeModal}>Cancel</button>
                  <button className="fm-btn danger" onClick={confirmDelete}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FileManager;
