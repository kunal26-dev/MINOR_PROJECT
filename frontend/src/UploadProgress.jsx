export default function UploadProgress({ value }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="upload-progress">
      <div className="upload-progress-label"><span>Uploading…</span><span>{value}%</span></div>
      <progress aria-label="Upload progress" max="100" value={value}>{value}%</progress>
    </div>
  );
}
