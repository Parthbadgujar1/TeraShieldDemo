import React, { useState } from "react";
import api from "../services/api";
import * as Types from "../types";
import "../styles/AddTestVillageModal.css";
import "../styles/UploadVillagesPdfModal.css";

interface UploadVillagesPdfModalProps {
  districts: Types.District[];
  defaultDistrict: string | null;
  onClose: () => void;
  onCreated: (districtId: string) => void;
}

const UploadVillagesPdfModal: React.FC<UploadVillagesPdfModalProps> = ({
  districts,
  defaultDistrict,
  onClose,
  onCreated,
}) => {
  const [districtId, setDistrictId] = useState(defaultDistrict || districts[0]?.district_id || "");
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleDownloadSample = async () => {
    try {
      setDownloading(true);
      setError(null);
      const res = await api.testdata.downloadSamplePdf(districtId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `terashield_sample_${districtId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("Failed to download sample PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a .pdf file");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose a PDF file first");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await api.testdata.uploadVillagesPdf(districtId, file);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to process this PDF");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onCreated(districtId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel upload-pdf-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload Village Data (PDF)</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {!result ? (
          <div className="modal-body">
            <p className="modal-hint">
              Bulk-add test villages from a PDF: one row per village, name and population
              required, latitude/longitude/block optional (auto-placed within a real block of
              the district if you leave them out). Every created village runs through the same
              live hazard → exposure → vulnerability → relocation pipeline as every real
              village. In-memory only — cleared on server restart.
            </p>

            <label>
              District
              <select value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
                {districts.map((d) => (
                  <option key={d.district_id} value={d.district_id}>
                    {d.name} ({d.state})
                  </option>
                ))}
              </select>
            </label>

            <div className="sample-download-row">
              <div>
                <strong>Not sure of the format?</strong>
                <div className="sample-download-sub">
                  Download a ready-to-edit template with real block names/coordinates for this
                  district.
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={handleDownloadSample} disabled={downloading}>
                {downloading ? "Preparing…" : "⬇ Download Sample PDF"}
              </button>
            </div>

            <label>
              PDF file
              <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
            </label>
            {file && <div className="chosen-file">Selected: {file.name}</div>}

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleUpload} disabled={submitting || !file}>
                {submitting ? "Processing…" : "Upload & Process"}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="upload-summary">
              <div className="upload-summary-item created">
                <span className="upload-summary-value">{result.summary.created}</span>
                <span className="upload-summary-label">Created</span>
              </div>
              <div className="upload-summary-item skipped">
                <span className="upload-summary-value">{result.summary.skipped}</span>
                <span className="upload-summary-label">Skipped</span>
              </div>
              <div className="upload-summary-item failed">
                <span className="upload-summary-value">{result.summary.failed}</span>
                <span className="upload-summary-label">Failed</span>
              </div>
            </div>

            {result.created_villages.length > 0 && (
              <>
                <h3>Created Villages</h3>
                <div className="upload-created-list">
                  {result.created_villages.map((c: any) => (
                    <div key={c.village.village_id} className="upload-created-row">
                      <span className="uc-name">{c.village.name}</span>
                      <span className="uc-pop">{c.village.population.toLocaleString()} people</span>
                      <span className={`risk-badge ${c.risk_category.toLowerCase()}`}>{c.risk_category}</span>
                      <span className="uc-hazard">{c.dominant_hazard}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(result.skipped_rows.length > 0 || result.failed_rows.length > 0) && (
              <details className="upload-issues">
                <summary>
                  {result.skipped_rows.length + result.failed_rows.length} line(s) not used — click
                  to see why
                </summary>
                <div className="upload-issues-list">
                  {result.failed_rows.map((r: any, i: number) => (
                    <div key={`f${i}`} className="upload-issue-row failed">
                      <code>{r.raw_line}</code>
                      <span>{r.reason}</span>
                    </div>
                  ))}
                  {result.skipped_rows.map((r: any, i: number) => (
                    <div key={`s${i}`} className="upload-issue-row">
                      <code>{r.raw_line}</code>
                      <span>{r.reason}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={handleDone}>
                Done — show on the Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadVillagesPdfModal;
