import { useEffect, useState } from 'react';

export default function PdfPreview({ file }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!previewUrl) return null;
  return (
    <div className="pdf-preview">
      <strong>PDF preview</strong>
      <iframe title={`Preview of ${file.name}`} src={previewUrl} />
    </div>
  );
}
