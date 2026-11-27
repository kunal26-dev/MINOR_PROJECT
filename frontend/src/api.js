const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export async function apiRequest(path, { token, method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) return {};
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof payload === 'object' && payload?.message
        ? payload.message
        : `Request failed with status ${response.status}`,
    );
    error.status = response.status;
    error.details = typeof payload === 'object' ? payload?.errors : undefined;
    if (response.status >= 500 && !contentType.includes('application/json')) {
      error.code = 'API_UNAVAILABLE';
    }
    throw error;
  }

  return payload?.data ?? payload;
}

export function getUploadFileError(file, allowedExtensions, maxSizeMb = 20) {
  if (!file) return 'Choose a file to upload.';
  if (file.size === 0) return 'This file is empty. Choose a file with content.';
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `This file is larger than the ${maxSizeMb} MB upload limit. Choose a smaller file.`;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension)) {
    return `Unsupported file format. Allowed formats: ${allowedExtensions.join(', ').toUpperCase()}.`;
  }
  return '';
}

export function uploadRequest(path, { token, method = 'POST', body, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, `${API_BASE}${path}`);
    request.setRequestHeader('Accept', 'application/json');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('error', () => {
      const error = new Error('The upload connection failed. Check your connection and try again.');
      error.code = 'API_UNAVAILABLE';
      reject(error);
    });
    request.addEventListener('load', () => {
      const contentType = request.getResponseHeader('content-type') || '';
      let payload;
      try {
        payload = contentType.includes('application/json')
          ? JSON.parse(request.responseText)
          : request.responseText;
      } catch {
        reject(new Error('The server returned an invalid response to the upload.'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(
          typeof payload === 'object' && payload?.message
            ? payload.message
            : `Upload failed with status ${request.status}`,
        );
        error.status = request.status;
        error.details = typeof payload === 'object' ? payload?.errors : undefined;
        if (request.status >= 500 && !contentType.includes('application/json')) {
          error.code = 'API_UNAVAILABLE';
        }
        reject(error);
        return;
      }
      resolve(payload?.data ?? payload);
    });
    request.send(body);
  });
}

export async function downloadResource(resource, token) {
  const response = await fetch(`${API_BASE}/resources/${resource._id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    let message = `Download failed with status ${response.status}`;
    const contentType = response.headers.get('content-type') || '';
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    if (response.status >= 500 && !contentType.includes('application/json')) {
      error.code = 'API_UNAVAILABLE';
    }
    throw error;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1];
  link.href = objectUrl;
  link.download = filename ? decodeURIComponent(filename.replace(/"/g, '')) : resource.originalFileName || 'resource';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadProtectedPdf(url, token, fallbackName = 'assignment.pdf') {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || `Download failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  link.href = objectUrl;
  link.download = filename || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
