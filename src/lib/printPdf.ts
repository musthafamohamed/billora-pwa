/** Open the PDF itself so the browser's PDF viewer owns printing. */
export function openPdfForPrint(blob: Blob): 'opened' | 'blocked' | 'unsupported' {
  if (navigator.pdfViewerEnabled === false) return 'unsupported';
  const url = URL.createObjectURL(blob);
  let viewer: Window | null;
  try {
    viewer = window.open(url, '_blank');
    if (!viewer) {
      URL.revokeObjectURL(url);
      return 'blocked';
    }
    viewer.opener = null;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  // Keep the URL valid while the PDF is open, including later print/download
  // actions. The browser also releases it if the originating page is closed.
  const timer = window.setInterval(() => {
    if (viewer.closed) {
      window.clearInterval(timer);
      URL.revokeObjectURL(url);
    }
  }, 1000);
  return 'opened';
}
