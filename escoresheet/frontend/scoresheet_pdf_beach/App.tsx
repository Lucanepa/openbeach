import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import OpenbeachScoresheet from './components_beach/eScoresheet_beach';

// Page dimensions - using actual scoresheet page dimensions
const TOTAL_PAGES = 3;

export default function App({ matchData }: { matchData?: any }) {
  const [zoom, setZoom] = useState(1);
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

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

      for (let i = 1; i <= TOTAL_PAGES; i++) {
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

    if (action === 'print') {
      // Wait for content to render, then print
      setTimeout(() => {
        window.print();
      }, 1500);
    } else if (action === 'save' || action === 'getBlob') {
      // Wait for content to render, then generate PDF
      setTimeout(() => {
        handleSavePDF(action === 'getBlob');
      }, 1500);
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
    if (currentPage > 1) {
      scrollToPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < TOTAL_PAGES) {
      scrollToPage(currentPage + 1);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSavePDF = async (returnBlob = false) => {
    setIsPdfGenerating(true);
    setPdfProgress('Preparing pages...');

    try {
      const page1 = document.getElementById('page-1');
      const page2 = document.getElementById('page-2');

      if (!page1 || !page2) {
        throw new Error('Could not find scoresheet pages');
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const options = {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc: Document) => {
          // Fix flex centering for html2canvas
          const elements = clonedDoc.querySelectorAll('[style*="display: flex"]');
          elements.forEach((el: Element) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.style.alignItems === 'center') {
              htmlEl.style.display = 'flex';
            }
          });
        }
      };

      // Generate page 1
      setPdfProgress('Rendering page 1...');
      const canvas1 = await html2canvas(page1, options);
      const imgData1 = canvas1.toDataURL('image/png');
      pdf.addImage(imgData1, 'PNG', 5, 5, 287, 200);

      // Generate page 2
      setPdfProgress('Rendering page 2...');
      pdf.addPage();
      const canvas2 = await html2canvas(page2, options);
      const imgData2 = canvas2.toDataURL('image/png');
      pdf.addImage(imgData2, 'PNG', 5, 5, 287, 200);

      setPdfProgress('Finalizing...');

      // Generate filename
      const matchNo = matchData?.match?.matchNumber || matchData?.match?.externalId || 'scoresheet';
      const filename = `beach_scoresheet_${matchNo}.pdf`;

      if (returnBlob) {
        // Return blob to parent window
        const pdfBlob = pdf.output('arraybuffer');
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'pdfBlob',
            arrayBuffer: pdfBlob,
            filename: filename
          }, '*');
        }
        setTimeout(() => window.close(), 500);
      } else {
        // Download the PDF
        pdf.save(filename);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsPdfGenerating(false);
      setPdfProgress('');
    }
  };

  const handleDownload = () => {
    handleSavePDF(false);
  };

  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div ref={containerRef} className="scoresheet-app h-screen flex flex-col bg-gray-200 overflow-hidden">
      {/* Toolbar - hidden in print */}
      <div className="scoresheet-toolbar flex items-center justify-between px-4 py-2 bg-gray-800 text-white print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium mr-2">Beach Volleyball eScoresheet</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Page Navigation */}
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            ◀
          </button>

          <span className="px-2 py-1.5 text-sm font-mono min-w-[60px] text-center">
            {currentPage} / {TOTAL_PAGES}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= TOTAL_PAGES}
            className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            ▶
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Fit to Page */}
          <button
            onClick={handleFitToPage}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isAutoFit
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
            title="Fit to page"
          >
            Fit
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
            title="Zoom out"
            disabled={zoom <= 0.3}
          >
            −
          </button>

          {/* Zoom Level */}
          <span className="px-3 py-1.5 text-sm font-mono min-w-[60px] text-center">
            {zoomPercentage}%
          </span>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
            title="Zoom in"
            disabled={zoom >= 2}
          >
            +
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Print */}
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors flex items-center gap-1"
            title="Print"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownload}
            disabled={isPdfGenerating}
            className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isPdfGenerating ? pdfProgress : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Scrollable content area with snap scrolling */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 print:p-0 print:overflow-visible"
        style={{
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth'
        }}
      >
        <div
          ref={contentRef}
          className="scoresheet-content mx-auto print:transform-none"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          <OpenbeachScoresheet matchData={matchData} />
        </div>
      </div>
    </div>
  );
}
