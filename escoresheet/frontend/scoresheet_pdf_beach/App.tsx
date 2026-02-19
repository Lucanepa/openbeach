import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import OpenbeachScoresheet from './components_beach/eScoresheet_beach';

// Count actual pages in the DOM
const countPages = (): number => {
  let count = 0;
  while (document.getElementById(`page-${count + 1}`)) count++;
  return Math.max(count, 2); // At least 2 pages
};

export default function App({ matchData }: { matchData?: any }) {
  const [zoom, setZoom] = useState(1);
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  // Update total pages after render
  useEffect(() => {
    const timer = setTimeout(() => setTotalPages(countPages()), 200);
    return () => clearTimeout(timer);
  }, [matchData]);

  // Get page element by number
  const getPageElement = useCallback((pageNum: number) => {
    return document.getElementById(`page-${pageNum}`);
  }, []);

  // Calculate auto-fit zoom to fit a single page in viewport
  const calculateAutoFitZoom = useCallback(() => {
    if (!containerRef.current) return 1;

    const page1 = getPageElement(1);
    if (!page1) return 1;

    const containerWidth = containerRef.current.clientWidth - 48; // padding
    const containerHeight = containerRef.current.clientHeight - 80; // toolbar + padding

    // Use actual page dimensions
    const pageWidth = page1.offsetWidth;
    const pageHeight = page1.offsetHeight;

    const scaleX = containerWidth / pageWidth;
    const scaleY = containerHeight / pageHeight;

    return Math.min(scaleX, scaleY, 1.5); // Max zoom 1.5x
  }, [getPageElement]);

  // Scroll to a specific page using actual DOM element positions
  const scrollToPage = useCallback((pageNum: number) => {
    if (!scrollRef.current || !contentRef.current) return;

    const pageElement = getPageElement(pageNum);
    if (!pageElement) return;

    // Get the page's position relative to the scroll container
    const contentRect = contentRef.current.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();

    // Calculate offset within the scaled content
    const offsetInContent = (pageRect.top - contentRect.top) / zoom;

    scrollRef.current.scrollTo({
      top: offsetInContent * zoom,
      behavior: 'smooth'
    });

    setCurrentPage(pageNum);
  }, [zoom, getPageElement]);

  // Auto-fit on mount and resize
  useEffect(() => {
    const handleResize = () => {
      if (isAutoFit) {
        const newZoom = calculateAutoFitZoom();
        setZoom(newZoom);
      }
    };

    // Initial calculation after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      handleResize();
      // Scroll to first page on initial load
      scrollToPage(1);
    }, 100);

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isAutoFit, calculateAutoFitZoom, scrollToPage]);

  // Update current page based on scroll position using actual page positions
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    const content = contentRef.current;
    if (!scrollContainer || !content) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const containerMidpoint = scrollTop + scrollContainer.clientHeight / 2;

      // Find which page is most visible
      let closestPage = 1;
      let closestDistance = Infinity;

      for (let i = 1; i <= totalPages; i++) {
        const pageEl = getPageElement(i);
        if (!pageEl) continue;

        const contentRect = content.getBoundingClientRect();
        const pageRect = pageEl.getBoundingClientRect();
        const pageTop = ((pageRect.top - contentRect.top) / zoom) * zoom;
        const pageCenter = pageTop + (pageRect.height / 2);

        const distance = Math.abs(containerMidpoint - pageCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = i;
        }
      }

      if (closestPage !== currentPage) {
        setCurrentPage(closestPage);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [zoom, currentPage, getPageElement]);

  // Handle URL action parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    if (action === 'save' || action === 'getBlob' || action === 'print') {
      setTimeout(() => { handleSavePDF(action === 'getBlob'); }, 1500);
    }
  }, []);

  const handleFitToPage = () => {
    setIsAutoFit(true);
    const newZoom = calculateAutoFitZoom();
    setZoom(newZoom);
  };

  const handleZoomIn = () => {
    setIsAutoFit(false);
    setZoom(prev => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setIsAutoFit(false);
    setZoom(prev => Math.max(prev - 0.1, 0.3));
  };

  const handlePrevPage = () => {
    if (currentPage > 1) scrollToPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) scrollToPage(currentPage + 1);
  };

  // Generate PDF filename
  const generateFilename = () => {
    const match = matchData?.match;
    const team1Team = matchData?.team1Team || matchData?.team_1Team;
    const team2Team = matchData?.team2Team || matchData?.team_2Team;

    let dateStr = '';
    let timeStr = '';
    if (match?.scheduledAt) {
      const d = new Date(match.scheduledAt);
      dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      timeStr = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      const now = new Date();
      dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }

    const site = (match?.site || match?.city || '').replace(/[^a-zA-Z0-9]/g, '');
    const matchNo = match?.game_n || match?.matchNumber || match?.externalId || '';
    const country1 = (team1Team?.country || match?.team1Country || '').toUpperCase();
    const country2 = (team2Team?.country || match?.team2Country || '').toUpperCase();

    const parts = [dateStr, timeStr, site, matchNo ? `Match${matchNo}` : '', country1, country2].filter(Boolean);
    return `${parts.join('_')}.pdf`;
  };

  // Shared: prepare DOM for capture (reset zoom, make overflow visible, strip debug decorations)
  const prepareForCapture = async () => {
    const contentEl = contentRef.current;
    const scrollEl = scrollRef.current;
    if (!contentEl || !scrollEl) throw new Error('Content not found');

    const savedZoom = zoom;
    const savedScrollCss = scrollEl.style.cssText;
    const savedContentCss = contentEl.style.cssText;

    setZoom(1);
    await new Promise(resolve => setTimeout(resolve, 200));

    contentEl.style.transform = 'none';
    contentEl.style.transition = 'none';
    scrollEl.style.overflow = 'visible';
    scrollEl.style.scrollSnapType = 'none';

    await new Promise(resolve => setTimeout(resolve, 200));
    await document.fonts.ready;

    // Find all page elements
    const pages: HTMLElement[] = [];
    let pageNum = 1;
    while (document.getElementById(`page-${pageNum}`)) {
      pages.push(document.getElementById(`page-${pageNum}`)!);
      pageNum++;
    }
    if (pages.length === 0) throw new Error('No pages found');

    // Strip debug decorations from all pages
    const savedPageStyles: string[] = [];
    for (const page of pages) {
      savedPageStyles.push(page.style.cssText);
      page.style.overflow = 'visible';
      page.style.border = 'none';
      page.style.boxShadow = 'none';
      page.style.margin = '0';
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    return { contentEl, scrollEl, savedZoom, savedScrollCss, savedContentCss, pages, savedPageStyles };
  };

  // Shared: restore DOM after capture
  const restoreAfterCapture = (state: Awaited<ReturnType<typeof prepareForCapture>>) => {
    for (let i = 0; i < state.pages.length; i++) {
      state.pages[i].style.cssText = state.savedPageStyles[i];
    }
    state.contentEl.style.cssText = state.savedContentCss;
    state.scrollEl.style.cssText = state.savedScrollCss;
    setZoom(state.savedZoom);
  };

  // Shared: finish PDF (save or send blob to parent)
  const finishPDF = (pdf: any, returnBlob: boolean) => {
    const filename = generateFilename();
    if (returnBlob) {
      const pdfBlob = pdf.output('arraybuffer');
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'pdfBlob', arrayBuffer: pdfBlob, filename }, '*');
      }
      setTimeout(() => window.close(), 500);
    } else {
      pdf.save(filename);
    }
  };

  // Generate PDF using html2canvas (direct pixel-by-pixel canvas rendering — no SVG intermediary)
  const handleSavePDF = async (returnBlob = false) => {
    setIsPdfGenerating(true);
    setPdfProgress('Preparing...');

    try {
      const html2canvas = (await import('html2canvas')).default;
      const state = await prepareForCapture();

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      for (let i = 0; i < state.pages.length; i++) {
        if (i > 0) pdf.addPage();
        setPdfProgress(`Page ${i + 1} of ${state.pages.length}...`);

        const canvas = await html2canvas(state.pages[i], {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        });

        // Debug: save first page as PNG to inspect what html2canvas captures
        if (i === 0) {
          const debugUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = debugUrl;
          a.download = 'debug_page1_html2canvas.png';
          a.click();
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      }

      restoreAfterCapture(state);
      setPdfProgress('Finalizing...');
      finishPDF(pdf, returnBlob);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsPdfGenerating(false);
      setPdfProgress('');
    }
  };

  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div ref={containerRef} className="scoresheet-app h-screen flex flex-col bg-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="scoresheet-toolbar flex items-center justify-between px-4 py-2 bg-gray-800 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium mr-2">Beach Volleyball eScoresheet</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={handlePrevPage} disabled={currentPage <= 1}
            className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Previous page">
            ◀
          </button>
          <span className="px-2 py-1.5 text-sm font-mono min-w-[60px] text-center">{currentPage} / {totalPages}</span>
          <button onClick={handleNextPage} disabled={currentPage >= totalPages}
            className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Next page">
            ▶
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          <button onClick={handleFitToPage}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${isAutoFit ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Fit to page">
            Fit
          </button>
          <button onClick={handleZoomOut} disabled={zoom <= 0.3}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors" title="Zoom out">
            −
          </button>
          <span className="px-3 py-1.5 text-sm font-mono min-w-[60px] text-center">{zoomPercentage}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= 2}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors" title="Zoom in">
            +
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          <button onClick={() => handleSavePDF(false)} disabled={isPdfGenerating}
            className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Download PDF">
            {isPdfGenerating ? pdfProgress : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Scrollable content area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4"
        style={{ scrollSnapType: 'y mandatory', scrollBehavior: 'smooth' }}
      >
        <div
          ref={contentRef}
          className="scoresheet-content mx-auto"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          <OpenbeachScoresheet matchData={matchData} />
        </div>
      </div>

      {/* PDF Generating overlay */}
      {isPdfGenerating && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 99998,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '24px', animation: 'spin 1s linear infinite' }}>⏳</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Generating PDF...
          </h2>
          <p style={{ color: '#d1d5db', fontSize: '16px', maxWidth: '400px' }}>
            {pdfProgress || 'Please wait while the scoresheet is being converted to PDF.'}
          </p>
        </div>
      )}
    </div>
  );
}
