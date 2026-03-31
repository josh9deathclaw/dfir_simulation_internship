import React, { useRef } from "react";
import { getToken } from "../../utils/auth";
import { API } from "../../utils/api";

const EXT_TYPE_MAP = {
    log: "Log File", txt: "Log File",
    pcap: "Network Capture", pcapng: "Network Capture", cap: "Network Capture",
    e01: "Disk Image", dd: "Disk Image", img: "Disk Image", raw: "Disk Image", vmdk: "Disk Image",
    mem: "Memory Dump", dmp: "Memory Dump",
    pdf: "PDF Document",
    mp4: "Video", avi: "Video", mov: "Video",
    jpg: "Image", jpeg: "Image", png: "Image",
    zip: "Archive", tar: "Archive", gz: "Archive", "7z": "Archive",
    docx: "Word Document", xlsx: "Spreadsheet", csv: "Spreadsheet",
    reg: "Registry Hive", evtx: "Event Log", lnk: "Shortcut File",
    ps1: "PowerShell Script", bat: "Batch Script", sh: "Shell Script", py: "Python Script",
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

// onUpdate(inject) — matches the pattern used by InjectRow and the rest of the wizard
export default function FileUploadZone({ inject, onUpdate }) {
    const inputRef = useRef(null);
    const token    = getToken();

    const handleFile = async (file) => {
        if (!file) return;

        // Immediately reflect file in UI
        onUpdate({ ...inject, file_name: file.name, file_type: detectFileType(file.name), file_size: file.size, upload_status: "uploading" });

        // Pre-fill title from filename if blank
        if (!inject.title) {
            onUpdate({ ...inject, title: file.name.replace(/\.[^.]+$/, "") });
        }

        // Upload to temp
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`${API}/uploads`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (!res.ok) throw new Error();
            const { file_path } = await res.json();

            onUpdate({ ...inject, file_path, upload_status: "done" });
        } catch {
            onUpdate({ ...inject, upload_status: "error" });
        }
    };

    const clear = () => {
        onUpdate({ ...inject, file_name: "", file_type: "", file_size: null, file_path: "", file_obj: null, upload_status: "idle" });
        if (inputRef.current) inputRef.current.value = "";
    };

    const { file_name, file_type, file_size, upload_status } = inject;
    const hasFile = upload_status !== "idle" && file_name;

    return (
        <div className="cs-upload">
            <input ref={inputRef} type="file" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])} />

            {!hasFile && (
                <div className="cs-upload__zone"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                >
                    Drop evidence file here or <span className="cs-upload__link">browse</span>
                    <span className="cs-upload__sub">Logs, pcaps, disk images, memory dumps…</span>
                </div>
            )}

            {upload_status === "uploading" && (
                <div className="cs-upload__status">
                    <span className="cs-upload__name">{file_name}</span>
                    <span className="cs-upload__label cs-upload__label--pending">Uploading…</span>
                </div>
            )}

            {upload_status === "error" && (
                <div className="cs-upload__status">
                    <span className="cs-upload__name">{file_name}</span>
                    <span className="cs-upload__label cs-upload__label--error">Upload failed</span>
                    <button className="cs-upload__clear" onClick={clear}>Try again</button>
                </div>
            )}

            {upload_status === "done" && (
                <div className="cs-upload__status">
                    <div className="cs-upload__file-info">
                        <span className="cs-upload__name">{file_name}</span>
                        <span className="cs-upload__meta">
                            <span className="cs-chip">{file_type}</span>
                            {file_size && <span className="cs-upload__size">{formatBytes(file_size)}</span>}
                        </span>
                    </div>
                    <div className="cs-upload__actions">
                        <span className="cs-upload__label cs-upload__label--done">✓ Uploaded</span>
                        <button className="cs-upload__clear" onClick={clear}>Remove</button>
                    </div>
                </div>
            )}
        </div>
    );
}