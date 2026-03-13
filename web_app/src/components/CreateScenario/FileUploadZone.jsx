import React, { useRef } from "react";
import { getToken } from "../../utils/auth";

// Auto-detect file type from extension
const EXT_TYPE_MAP = {
    log: "Log File", txt: "Log File",
    pcap: "Network Capture", pcapng: "Network Capture", cap: "Network Capture",
    e01: "Disk Image", dd: "Disk Image", img: "Disk Image", raw: "Disk Image", vmdk: "Disk Image",
    mem: "Memory Dump", dmp: "Memory Dump", raw_mem: "Memory Dump",
    pdf: "PDF Document",
    mp4: "Video", avi: "Video", mov: "Video",
    jpg: "Image", jpeg: "Image", png: "Image",
    zip: "Archive", tar: "Archive", gz: "Archive", "7z": "Archive",
    docx: "Word Document", xlsx: "Spreadsheet", csv: "Spreadsheet",
    reg: "Registry Hive", evtx: "Event Log", lnk: "Shortcut File",
    ps1: "PowerShell Script", bat: "Batch Script", sh: "Shell Script",
    py: "Python Script",
};

function detectFileType(filename) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return EXT_TYPE_MAP[ext] || "File";
}

function formatBytes(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadZone({ inject, onUpdate }) {
    const fileInputRef = useRef(null);
    const token = getToken();

    const handleFileSelect = async (file) => {
        if (!file) return;

        const fileType = detectFileType(file.name);
        onUpdate({
            ...inject,
            file_name: file.name,
            file_type: fileType,
            file_size: file.size,
            file_obj: file,
            upload_status: "uploading",
        });

        // Upload file to server
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uploads`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (!res.ok) throw new Error("Upload failed");

            const { file_path } = await res.json();

            onUpdate({
                ...inject,
                file_path,
                upload_status: "done",
            });
        } catch (err) {
            console.error("Upload error:", err);
            onUpdate({
                ...inject,
                upload_status: "error",
            });
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length) handleFileSelect(files[0]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const clearFile = () => {
        onUpdate({
            ...inject,
            file_name: "",
            file_type: "",
            file_size: null,
            file_path: "",
            file_obj: null,
            upload_status: "idle",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="cs-file-upload">
            {inject.upload_status === "idle" && !inject.file_name && (
                <div
                    className="cs-file-upload__zone"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <div className="cs-file-upload__content">
                        <div className="cs-file-upload__icon">📁</div>
                        <div className="cs-file-upload__text">
                            <strong>Drag a file here</strong> or{" "}
                            <button type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ background: "none", border: "none", color: "#0066cc", cursor: "pointer", textDecoration: "underline" }}>
                                click to browse
                            </button>
                        </div>
                        <div className="cs-file-upload__hint">
                            Supports logs, captures, images, documents, and more
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: "none" }}
                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    />
                </div>
            )}

            {inject.upload_status === "uploading" && (
                <div className="cs-file-upload__uploading">
                    <div>Uploading {inject.file_name}…</div>
                    <div className="cs-progress-bar" style={{ marginTop: "8px" }}>
                        <div className="cs-progress-bar__fill" style={{ animation: "pulse 1.5s infinite" }} />
                    </div>
                </div>
            )}

            {inject.upload_status === "error" && (
                <div className="cs-file-upload__error">
                    <div>❌ Upload failed for {inject.file_name}</div>
                    <button type="button" onClick={clearFile} style={{ marginTop: "8px", cursor: "pointer" }}>
                        Try again
                    </button>
                </div>
            )}

            {inject.upload_status === "done" && inject.file_name && (
                <div className="cs-file-upload__success">
                    <div className="cs-file-upload__file-info">
                        <div className="cs-file-upload__file-name">
                            ✓ {inject.file_name}
                        </div>
                        <div className="cs-file-upload__file-meta">
                            {inject.file_type} • {formatBytes(inject.file_size)}
                        </div>
                    </div>
                    <button type="button" onClick={clearFile} className="cs-icon-btn cs-icon-btn--danger">
                        ×
                    </button>
                </div>
            )}
        </div>
    );
}
